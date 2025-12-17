"use client";
import React, { useEffect, useState, useRef } from "react";
import supabase from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

const SvgIcon = ({ children, size = 20, className = "" }: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);

const Icons = {
  Search: (
    <SvgIcon>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </SvgIcon>
  ),
  Send: (
    <SvgIcon>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </SvgIcon>
  ),
  Trash: (
    <SvgIcon size={16}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </SvgIcon>
  ),
};

type Conversation = {
  id: string;
  user_id: string;
  title?: string | null;
  created_at?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  last_content?: string | null;
  status?: 'ai' | 'pending_agent' | 'agent' | 'closed';  // 新增对话状态
  assigned_agent_id?: string | null;  // 新增分配的客服ID
};
type Msg = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  created_at?: string;
  audio_url?: string | null;
  transcript?: string | null;
  metadata?: { duration?: number } | null;
};
type Profile = { user_id: string; display_name?: string | null; avatar_url?: string | null; role?: string | null };

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

export default function InboxPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [currentAgentProfile, setCurrentAgentProfile] = useState<Profile | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string; audioUrl: string } | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 关闭右键菜单的全局监听
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  // 加载当前客服的个人信息
  useEffect(() => {
    if (!session?.user) return;
    
    const loadAgentProfile = async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("user_id, display_name, avatar_url")
        .eq("user_id", session.user.id)
        .single();
      
      if (data) {
        setCurrentAgentProfile(data);
      }
    };
    
    loadAgentProfile();
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user) return;
    const loadConvos = async () => {
      try {
        const res = await fetch("/api/admin/conversations", {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        }).then((r) => r.json());
        const convs = (res.items || []) as Conversation[];
        setConversations(convs);
        const pMap: Record<string, Profile> = {};
        convs.forEach((c) => {
          if (c.display_name || c.avatar_url) {
            pMap[c.user_id] = { user_id: c.user_id, display_name: c.display_name, avatar_url: c.avatar_url };
          }
        });
        setProfiles(pMap);
        if (convs.length > 0 && !activeId) setActiveId(convs[0].id);
      } catch (err) {
        console.error("load convos error", err);
      }
    };
    loadConvos();
  }, [session?.user, activeId]);

  // ✅ Realtime 订阅：监听所有会话的新消息
  useEffect(() => {
    if (!session?.user) return;

    const channel = supabase
      .channel("admin-inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Msg;
          // 更新当前打开的会话消息
          if (newMsg.conversation_id === activeId) {
            setMessages((prev) => {
              const exists = prev.some((m) => m.id === newMsg.id);
              if (exists) return prev;
              return [...prev, newMsg].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
            });
          }
          // 更新会话列表的最后一条消息预览
          setConversations((prev) =>
            prev.map((c) =>
              c.id === newMsg.conversation_id ? { ...c, last_content: newMsg.content } : c
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user, activeId]);

  useEffect(() => {
    if (!activeId) return;
    const loadMsgs = async () => {
      try {
        const res = await fetch(`/api/admin/conversations/${activeId}/messages`, {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        }).then((r) => r.json());
        setMessages((res.items as Msg[]) || []);
        const latest = (res.items as Msg[])?.slice(-1)[0];
        if (latest) {
          setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, last_content: latest.content } : c)));
        }
      } catch (err) {
        console.error("load msgs error", err);
      }
    };
    loadMsgs();
  }, [activeId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // 删除会话
  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发选中
    if (!confirm("确定要删除这个会话吗？所有消息将被永久删除。")) return;
    try {
      const res = await fetch(`/api/admin/conversations/${convId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (activeId === convId) {
          setActiveId(null);
          setMessages([]);
        }
      } else {
        alert("删除失败");
      }
    } catch (err) {
      console.error("delete error", err);
      alert("删除失败");
    }
  };

  const sendReply = async () => {
    if (!input.trim() || !session?.user || !activeId) return;
    const text = input.trim();
    setInput("");
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ conversation_id: activeId, content: text }),
      });
      if (!res.ok) {
        const t = await res.text();
        console.error("admin send error", t);
        return;
      }
      const refreshed = await fetch(`/api/admin/conversations/${activeId}/messages`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then((r) => r.json());
      setMessages((refreshed.items as Msg[]) || []);
      const latest = (refreshed.items as Msg[])?.slice(-1)[0];
      if (latest) {
        setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, last_content: latest.content } : c)));
      }
    } catch (err) {
      console.error("send reply error", err);
    }
  };

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
        console.error(result.message || "转写失败");
      }
    } catch (err) {
      console.error("转写错误:", err);
    } finally {
      setTranscribing(false);
    }
  };

  // 接管对话
  const handleAssignConversation = async () => {
    if (!activeId || !session?.access_token) return;
    
    try {
      const response = await fetch(`http://localhost:8000/api/conversations/${activeId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({})
      });
      
      const result = await response.json();
      
      if (result.ok) {
        // 更新对话状态
        setConversations(prev => prev.map(c => 
          c.id === activeId 
            ? { ...c, status: 'agent', assigned_agent_id: result.assigned_agent_id } 
            : c
        ));
        
        // 刷新消息列表（会看到系统消息）
        const refreshed = await fetch(`/api/admin/conversations/${activeId}/messages`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).then((r) => r.json());
        setMessages((refreshed.items as Msg[]) || []);
        
        console.log("✅ 已接管对话:", result.agent_name);
      } else {
        console.error("接管失败:", result);
      }
    } catch (err) {
      console.error("接管错误:", err);
    }
  };

  // 渲染系统消息
  const renderSystemMessage = (msg: Msg) => {
    const isWarning = msg.content.includes("⚠️");
    const isSuccess = msg.content.includes("✅");
    
    return (
      <div className="flex justify-center my-4">
        <div className={`px-4 py-2 rounded-full text-xs font-medium flex items-center gap-2 shadow-sm border ${
          isSuccess 
            ? 'bg-green-50 text-green-700 border-green-200' 
            : isWarning 
            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
            : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {msg.content}
        </div>
      </div>
    );
  };

  const renderBubble = (msg: Msg, isUser: boolean) => {
    const voice = parseVoice(msg);
    const base =
      msg.role === "agent"
        ? "bg-slate-900 text-white"
        : msg.role === "assistant"
        ? "bg-blue-50 text-slate-900 border border-blue-100"
        : "bg-white border border-slate-200 text-slate-900";
    
    // 获取用户信息
    const userProfile = profiles[msg.user_id];
    
    return (
      <div className={`flex gap-2 ${isUser ? "justify-start" : "justify-end"} mb-3`}>
        {/* 用户头像（左侧） */}
        {isUser && (
          <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md">
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="User" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold">
                {userProfile?.display_name?.[0]?.toUpperCase() || "U"}
              </span>
            )}
          </div>
        )}
        
        <div className={`max-w-[70%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${isUser ? "rounded-tl-none" : "rounded-tr-none"} ${base}`}>
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
                      isUser ? 'bg-slate-700 hover:bg-slate-600 text-white shadow-md hover:shadow-lg' : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md hover:shadow-lg'
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
                        className={`w-0.5 rounded-full ${
                          isUser ? 'bg-slate-400/40' : 'bg-blue-500/40'
                        }`}
                        style={{
                          height: `${10 + (i % 4) * 3}px`,
                        }}
                      />
                    ))}
                  </div>
                  
                  {/* 时长显示 */}
                  {voice.duration && (
                    <span className={`text-xs flex-shrink-0 ${
                      isUser ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      {voice.duration}"
                    </span>
                  )}
                </div>
              )}
              
              {/* 转写文本 */}
              {voice.transcript && voice.transcript !== "语音转写功能待接入" && (
                <div className="text-xs bg-slate-50 rounded p-2 border border-slate-100 mt-2">
                  <div className="font-medium mb-1 text-slate-600">转写：</div>
                  <div className="text-slate-700">{voice.transcript}</div>
                </div>
              )}
            </div>
          ) : (
            msg.content
          )}
        </div>
        
        {/* 客服/AI头像（右侧） */}
        {!isUser && (
          msg.role === "agent" ? (
            <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md">
              {currentAgentProfile?.avatar_url ? (
                <img src={currentAgentProfile.avatar_url} alt="Agent" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-xs font-bold">
                  {currentAgentProfile?.display_name?.[0]?.toUpperCase() || "客"}
                </span>
              )}
            </div>
          ) : (
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2"/>
                <circle cx="12" cy="5" r="2"/>
                <path d="M12 7v4"/>
                <line x1="8" y1="16" x2="8" y2="16"/>
                <line x1="16" y1="16" x2="16" y2="16"/>
              </svg>
            </div>
          )
        )}
      </div>
    );
  };

  const activeProfile = activeId ? profiles[conversations.find((c) => c.id === activeId)?.user_id || ""] : undefined;

  return (
    <div className="flex h-full w-full bg-white">
      <div className="w-[320px] bg-white border-r border-slate-200 flex flex-col h-full flex-shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Inbox</h2>
          <div className="bg-slate-100 p-2 rounded-lg text-slate-500">{Icons.Search}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const p = profiles[c.user_id] || ({} as Profile);
            return (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 relative ${
                  activeId === c.id ? "bg-blue-50/50" : ""
                } ${
                  c.status === 'pending_agent' ? 'border-l-4 border-l-yellow-500' : ''
                }`}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                    {p?.avatar_url ? <img src={p.avatar_url} className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-slate-900 truncate">{p?.display_name || c.title || "会话"}</div>
                    <div className="text-[11px] text-slate-500 mt-1 truncate max-w-[180px]">{c.last_content || "暂无消息"}</div>
                    {/* 状态标签 */}
                    <div className="flex gap-2 mt-2">
                      {c.status === 'ai' && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="10" rx="2"/>
                            <circle cx="12" cy="5" r="2"/>
                          </svg>
                          AI 接管中
                        </span>
                      )}
                      {c.status === 'pending_agent' && (
                        <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200 flex items-center gap-1">
                          ⚠️ 需人工
                        </span>
                      )}
                      {c.status === 'agent' && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                          👤 人工处理中
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(c.id, e)}
                    className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                    title="删除会话"
                  >
                    {Icons.Trash}
                  </button>
                </div>
              </div>
            );
          })}
          {conversations.length === 0 && <div className="p-4 text-sm text-slate-500">暂无会话</div>}
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full bg-slate-50 relative min-w-0">
        <div className="h-16 bg-white border-b px-6 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{activeProfile?.display_name || (activeId ? "会话" : "请选择会话")}</h3>
          </div>
          {activeId && (() => {
            const conv = conversations.find(c => c.id === activeId);
            const isPending = conv?.status === 'pending_agent';
            const isAgent = conv?.status === 'agent';
            const isAssigned = isAgent && conv?.assigned_agent_id === session?.user?.id;
            
            return (
              <div className="flex gap-3">
                {isPending && (
                  <button 
                    onClick={handleAssignConversation}
                    className="px-4 py-2 text-xs font-medium bg-black text-white rounded-md shadow hover:bg-gray-800 transition flex items-center gap-2"
                  >
                    <span>接管对话</span>
                  </button>
                )}
                {isAssigned && (
                  <button 
                    disabled
                    className="px-4 py-2 text-xs font-medium bg-gray-100 text-gray-500 rounded-md border border-gray-200 cursor-not-allowed"
                  >
                    ✅ 已接管
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={scrollRef}>
          {activeId ? (
            messages.map((msg) => (
              <React.Fragment key={msg.id}>
                {msg.role === "system" 
                  ? renderSystemMessage(msg)
                  : renderBubble(msg, msg.role === "user" || msg.role === "ai_voice")
                }
              </React.Fragment>
            ))
          ) : (
            <div className="text-sm text-slate-500">左侧选择一个会话开始查看</div>
          )}
        </div>

        <div className="p-4 bg-white border-t flex-shrink-0">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendReply();
                }
              }}
              className="w-full bg-slate-100 border-transparent focus:bg-white focus:border-slate-300 rounded-lg pl-4 pr-12 py-3 text-sm transition outline-none"
              placeholder="输入回复内容…"
            />
            <button className="absolute right-2 top-2 p-2 bg-black text-white rounded-md hover:bg-gray-800 transition" onClick={sendReply}>
              {Icons.Send}
            </button>
          </div>
        </div>
      </div>
      
      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[140px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleTranscribe(contextMenu.messageId, contextMenu.audioUrl)}
            disabled={transcribing}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
            {transcribing ? "转写中..." : "语音转文字"}
          </button>
        </div>
      )}
    </div>
  );
}
