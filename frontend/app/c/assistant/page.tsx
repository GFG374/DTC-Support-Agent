"use client";

import { useEffect, useRef, useState } from "react";
import supabase from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import { WavRecorder } from "@/lib/wavRecorder";
import OrderCards from "@/components/c/OrderCards";

type OrderData = {
  order_id: string;
  status?: string;
  status_cn?: string;
  shipping_status?: string;
  shipping_status_cn?: string;
  amount?: number;
  currency?: string;
  order_date?: string;
  products?: Array<{
    name?: string;
    quantity?: number;
    price?: number;
    sku?: string;
  }>;
  can_return?: boolean;
};

type Msg = {
  id: string;
  role: "user" | "assistant" | "agent" | "system" | "ai_voice";
  content: string;
  created_at?: string;
  updated_at?: string;
  conversation_id?: string;
  client_message_id?: string;
  audio_url?: string | null;
  transcript?: string | null;
  metadata?: { duration?: number; orders?: OrderData[] } | null;
  user_id?: string;
  orders?: OrderData[];
};

// 只去重，不排序（保持添加顺序）
// 同时从 metadata 中提取 orders
const dedupe = (arr: Msg[]) => {
  const map = new Map<string, Msg>();
  arr.forEach((m) => {
    // 从 metadata 中提取 orders 数据
    const orders = m.orders || m.metadata?.orders;
    map.set(m.id, { ...m, orders });
  });
  return Array.from(map.values());
};

const createMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const parseVoice = (msg: Msg) => {
  // 从 metadata 中获取时长
  let duration = msg.metadata?.duration || null;
  
  // 如果有 audio_url，这是语音消息
  if (msg.audio_url) {
    // 尝试从 content 中解析时长：[语音 X秒]
    if (!duration && msg.content) {
      const match = msg.content.match(/\[语音\s+(\d+)秒\]/);
      if (match) {
        duration = parseInt(match[1]);
      }
    }
    return { url: msg.audio_url, transcript: msg.transcript, duration };
  }
  
  // 兼容旧格式 VOICE|url|duration
  if (msg.role === "ai_voice" && msg.content.startsWith("VOICE|")) {
    const parts = msg.content.split("|");
    const url = parts[1] || null;
    const durationOrTranscript = parts[2] || null;
    const parsedDuration = durationOrTranscript && !isNaN(Number(durationOrTranscript)) ? Number(durationOrTranscript) : null;
    const transcript = parsedDuration ? null : durationOrTranscript;
    return { url, transcript, duration: parsedDuration };
  }
  
  return null;
};

const formatSystemContent = (content: string) => {
  if (content.startsWith("TRANSFER_TO_HUMAN:")) {
    return "已为您转接人工客服，请稍候～";
  }
  return content;
};

export default function AssistantPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationStatus, setConversationStatus] = useState<"ai" | "pending_agent" | "agent" | "closed">("ai");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isCanceling, setIsCanceling] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [userProfile, setUserProfile] = useState<{ display_name?: string; avatar_url?: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string; audioUrl?: string } | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // 多选模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 客服头像缓存：user_id -> avatar_url
  const [agentAvatars, setAgentAvatars] = useState<Record<string, string | null>>({});
  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartYRef = useRef<number>(0);
  const isCancelingRef = useRef(false);
  const recordingTimeRef = useRef(0);

  // 关闭右键菜单的全局监听
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // 删除单条消息
  const handleDeleteMessage = async (messageId: string) => {
    if (!session?.access_token) return;
    try {
      const { error } = await supabase.from("messages").delete().eq("id", messageId);
      if (error) throw error;
      setMessages(prev => prev.filter(m => m.id !== messageId));
      const cacheKey = `messages_${conversationId}`;
      setMessages(prev => {
        try { localStorage.setItem(cacheKey, JSON.stringify(prev.filter(m => m.id !== messageId))); } catch {}
        return prev;
      });
    } catch (err) {
      console.error("删除消息失败", err);
      setError("删除消息失败");
    }
    setContextMenu(null);
  };

  // 批量删除消息
  const handleDeleteSelected = async () => {
    if (!session?.access_token || selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("messages").delete().in("id", ids);
      if (error) throw error;
      setMessages(prev => {
        const filtered = prev.filter(m => !selectedIds.has(m.id));
        const cacheKey = `messages_${conversationId}`;
        try { localStorage.setItem(cacheKey, JSON.stringify(filtered)); } catch {}
        return filtered;
      });
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch (err) {
      console.error("批量删除失败", err);
      setError("批量删除失败");
    }
  };

  // 切换选中状态
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 进入多选模式
  const enterSelectMode = (firstId?: string) => {
    setSelectMode(true);
    if (firstId) setSelectedIds(new Set([firstId]));
    setContextMenu(null);
  };

  // 退出多选模式
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // 关闭右键菜单的全局监听
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const sess = data.session;
      setSession(sess);
      if (!sess?.user) return;
      
      // 加载用户信息
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name, avatar_url")
        .eq("user_id", sess.user.id)
        .single();
      if (profile) {
        setUserProfile(profile);
      }
      
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", sess.user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (convs && convs.length > 0) {
        setConversationId(convs[0].id);
      } else {
        const { data: created, error } = await supabase
          .from("conversations")
          .insert({ user_id: sess.user.id, title: "会话" })
          .select("id")
          .single();
        if (error) {
          setError(error.message);
          return;
        }
        if (created) setConversationId(created.id);
      }
    });
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let isMounted = true;

    const loadStatus = async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("status")
        .eq("id", conversationId)
        .single();
      if (!isMounted) return;
      if (!error && data?.status) {
        setConversationStatus(data.status);
      }
    };
    loadStatus();

    const statusChannel = supabase
      .channel(`c-conv-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as { status?: string };
          if (updated?.status) {
            setConversationStatus(updated.status as typeof conversationStatus);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(statusChannel);
    };
  }, [conversationId]);

  // 消息加载和实时订阅
  useEffect(() => {
    if (!conversationId) return;
    
    let isMounted = true;
    const loadedMsgIds = new Set<string>();
    const cacheKey = `chat_messages_${conversationId}`;
    
    const load = async () => {
      let cachedMsgs: Msg[] = [];
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          cachedMsgs = JSON.parse(cached) as Msg[];
          cachedMsgs.forEach(m => loadedMsgIds.add(m.id));
          setMessages(dedupe(cachedMsgs));
        }
      } catch (e) {
        console.warn("Cache read failed:", e);
      }

      // Load from Supabase
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      
      if (!isMounted) return;
      
      if (!error && data) {
        const normalized = (data as Msg[]).map((row) => ({
          ...row,
          orders: row.orders || row.metadata?.orders,
        }));
        normalized.forEach((m) => loadedMsgIds.add(m.id));
        const merged = dedupe(normalized);
        setMessages(merged);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(merged));
        } catch (e) {
          console.warn("Cache write failed:", e);
        }
      }
    };
    load();

    // 实时订阅 - 接收所有新消息，使用 ID 去重
    const channel = supabase
      .channel(`c-msgs-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (!isMounted) return;

          const rawRow = payload.new as Msg | undefined;
          if (!rawRow) return;
          const newRow = { ...rawRow, orders: rawRow.orders || rawRow.metadata?.orders };

          if (payload.eventType === "UPDATE") {
            loadedMsgIds.add(newRow.id);
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === newRow.id);
              const updated = existing
                ? prev.map((m) => (m.id === newRow.id ? { ...m, ...newRow } : m))
                : [...prev, newRow];
              try {
                localStorage.setItem(cacheKey, JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
            return;
          }

          if (payload.eventType === "INSERT") {
            if (loadedMsgIds.has(newRow.id)) return;
            loadedMsgIds.add(newRow.id);
            setMessages((prev) => {
              if (prev.some((m) => m.id === newRow.id)) return prev;
              const updated = [...prev, newRow];
              try {
                localStorage.setItem(cacheKey, JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log("C端 Realtime 订阅状态:", status);
      });

    const pollInterval = setInterval(async () => {
      if (!isMounted) return;
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error || !data) return;
      const fetched = (data as Msg[]).map((row) => ({
        ...row,
        orders: row.orders || row.metadata?.orders,
      }));

      setMessages((prev) => {
        if (fetched.length === 0) return prev;
        const prevMap = new Map(prev.map((m) => [m.id, m]));
        let changed = false;
        const merged = fetched.map((msg) => {
          const existing = prevMap.get(msg.id);
          if (!existing) {
            changed = true;
            return msg;
          }
          if (
            existing.content !== msg.content ||
            existing.role !== msg.role ||
            existing.updated_at !== msg.updated_at ||
            existing.transcript !== msg.transcript
          ) {
            changed = true;
            return { ...existing, ...msg };
          }
          return existing;
        });
        if (!changed && merged.length === prev.length) return prev;
        merged.sort((a, b) => {
          const at = new Date(a.created_at || 0).getTime();
          const bt = new Date(b.created_at || 0).getTime();
          return at - bt;
        });
        try {
          localStorage.setItem(cacheKey, JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [conversationId, refreshTick]);

  // 加载客服头像
  useEffect(() => {
    const loadAgentAvatars = async () => {
      // 找出所有 agent 消息的 user_id
      const agentUserIds = messages
        .filter(m => m.role === 'agent' && m.user_id && !agentAvatars[m.user_id])
        .map(m => m.user_id!)
        .filter((v, i, a) => a.indexOf(v) === i); // 去重
      
      if (agentUserIds.length === 0) return;
      
      // 查询这些客服的头像
      const { data } = await supabase
        .from('user_profiles')
        .select('user_id, avatar_url')
        .in('user_id', agentUserIds);
      
      if (data && data.length > 0) {
        setAgentAvatars(prev => {
          const updated = { ...prev };
          data.forEach(p => {
            updated[p.user_id] = p.avatar_url;
          });
          return updated;
        });
      }
    };
    
    loadAgentAvatars();
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // 转写语音
  const handleTranscribe = async (messageId: string, audioUrl: string) => {
    if (!session?.access_token) return;
    
    setTranscribing(true);
    setContextMenu(null);
    
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message_id: messageId,
          audio_url: audioUrl,
        }),
      });
      
      const result = await response.json();
      
      if (result.success && result.transcript) {
        // 更新本地消息列表
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, transcript: result.transcript } 
            : msg
        ));
      } else {
        setError(result.message || "转写失败");
      }
    } catch (err) {
      console.error("转写错误:", err);
      setError("转写失败，请稍后重试");
    } finally {
      setTranscribing(false);
    }
  };

  const sendText = async () => {
    if (!input.trim() || !conversationId || !session?.user) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    setError(null);
    
    const cacheKey = `chat_messages_${conversationId}`;
    const messageId = createMessageId();
    const userMsg: Msg = {
      id: messageId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
      conversation_id: conversationId ?? undefined,
      user_id: session.user.id,
      client_message_id: messageId,
    };
    
    // 1. Show user message immediately
    setMessages((prev) => {
      const updated = [...prev, userMsg];
      try {
        localStorage.setItem(cacheKey, JSON.stringify(updated));
      } catch (e) {
        console.warn("Cache update failed:", e);
      }
      return updated;
    });
    
    try {
      // 2. Persist user message with client ID
      const messageData: any = {
        id: messageId,
        client_message_id: messageId,
        user_id: session.user.id,
        role: "user",
        content: text,
      };
      if (conversationId) {
        messageData.conversation_id = conversationId;
      }
      const insertResult = await supabase
        .from("messages")
        .upsert(messageData)
        .select()
        .single();
      
      if (insertResult.error) {
        console.error("User message insert failed:", insertResult.error);
        setError("消息发送失败");
        setMessages((prev) => {
          const filtered = prev.filter(m => m.id !== messageId);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(filtered));
          } catch (e) {}
          return filtered;
        });
        setSending(false);
        return;
      }
      
      if (insertResult.data) {
        const realMsg = insertResult.data as Msg;
        setMessages((prev) => {
          const updated = prev.map(m => m.id === messageId ? { ...m, ...realMsg } : m);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }
      
        // 3. Call AI; reply is persisted by client
        const isHumanMode = conversationStatus === "agent";
        if (isHumanMode) {
          return;
        }

        const aiMessageId = createMessageId();
      const aiTempMsg: Msg = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      };
      
      setMessages((prev) => {
        const updated = [...prev, aiTempMsg];
        try {
          localStorage.setItem(cacheKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      
      const response = await fetch("/api/chat-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session ? `Bearer ${session.access_token}` : "",
        },
        body: JSON.stringify({
          conversation_id: conversationId ?? undefined,
          message: text,
          assistant_message_id: aiMessageId,
        }),
      });
      
      if (!response.ok) {
        setError("AI 回复接口失败");
        setMessages((prev) => {
          const filtered = prev.filter(m => m.id !== aiMessageId);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(filtered));
          } catch (e) {}
          return filtered;
        });
        setSending(false);
        return;
      }
      
      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiContent = '';
      let skipAI = false;
      let orderData: OrderData[] = [];
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.skip) {
                  skipAI = true;
                  break;
                }

                // 处理 tool_data（订单数据）
                if (data.tool_data?.orders) {
                  orderData = data.tool_data.orders;
                  // 立即更新消息以显示订单卡片
                  setMessages((prev) => {
                    const updated = prev.map(m => 
                      m.id === aiMessageId ? { ...m, orders: orderData } : m
                    );
                    return updated;
                  });
                }
                
                if (data.content) {
                  aiContent += data.content;
                  setMessages((prev) => {
                    const updated = prev.map(m => 
                      m.id === aiMessageId ? { ...m, content: aiContent, orders: orderData.length > 0 ? orderData : m.orders } : m
                    );
                    try {
                      localStorage.setItem(cacheKey, JSON.stringify(updated));
                    } catch (e) {}
                    return updated;
                  });
                }
                
                if (data.done) {
                  // 保存消息到数据库，包含订单数据到 metadata
                  const messageData: any = {
                    id: aiMessageId,
                    client_message_id: aiMessageId,
                    user_id: session.user.id,
                    role: "assistant",
                    content: aiContent,
                  };
                  if (conversationId) {
                    messageData.conversation_id = conversationId;
                  }
                  if (orderData.length > 0) {
                    messageData.metadata = { orders: orderData };
                  }
                  const aiInsertResult = await supabase
                    .from("messages")
                    .upsert(messageData)
                    .select()
                    .single();
                  
                  if (aiInsertResult.data) {
                    const realAiMsg = aiInsertResult.data as Msg;
                    // 保留订单数据
                    setMessages((prev) => {
                      const updated = prev.map(m => m.id === aiMessageId ? { ...m, ...realAiMsg, orders: orderData.length > 0 ? orderData : m.orders } : m);
                      try {
                        localStorage.setItem(cacheKey, JSON.stringify(updated));
                      } catch (e) {}
                      return updated;
                    });
                  }
                  break;
                }
              } catch (e) {
                // Skip parse errors
              }
            }
          }
          if (skipAI) break;
        }
      }
      if (skipAI) {
        setMessages((prev) => prev.filter(m => m.id !== aiMessageId));
        return;
      }
    } catch (err) {
      console.error("chat api error", err);
      setError("AI 回复接口失败");
    } finally {
      setSending(false);
    }
  };

  const handleClearCache = () => {
    if (!conversationId) return;
    const cacheKey = `chat_messages_${conversationId}`;
    try {
      localStorage.removeItem(cacheKey);
    } catch (e) {}
    setMessages([]);
    setError(null);
    setRefreshTick((prev) => prev + 1);
  };

  const handlePressStart = async (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); // 防止默认行为
    if (!conversationId || !session?.user) return;
    
    // 记录起始Y坐标
    if ('touches' in e) {
      touchStartYRef.current = e.touches[0].clientY;
    } else {
      touchStartYRef.current = (e as React.MouseEvent).clientY;
    }

    isCancelingRef.current = false;
    setIsCanceling(false);
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持录音");
      return;
    }

    try {
      // 使用 WavRecorder 录制 WAV 格式
      const recorder = new WavRecorder();
      wavRecorderRef.current = recorder;
      await recorder.start();
      
      setRecording(true);

      // 开始计时
      recordingTimerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);
      }, 1000);

    } catch (err) {
      console.error("录音启动失败", err);
      setError("无法访问麦克风");
    }
  };

  // 松开手指/鼠标 - 停止录音并上传
  const handlePressEnd = async () => {
    console.log("handlePressEnd called, recording:", recording);
    
    // 立即清除计时器
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (!recording || !wavRecorderRef.current) {
      console.log("Not recording or no wavRecorder");
      setRecording(false);
      return;
    }

    // 检查是否取消
    if (isCancelingRef.current) {
      wavRecorderRef.current.cancel();
      wavRecorderRef.current = null;
      setRecording(false);
      setIsCanceling(false);
      recordingTimeRef.current = 0;
      return;
    }

    // 停止录音并获取 WAV blob (异步)
    const blob = await wavRecorderRef.current.stop();
    wavRecorderRef.current = null;
    setRecording(false);
    
    if (!blob || blob.size === 0) {
      console.log("No audio data recorded");
      recordingTimeRef.current = 0;
      return;
    }

    const fileName = `voice-${Date.now()}.wav`;
    const duration = recordingTimeRef.current;
    let publicUrl: string | null = null;

    try {
      console.log("Uploading WAV voice file:", fileName, "size:", blob.size);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("voice-messages")
        .upload(fileName, blob, {
          contentType: "audio/wav",
          upsert: false
        });
      
      if (uploadError) {
        console.error("Upload error:", uploadError);
        setError(`语音上传失败: ${uploadError.message}`);
      } else if (uploadData?.path) {
        publicUrl = supabase.storage.from("voice-messages").getPublicUrl(uploadData.path).data.publicUrl;
        console.log("Upload success, URL:", publicUrl);
      }
    } catch (err: any) {
      console.error("upload voice error", err);
      setError(`语音上传失败: ${err.message || "未知错误"}`);
    }

    // 无论上传成功与否，都发送消息
    if (publicUrl && session?.user) {
      const cacheKey = `chat_messages_${conversationId}`;
      
      // Prepare voice message
      const messageId = createMessageId();
      const userMsg: Msg = {
        id: messageId,
        role: 'user',
        content: `[语音 ${duration}秒]`,
        audio_url: publicUrl,
        created_at: new Date().toISOString(),
        conversation_id: conversationId ?? undefined,
        user_id: session.user.id,
        client_message_id: messageId,
      };
      
      // Show voice message immediately
      setMessages((prev) => {
        const updated = [...prev, userMsg];
        try {
          localStorage.setItem(cacheKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      
      // Persist voice message
      const voiceData: any = {
        id: messageId,
        client_message_id: messageId,
        user_id: session.user.id,
        role: "user",
        content: `[语音 ${duration}秒]`,
        audio_url: publicUrl,
      };
      if (conversationId) {
        voiceData.conversation_id = conversationId;
      }
      const insertResult = await supabase
        .from("messages")
        .upsert(voiceData)
        .select()
        .single();

      if (insertResult.error) {
        console.error("插入消息失败:", insertResult.error);
        setError("发送失败");
        setMessages((prev) => {
          const filtered = prev.filter(m => m.id !== messageId);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(filtered));
          } catch (e) {}
          return filtered;
        });
        return;
      }

      if (insertResult.data) {
        const realMsg = insertResult.data as Msg;
        setMessages((prev) => {
          const updated = prev.map(m => m.id === messageId ? { ...m, ...realMsg } : m);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }

      if (messageId && publicUrl) {
        fetch("/api/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            message_id: messageId,
            audio_url: publicUrl,
          }),
        }).catch(err => console.error("自动转写失败:", err));
      }

      // 4. 调用AI，使用流式响应
      const aiMessageId = createMessageId();
      const aiTempMsg: Msg = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      };
      
      // 添加空的AI消息作为占位符
      setMessages((prev) => {
        const updated = [...prev, aiTempMsg];
        try {
          localStorage.setItem(cacheKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      
      try {
        const response = await fetch("/api/chat-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: session ? `Bearer ${session.access_token}` : "",
          },
          body: JSON.stringify({
            conversation_id: conversationId ?? undefined,
            audio_url: publicUrl,
            is_voice: true,
            assistant_message_id: aiMessageId,
          }),
        });
        
        if (!response.ok) {
          setError("AI 回复接口失败");
          setMessages((prev) => {
            const filtered = prev.filter(m => m.id !== aiMessageId);
            try {
              localStorage.setItem(cacheKey, JSON.stringify(filtered));
            } catch (e) {}
            return filtered;
          });
          return;
        }
        
        // 读取流式数据
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let aiContent = '';
        let skipAI = false;
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (data.skip) {
                    skipAI = true;
                    break;
                  }
                  
                  if (data.content) {
                    // 逐步更新AI回复内容
                    aiContent += data.content;
                    setMessages((prev) => {
                      const updated = prev.map(m => 
                        m.id === aiMessageId ? { ...m, content: aiContent } : m
                      );
                      try {
                        localStorage.setItem(cacheKey, JSON.stringify(updated));
                      } catch (e) {}
                      return updated;
                    });
                  }
                  
                  if (data.done) {
                    // 流式响应完成，将AI消息入库
                    const aiData: any = {
                      id: aiMessageId,
                      client_message_id: aiMessageId,
                      user_id: session.user.id,
                      role: "assistant",
                      content: aiContent,
                    };
                    if (conversationId) {
                      aiData.conversation_id = conversationId;
                    }
                    const aiInsertResult = await supabase
                      .from("messages")
                      .upsert(aiData)
                      .select()
                      .single();
                    
                    if (aiInsertResult.data) {
                      const realAiMsg = aiInsertResult.data as Msg;
                      setMessages((prev) => {
                        const updated = prev.map(m => m.id === aiMessageId ? { ...m, ...realAiMsg } : m);
                        try {
                          localStorage.setItem(cacheKey, JSON.stringify(updated));
                        } catch (e) {}
                        return updated;
                      });
                    }
                    break;
                  }
                } catch (e) {
                  // 跳过解析错误
                }
              }
            }
            if (skipAI) break;
          }
        }
        if (skipAI) {
          setMessages((prev) => prev.filter(m => m.id !== aiMessageId));
          return;
        }
      } catch (err) {
        console.error("AI voice reply error:", err);
        setError("AI 回复接口失败");
        setMessages((prev) => prev.filter(m => m.id !== aiMessageId));
      }
    } else if (session?.user) {
      // 上传失败，发送文本消息"[语音消息]"
      const cacheKey = `chat_messages_${conversationId}`;
      const messageId = createMessageId();
      const userMsg: Msg = {
        id: messageId,
        role: "user",
        content: "[语音消息]",
        created_at: new Date().toISOString(),
        conversation_id: conversationId ?? undefined,
        user_id: session.user.id,
        client_message_id: messageId,
      };
      
      setMessages((prev) => {
        const updated = [...prev, userMsg];
        try {
          localStorage.setItem(cacheKey, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      
      const placeholderData: any = {
        id: messageId,
        client_message_id: messageId,
        user_id: session.user.id,
        role: "user",
        content: "[语音消息]",
      };
      if (conversationId) {
        placeholderData.conversation_id = conversationId;
      }
      const insertResult = await supabase
        .from("messages")
        .upsert(placeholderData)
        .select()
        .single();
      
      if (insertResult.data) {
        const realMsg = insertResult.data as Msg;
        setMessages((prev) => {
          const updated = prev.map(m => m.id === messageId ? { ...m, ...realMsg } : m);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      }
      
        await new Promise(resolve => setTimeout(resolve, 1000));

        const isHumanMode = conversationStatus === "agent";
        if (isHumanMode) {
          return;
        }

        await fetch("/api/chat-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: session ? `Bearer ${session.access_token}` : "",
        },
        body: JSON.stringify({ 
          conversation_id: conversationId ?? undefined, 
          message: "[用户发送了语音消息]"
        }),
      }).catch(() => setError("AI 回复接口失败"));
    }

    setRecordingTime(0);
  };

  // 在组件挂载时添加全局事件监听
  useEffect(() => {
    if (!recording) return;

    const handleGlobalMouseUp = () => {
      console.log("Global mouseup detected");
      handlePressEnd();
    };

    const handleGlobalTouchEnd = () => {
      console.log("Global touchend detected");
      handlePressEnd();
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const currentY = e.clientY;
      const distance = touchStartYRef.current - currentY;
      
      if (distance > 80) {
        isCancelingRef.current = true;
        setIsCanceling(true);
      } else {
        isCancelingRef.current = false;
        setIsCanceling(false);
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const currentY = e.touches[0].clientY;
        const distance = touchStartYRef.current - currentY;
        
        if (distance > 80) {
          isCancelingRef.current = true;
          setIsCanceling(true);
        } else {
          isCancelingRef.current = false;
          setIsCanceling(false);
        }
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    document.addEventListener('touchend', handleGlobalTouchEnd);
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('touchmove', handleGlobalTouchMove);

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('touchmove', handleGlobalTouchMove);
    };
  }, [recording]); // 只依赖 recording

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-[fadeIn_0.3s_ease-out]">
      <div className="h-[64px] bg-white border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <circle cx="12" cy="5" r="2"/>
              <path d="M12 7v4"/>
              <line x1="8" y1="16" x2="8" y2="16"/>
              <line x1="16" y1="16" x2="16" y2="16"/>
            </svg>
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900">智能客服</div>
            <div className="text-[11px] text-green-600 flex items-center gap-1">● 在线 · 实时回复</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversationId && (
            <span className="text-[11px] text-slate-400 border border-slate-200 rounded-full px-2 py-0.5">
              会话 {conversationId.slice(0, 8)}
            </span>
          )}
          <button
            onClick={handleClearCache}
            className="text-xs text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full hover:bg-slate-50"
          >
            清空缓存
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm text-sm text-slate-700">
            <div className="font-semibold text-slate-900 mb-2">开始对话</div>
            <div className="text-xs text-slate-500 mb-3">告诉我你的问题，例如物流查询、退换货、尺码建议，或直接点击下方快捷问题。</div>
            <div className="flex gap-2 flex-wrap">
              {["我要退货", "我的快递到哪了", "尺码咨询"].map((chip, i) => (
                <button
                  key={i}
                  onClick={() => setInput(chip)}
                  className="text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 hover:bg-slate-100"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.role === "system") {
            const display = formatSystemContent(msg.content);
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="px-4 py-2 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                  {display}
                </div>
              </div>
            );
          }
          const voice = parseVoice(msg);
          const isUserSide = msg.role === "user" || msg.role === "ai_voice";
          const agentAvatar = msg.role === "agent" && msg.user_id ? agentAvatars[msg.user_id] : null;
          const isSelected = selectedIds.has(msg.id);
          return (
            <div 
              key={msg.id} 
              className={`flex gap-2 ${isUserSide ? "justify-end" : "justify-start"} mb-3 ${selectMode ? 'cursor-pointer' : ''}`}
              onClick={() => selectMode && toggleSelect(msg.id)}
              onContextMenu={(e) => {
                if (selectMode) return;
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, messageId: msg.id, audioUrl: voice?.url || undefined });
              }}
            >
              {/* 多选模式下的复选框 */}
              {selectMode && (
                <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center self-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 bg-white'}`}>
                  {isSelected && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </div>
              )}
              {/* 头像（左侧） */}
              {!isUserSide && (
                msg.role === "assistant" ? (
                  // AI 消息 - 显示机器人头像
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="10" rx="2"/>
                      <circle cx="12" cy="5" r="2"/>
                      <path d="M12 7v4"/>
                      <line x1="8" y1="16" x2="8" y2="16"/>
                      <line x1="16" y1="16" x2="16" y2="16"/>
                    </svg>
                  </div>
                ) : msg.role === "agent" ? (
                  // 客服消息 - 显示客服真实头像
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-green-500 flex items-center justify-center text-white shadow-md overflow-hidden">
                    {agentAvatar ? (
                      <img src={agentAvatar} alt="客服" className="w-full h-full object-cover" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    )}
                  </div>
                ) : null
              )}
              
              <div
                className={`max-w-[82%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-line ${
                  // 用户消息：黑底白字；AI/客服：白底深色字
                  isUserSide
                    ? "bg-black text-white rounded-br-none"
                    : "bg-white text-slate-900 border border-slate-200 rounded-bl-none"
                } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
              >
                {voice ? (
                  <div 
                    className="space-y-2 min-w-[180px]"
                    onContextMenu={(e) => {
                      if (voice.url) {
                        e.preventDefault();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          messageId: msg.id,
                          audioUrl: voice.url
                        });
                      }
                    }}
                  >
                    {/* 自定义播放器 */}
                    {voice.url && (
                      <div className="flex items-center gap-3">
                        {/* 播放按钮 */}
                        <button
                          onClick={(e) => {
                            const btn = e.currentTarget;
                            const audio = btn.nextElementSibling as HTMLAudioElement;
                            if (audio && audio instanceof HTMLAudioElement) {
                              if (audio.paused) {
                                audio.play();
                                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
                              } else {
                                audio.pause();
                                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                              }
                            }
                          }}
                          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 ${
                            isUserSide ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-md hover:shadow-lg'
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </button>
                        
                        {/* 隐藏的audio元素 */}
                        <audio 
                          src={voice.url} 
                          className="hidden" 
                          preload="metadata"
                          onEnded={(e) => {
                            const audio = e.currentTarget;
                            const btn = audio.previousElementSibling as HTMLButtonElement;
                            if (btn) {
                              btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                            }
                          }}
                        ></audio>
                        
                        {/* 波形动画 */}
                        <div className="flex gap-0.5 items-center flex-1">
                          {[...Array(20)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-0.5 rounded-full ${isUserSide ? 'bg-white/40' : 'bg-green-500/40'}`}
                              style={{
                                height: `${10 + (i % 4) * 3}px`,
                              }}
                            />
                          ))}
                        </div>
                        
                        {/* 时长显示 */}
                        {voice.duration && (
                          <span className={`text-xs flex-shrink-0 ${isUserSide ? 'text-white/70' : 'text-slate-500'}`}>
                            {voice.duration}"
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* 转写文本 */}
                    {voice.transcript && voice.transcript !== "语音转写功能待接入" && (
                      <div className={`text-xs mt-2 p-2 rounded ${isUserSide ? 'bg-white/10' : 'bg-slate-50'}`}>
                        <div className="opacity-70 mb-0.5">转写：</div>
                        <div>{voice.transcript}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* 如果有订单卡片，只显示卡片，不显示文字 */}
                    {msg.orders && msg.orders.length > 0 ? (
                      <OrderCards orders={msg.orders} />
                    ) : (
                      msg.content
                    )}
                  </>
                )}
              </div>
              
              {/* 用户头像（右侧） */}
              {isUserSide && (
                <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md">
                  {userProfile?.avatar_url ? (
                    <img src={userProfile.avatar_url} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-bold">
                      {userProfile?.display_name?.[0]?.toUpperCase() || session?.user?.email?.[0]?.toUpperCase() || "U"}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white border-t p-3 pb-4 safe-bottom sticky bottom-0 left-0 right-0">
        {!recording ? (
          <>
            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
              {["我要退货", "我的快递到哪了", "尺码咨询"].map((chip, i) => (
                <button
                  key={i}
                  onClick={() => setInput(chip)}
                  className="whitespace-nowrap bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full text-xs text-slate-600 hover:bg-slate-100"
                >
                  {chip}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              {/* 左侧：语音/键盘切换按钮 */}
              <button
                onClick={() => setVoiceMode(!voiceMode)}
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors flex-shrink-0"
              >
                {voiceMode ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                )}
              </button>

              {/* 中间：输入框 或 按住说话按钮 */}
              {voiceMode ? (
                <button
                  onTouchStart={handlePressStart}
                  onMouseDown={handlePressStart}
                  className="flex-1 bg-slate-100 rounded-full px-4 h-10 text-sm font-medium text-slate-700 active:bg-slate-200 transition-colors select-none"
                >
                  按住说话
                </button>
              ) : (
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm outline-none"
                  placeholder="输入消息..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendText();
                    }
                  }}
                />
              )}

              {/* 右侧：发送按钮 */}
              <button
                onClick={sendText}
                disabled={sending || !input.trim()}
                className="bg-black text-white w-10 h-10 rounded-full flex items-center justify-center shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-6 space-y-4">
            <div className={`text-sm font-medium transition-colors ${isCanceling ? 'text-red-500' : 'text-slate-700'}`}>
              {isCanceling ? '🚫 松开取消' : '🎤 松开发送，上滑取消'}
            </div>
            
            {/* 录音时长 */}
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full animate-pulse ${isCanceling ? 'bg-red-500' : 'bg-green-500'}`}></div>
              <span className="text-3xl font-mono font-bold text-slate-900">{recordingTime}"</span>
            </div>
            
            {/* 波形动画 */}
            <div className="flex gap-1 items-end h-16">
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all ${isCanceling ? 'bg-red-400' : 'bg-gradient-to-t from-green-500 to-emerald-400'}`}
                  style={{
                    height: `${20 + Math.sin(i * 0.5 + Date.now() / 200) * 25}px`,
                    animation: `pulse ${0.8 + (i % 3) * 0.2}s ease-in-out infinite`,
                    animationDelay: `${i * 0.05}s`
                  }}
                />
              ))}
            </div>
            
            {isCanceling && (
              <div className="text-xs text-red-500 animate-bounce flex items-center gap-1">
                <span>⬆️</span>
                <span>继续上滑取消录音</span>
              </div>
            )}
          </div>
        )}
        {error && <div className="text-xs text-rose-500 mt-2">{error}</div>}
      </div>

      {/* 多选模式下的底部操作栏 */}
      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 flex items-center justify-between z-50 safe-bottom">
          <button
            onClick={exitSelectMode}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
          >
            取消
          </button>
          <span className="text-sm text-slate-500">已选择 {selectedIds.size} 条消息</span>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            删除
          </button>
        </div>
      )}
      
      {/* 右键菜单 */}
      {contextMenu && !selectMode && (
        <div
          className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 语音转文字（仅语音消息显示） */}
          {contextMenu.audioUrl && (
            <button
              onClick={() => handleTranscribe(contextMenu.messageId, contextMenu.audioUrl!)}
              disabled={transcribing}
              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
              {transcribing ? "转写中..." : "语音转文字"}
            </button>
          )}
          {/* 多选 */}
          <button
            onClick={() => enterSelectMode(contextMenu.messageId)}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4"></polyline>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            多选
          </button>
          {/* 删除 */}
          <button
            onClick={() => handleDeleteMessage(contextMenu.messageId)}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            删除
          </button>
        </div>
      )}
    </div>
  );
}
