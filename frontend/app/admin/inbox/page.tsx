"use client";
import React, { useEffect, useState, useRef } from "react";
import supabase from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

// ==========================================
// 🛠️ 基础图标组件
// ==========================================
const Icon = ({ path, size = 20, className = "" }: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} dangerouslySetInnerHTML={{ __html: path }} />
);

const Icons = {
  Inbox: <Icon path="<polyline points='22 12 16 12 14 15 10 15 8 12 2 12'/><path d='M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'/>" />,
  CheckCircle: <Icon path="<path d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/><polyline points='22 4 12 14.01 9 11.01'/>" />,
  AlertTriangle: <Icon path="<path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/>" />,
  Zap: <Icon path="<polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2'/>" />,
  User: <Icon path="<path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/>" />,
  Search: <Icon path="<circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/>" />,
  Send: <Icon path="<line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/>" />,
  Bot: <Icon path="<rect x='3' y='11' width='18' height='10' rx='2'/><circle cx='12' cy='5' r='2'/><path d='M12 7v4'/><line x1='8' y1='16' x2='8' y2='16'/><line x1='16' y1='16' x2='16' y2='16'/>" />,
};

type Conversation = {
  id: string;
  user_id: string;
  title?: string | null;
  created_at?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  last_content?: string | null;
  status?: 'ai' | 'pending_agent' | 'agent' | 'closed';
  assigned_agent_id?: string | null;
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

type Profile = { 
  user_id: string; 
  display_name?: string | null; 
  avatar_url?: string | null; 
  role?: string | null;
};

const parseVoice = (msg: Msg) => {
  let duration = msg.metadata?.duration || null;
  
  if (msg.audio_url) {
    if (!duration && msg.content) {
      const match = msg.content.match(/\[语音\s+(\d+)秒\]/);
      if (match) {
        duration = parseInt(match[1]);
      }
    }
    return { url: msg.audio_url, transcript: msg.transcript, duration };
  }
  
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

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

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

  // 消息加载和实时订阅
  useEffect(() => {
    if (!session?.user || !activeId) return;
    
    let isMounted = true;
    const loadedMsgIds = new Set<string>();

    // 加载历史消息
    const loadMsgs = async () => {
      try {
        const res = await fetch(`/api/admin/conversations/${activeId}/messages`, {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        }).then((r) => r.json());
        
        if (!isMounted) return;
        
        const msgs = (res.items as Msg[]) || [];
        // 记录已加载的消息ID
        msgs.forEach(m => loadedMsgIds.add(m.id));
        setMessages(msgs);
        
        const latest = msgs.slice(-1)[0];
        if (latest) {
          setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, last_content: latest.content } : c)));
        }
      } catch (err) {
        console.error("load msgs error", err);
      }
    };
    
    loadMsgs();

    // 实时订阅 - 使用 * 事件监听所有变化
    const channel = supabase
      .channel(`admin-msgs-${activeId}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "messages",
          filter: `conversation_id=eq.${activeId}`
        },
        (payload) => {
          if (!isMounted) return;
          
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as Msg;
            
            // 严格去重：检查ID是否已存在
            if (loadedMsgIds.has(newMsg.id)) return;
            loadedMsgIds.add(newMsg.id);
            
            // 客服消息已在sendReply中添加，跳过
            if (newMsg.role === 'agent') return;
            
            setMessages((prev) => {
              // 双重检查
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            
            setConversations((prev) =>
              prev.map((c) =>
                c.id === newMsg.conversation_id ? { ...c, last_content: newMsg.content } : c
              )
            );
          }
        }
      )
      .subscribe((status) => {
        console.log("S端 Realtime 订阅状态:", status, "对话ID:", activeId);
      });

    // 轮询备用方案（每3秒检查一次新消息）
    const pollInterval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const res = await fetch(`/api/admin/conversations/${activeId}/messages`, {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        }).then((r) => r.json());
        
        const newMsgs = (res.items as Msg[]) || [];
        
        setMessages((prev) => {
          // 找出新消息
          const existingIds = new Set(prev.map(m => m.id));
          const toAdd = newMsgs.filter(m => !existingIds.has(m.id) && !loadedMsgIds.has(m.id));
          
          if (toAdd.length === 0) return prev;
          
          toAdd.forEach(m => loadedMsgIds.add(m.id));
          return [...prev, ...toAdd];
        });
      } catch (err) {
        // 忽略轮询错误
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [session?.user, activeId, session?.access_token]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendReply = async () => {
    if (!input.trim() || !activeId || !session?.access_token) return;
    const text = input.trim();
    setInput("");
    
    // 生成临时ID，立即显示
    const tempId = `temp-${Date.now()}`;
    const tempMsg: Msg = {
      id: tempId,
      conversation_id: activeId,
      user_id: session.user.id,
      role: 'agent',
      content: text,
      created_at: new Date().toISOString(),
    };
    
    // 1. 立即显示客服消息
    setMessages((prev) => [...prev, tempMsg]);
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, last_content: text } : c)));
    
    try {
      // 2. 发送到后端入库
      const response = await fetch("/api/admin/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: activeId, content: text }),
      });
      
      const result = await response.json();
      
      // 3. 用真实消息替换临时消息
      if (result.id) {
        setMessages((prev) => prev.map(m => m.id === tempId ? { ...m, id: result.id } : m));
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
        setConversations(prev => prev.map(c => 
          c.id === activeId 
            ? { ...c, status: 'agent', assigned_agent_id: result.assigned_agent_id } 
            : c
        ));
        
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

  const renderSystemMessage = (msg: Msg) => {
    const isWarning = msg.content.includes("⚠️");
    const isSuccess = msg.content.includes("✅");
    
    return (
      <div className="flex justify-center fade-in">
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
    const userProfile = profiles[msg.user_id];
    
    return (
      <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} fade-in`}>
        {isUser && (
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs text-gray-600 mr-3 flex-shrink-0">
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="User" className="w-full h-full object-cover rounded-full" />
            ) : (
              "User"
            )}
          </div>
        )}
        <div className={`max-w-[60%] p-4 rounded-xl text-sm leading-relaxed shadow-sm ${
          msg.role === 'user' 
            ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none' 
            : 'bg-blue-600 text-white rounded-tr-none'
        }`}
        onContextMenu={(e) => {
          if (voice?.url) {
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
          {voice ? (
            <div className="space-y-2 min-w-[180px]">
              {voice.url && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      const btn = e.currentTarget;
                      const audio = btn.nextElementSibling as HTMLAudioElement;
                      if (audio && audio instanceof HTMLAudioElement) {
                        if (audio.paused) {
                          audio.play();
                        } else {
                          audio.pause();
                        }
                      }
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isUser ? 'bg-blue-500 text-white' : 'bg-white/20 text-white'
                    } hover:opacity-80 transition flex-shrink-0`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </button>
                  <audio src={voice.url} className="hidden" />
                  <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                    <div className="h-full bg-white/60 rounded-full" style={{ width: '40%' }}></div>
                  </div>
                  {voice.duration && (
                    <span className="text-xs flex-shrink-0 opacity-70">
                      {voice.duration}"
                    </span>
                  )}
                </div>
              )}
              {voice.transcript && voice.transcript !== "语音转写功能待接入" && (
                <div className="text-xs bg-white/10 rounded p-2 mt-2">
                  <div className="font-medium mb-1 opacity-70">转写：</div>
                  <div>{voice.transcript}</div>
                </div>
              )}
            </div>
          ) : (
            msg.content
          )}
          {msg.role === 'assistant' && !voice && (
            <div className="text-[10px] text-blue-200 mt-2 flex items-center gap-1">
              {Icons.Zap} AI Confidence: 94%
            </div>
          )}
        </div>
        {!isUser && (
          msg.role === "agent" ? (
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs ml-3 flex-shrink-0">
              {currentAgentProfile?.avatar_url ? (
                <img src={currentAgentProfile.avatar_url} alt="Agent" className="w-full h-full object-cover rounded-full" />
              ) : (
                "AI"
              )}
            </div>
          ) : (
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs ml-3 flex-shrink-0">AI</div>
          )
        )}
      </div>
    );
  };

  const activeConv = conversations.find((c) => c.id === activeId);
  const activeProfile = activeId ? profiles[activeConv?.user_id || ""] : undefined;

  return (
    <div className="flex h-full w-full bg-white">
      {/* 对话列表 */}
      <div className="w-[300px] bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-gray-800">Inbox</h2>
          <div className="bg-gray-100 p-2 rounded-lg text-gray-500">{Icons.Search}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const p = profiles[c.user_id] || ({} as Profile);
            const isPending = c.status === 'pending_agent';
            
            return (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                  activeId === c.id ? 'bg-blue-50/50' : ''
                } ${
                  isPending ? 'border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-sm text-gray-900">{p?.display_name || c.title || "会话"}</span>
                  <span className="text-xs text-gray-400">2m</span>
                </div>
                <p className="text-xs text-gray-500 truncate mb-2">{c.last_content || "暂无消息"}</p>
                <div className="flex gap-2">
                  {c.status === 'ai' && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border flex items-center gap-1">
                      {Icons.Bot} AI 接管中
                    </span>
                  )}
                  {c.status === 'pending_agent' && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-200 flex items-center gap-1">
                      ⚠️ 需人工
                    </span>
                  )}
                  {c.status === 'agent' && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                      👤 人工处理中
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. 主聊天窗口 */}
      <div className="flex-1 flex flex-col h-full bg-slate-50 relative min-w-0">
        {/* Chat Header */}
        <div className="h-16 bg-white border-b px-6 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              {activeProfile?.display_name || "选择会话"}
            </h3>
          </div>
          {activeId && (() => {
            const conv = conversations.find(c => c.id === activeId);
            const isPending = conv?.status === 'pending_agent';
            const isAgent = conv?.status === 'agent';
            const isAssigned = isAgent && conv?.assigned_agent_id === session?.user?.id;
            
            return (
              <div className="flex gap-3">
                <button className="px-3 py-1.5 text-xs font-medium border bg-white rounded-md text-gray-600 hover:bg-gray-50">转接同事</button>
                {isPending && (
                  <button 
                    onClick={handleAssignConversation}
                    className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-md shadow hover:bg-gray-800 transition flex items-center gap-2"
                  >
                    <span>接管对话</span>
                  </button>
                )}
                {isAssigned && (
                  <button 
                    disabled
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-md border border-gray-200 cursor-not-allowed"
                  >
                    ✅ 已接管
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={scrollRef}>
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
            <div className="text-sm text-gray-500">左侧选择一个会话开始查看</div>
          )}
        </div>

        {/* Copilot Input */}
        <div className="p-4 bg-white border-t flex-shrink-0">
          {/* AI Suggestion */}
          <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide">
            <button className="whitespace-nowrap text-xs bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1.5 rounded-full hover:bg-purple-100 transition">
              ✨ 建议回复: 同意退货并提供免邮标签
            </button>
            <button className="whitespace-nowrap text-xs bg-gray-50 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-100 transition">
              查询库存 (L码)
            </button>
          </div>
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
              className="w-full bg-gray-100 border-transparent focus:bg-white focus:border-gray-300 rounded-lg pl-4 pr-12 py-3 text-sm transition outline-none" 
              placeholder="输入回复内容，AI 将辅助优化语气..." 
            />
            <button 
              onClick={sendReply}
              className="absolute right-2 top-2 p-1.5 bg-black text-white rounded-md hover:bg-gray-800 transition"
            >
              {Icons.Send}
            </button>
          </div>
        </div>
      </div>

      {/* 4. 右侧详情栏 */}
      <div className="w-[280px] bg-white border-l border-gray-200 p-4 hidden xl:block flex-shrink-0">
        <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">用户画像</h4>
        
        {/* User Card */}
        {activeProfile && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                {activeProfile.avatar_url ? (
                  <img src={activeProfile.avatar_url} alt="User" className="w-full h-full object-cover" />
                ) : (
                  Icons.User
                )}
              </div>
              <div>
                <div className="font-bold text-sm">{activeProfile.display_name || "用户"}</div>
                <div className="text-xs text-gray-500">上海, 中国</div>
              </div>
            </div>
          </div>
        )}

        <h4 className="text-xs font-bold text-gray-400 uppercase mb-4">当前订单</h4>
        <div className="border border-gray-200 rounded-xl p-3">
          <div className="flex gap-3 mb-2">
            <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-xl flex-shrink-0">🧥</div>
            <div>
              <div className="font-bold text-sm">高级羊绒大衣</div>
              <div className="text-xs text-gray-500">¥899 • 黑色/L</div>
            </div>
          </div>
          <div className="bg-yellow-50 text-yellow-700 text-xs p-2 rounded border border-yellow-100 mb-2">
            ⚠️ 此商品属于高单价退货限制品类
          </div>
          <button className="w-full py-1.5 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50">查看 Shopify 详情</button>
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
      
      <style jsx>{`
        .fade-in {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
