"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

const SvgIcon = ({ children, size = 24, className = "" }: { children: React.ReactNode; size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const Icons = {
  MessageSquare: (props: any) => (
    <SvgIcon {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </SvgIcon>
  ),
  Package: (props: any) => (
    <SvgIcon {...props}>
      <path d="M16.5 9.4 7.5 4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </SvgIcon>
  ),
  User: (props: any) => (
    <SvgIcon {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </SvgIcon>
  ),
  ChevronRight: (props: any) => (
    <SvgIcon {...props}>
      <polyline points="9 18 15 12 9 6" />
    </SvgIcon>
  ),
  LogOut: (props: any) => (
    <SvgIcon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </SvgIcon>
  ),
  Image: (props: any) => (
    <SvgIcon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </SvgIcon>
  ),
  Send: (props: any) => (
    <SvgIcon {...props}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </SvgIcon>
  ),
};

type Profile = { display_name?: string | null; avatar_url?: string | null; role?: string | null; email?: string | null };

const BottomNav = ({ activeTab, onTabChange }: any) => (
  <div className="bg-white/95 backdrop-blur-sm border-t border-gray-100 flex justify-around items-center h-[80px] pb-4 absolute bottom-0 w-full z-50 safe-bottom">
    {[
      { id: "assistant", label: "助理", icon: Icons.MessageSquare },
      { id: "orders", label: "订单", icon: Icons.Package },
      { id: "profile", label: "我的", icon: Icons.User },
    ].map((tab) => (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === tab.id ? "text-black" : "text-gray-400"}`}
      >
        <tab.icon size={24} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
        <span className="text-[10px] font-medium">{tab.label}</span>
      </button>
    ))}
  </div>
);

// --- 助理 Tab ---
const AssistantPage = () => {
  const [messages, setMessages] = useState([{ id: 1, role: "ai", content: "您好，我是您的售后助理，请问需要什么帮助？" }]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { id: Date.now(), role: "user", content: input }]);
    setInput("");
    setTimeout(() => {
      setMessages((prev) => [...prev, { id: Date.now(), role: "ai", content: "收到您的消息，正在为您查询，请稍候…" }]);
    }, 800);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 pb-[80px] animate-[fadeIn_0.3s_ease-out]">
      <div className="h-[60px] bg-white border-b flex items-center justify-between px-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs">AI</div>
          <div>
            <div className="font-bold text-sm">DTC Assistant</div>
            <div className="text-[10px] text-green-600 flex items-center gap-1">● 在线</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-line ${
                msg.role === "user" ? "bg-black text-white rounded-br-none" : "bg-white text-gray-800 border border-gray-100 rounded-bl-none"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border-t p-3 pb-4 safe-bottom">
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          {["我要退货", "我的快递到哪了", "尺码咨询"].map((chip, i) => (
            <button
              key={i}
              className="whitespace-nowrap bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full text-xs text-gray-600 hover:bg-gray-100"
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <button className="text-gray-400 p-2">
            <Icons.Image size={22} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none"
            placeholder="输入消息..."
          />
          <button onClick={handleSend} className="bg-black text-white w-10 h-10 rounded-full flex items-center justify-center shadow-md">
            <Icons.Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 订单 Tab（空态） ---
const OrdersPage = () => {
  return (
    <div className="flex flex-col h-full bg-gray-50 pb-[80px] animate-[fadeIn_0.3s_ease-out]">
      <div className="bg-white px-6 pt-12 pb-4 border-b sticky top-0 z-10">
        <h1 className="text-2xl font-bold">我的订单</h1>
        <div className="text-sm text-gray-500 mt-2">暂无订单数据</div>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">暂无订单记录，试着浏览商品或联系客服。</div>
    </div>
  );
};

// --- 我的 Tab（真实数据） ---
const ProfilePage = ({ session }: { session: Session }) => {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase.from("user_profiles").select("display_name, role, avatar_url").eq("user_id", session.user.id).single();
      const email = session.user.email || undefined;
      setProfile({ ...(data || {}), email });
      if (data?.avatar_url) setAvatarUrl(data.avatar_url);
    };
    fetchProfile();
  }, [session.user.id, session.user.email]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setAvatarUrl(objectUrl);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", file.name);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "上传失败");
      if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
    } catch (err: any) {
      setError(err.message || "上传失败");
      setTimeout(() => setError(null), 2000);
    }
  };

  const displayName = profile.display_name || profile.email || "未命名";
  const roleLabel = profile.role === "admin" ? "管理员" : "会员";

  return (
    <div className="flex flex-col h-full bg-white pb-[80px] animate-[fadeIn_0.3s_ease-out]">
      <div className="bg-gray-900 text-white p-6 pt-16 rounded-b-[30px] shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gray-800 rounded-full blur-3xl opacity-50 -mr-10 -mt-10"></div>
        <div className="flex items-center gap-4 relative z-10">
          <div
            onClick={handleAvatarClick}
            className="w-16 h-16 rounded-full bg-gradient-to-tr from-gray-400 to-gray-600 border-2 border-white/20 cursor-pointer overflow-hidden relative group"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/20 text-xs">更换</div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          <div>
            <h2 className="text-xl font-bold">{displayName}</h2>
            <p className="text-xs text-gray-300 bg-white/10 px-2 py-0.5 rounded-full inline-block mt-1">{roleLabel}</p>
            {profile.email && <p className="text-xs text-gray-300 mt-1">{profile.email}</p>}
          </div>
        </div>
        {error && <div className="mt-3 text-xs text-red-200">{error}</div>}
      </div>

      <div className="px-6 space-y-2 flex-1 overflow-y-auto">
        <button
          onClick={handleLogout}
          className="w-full mt-2 p-4 text-red-500 bg-red-50 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
        >
          <Icons.LogOut size={18} />
          退出登录
        </button>
      </div>
    </div>
  );
};

export default function ChatPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase.from("user_profiles").select("role").eq("user_id", session.user.id).single();
      if (profile?.role === "admin") {
        router.replace("/admin/inbox");
      } else {
        router.replace("/c/assistant");
      }
      setReady(true);
    });
  }, [router]);

  if (!ready) return null;
  return null;
}
