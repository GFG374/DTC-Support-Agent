"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { backendBase } from "@/lib/api";
import supabase from "@/lib/supabaseClient";
import { LogOut, Send, Sparkles, User as UserIcon, Bot } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Profile = {
  display_name?: string | null;
  role?: string | null;
  avatar_url?: string | null;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function ChatPanel({ session }: { session: Session }) {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const quickPrompts = useMemo(
    () => [
      "我要申请退货，订单号是 ORD-12345。",
      "快递在哪里了？订单号 ORD-98765。",
      "这件衣服可以换尺码吗？",
    ],
    []
  );

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data } = await supabase
          .from("user_profiles")
          .select("display_name, role, avatar_url")
          .eq("user_id", session.user.id)
          .single();
        setProfile(data || {});
      } catch {
        setProfile({});
      }
    };
    loadProfile();
  }, [session.user.id]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const updateAssistantMessage = (id: string, chunk: string) =>
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: (m.content || "") + chunk } : m))
    );

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setError("");

    const userMessage: Message = { id: uid(), role: "user", content: trimmed };
    const assistantId = uid();
    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch(`${backendBase}/api/chat/kimi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ conversation_id: conversationId, message: trimmed }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "无法获取回复");
      }

      const newConversationId = response.headers.get("x-conversation-id");
      if (newConversationId) {
        setConversationId(newConversationId);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取回答流");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (part.startsWith("data:")) {
            const chunk = part.replace(/^data:\s*/, "");
            updateAssistantMessage(assistantId, chunk);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "发送失败");
    } finally {
      setBusy(false);
    }
  };

  const renderAvatar = (url?: string | null, fallback?: React.ReactNode) => {
    if (url) {
      return <img src={url} alt="avatar" className="w-9 h-9 rounded-full border border-slate-200 object-cover" />;
    }
    return (
      <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs">
        {fallback || <UserIcon size={14} />}
      </div>
    );
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">DTC 客服</p>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">智能助手</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              <Sparkles size={14} /> Kimi 驱动
            </span>
          </div>
          <div className="flex items-center gap-2">
            {renderAvatar(profile?.avatar_url)}
            <div>
              <p className="text-sm text-slate-900 font-medium">{profile?.display_name || session.user.email}</p>
              <p className="text-xs text-slate-500">{profile?.role || "customer"}</p>
            </div>
          </div>
        </div>
        <button
          className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-2"
          onClick={handleSignOut}
          type="button"
        >
          <LogOut size={16} /> 退出
        </button>
      </header>

      <main className="flex-1 px-4 py-4 flex flex-col gap-3">
        {profile?.role && profile.role !== "customer" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            当前角色：{profile.role}。此页面为 C 端客户视角，请确认账号角色。
          </div>
        )}
        <section className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 hover:border-slate-300"
            >
              {prompt}
            </button>
          ))}
        </section>

        <section
          ref={messagesRef}
          className="flex-1 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-3 shadow-sm space-y-4"
        >
          {messages.length === 0 && (
            <div className="text-center text-slate-400 text-sm py-12">
              开始提问订单、物流或退换货问题，Kimi 会即时回复。
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`flex items-start gap-2 max-w-[88%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {msg.role === "user" ? renderAvatar(profile?.avatar_url, <UserIcon size={16} />) : (
                  <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                    <Bot size={16} />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    msg.role === "user"
                      ? "bg-slate-900 text-white rounded-br-sm"
                      : "bg-slate-50 text-slate-900 border border-slate-100 rounded-bl-sm"
                  }`}
                  style={{ wordBreak: "break-word" }}
                >
                  {msg.content || (msg.role === "assistant" ? "..." : "")}
                </div>
              </div>
            </div>
          ))}
        </section>

        <form
          onSubmit={sendMessage}
          className="bg-white border border-slate-200 rounded-2xl shadow-sm px-3 py-2 flex items-center gap-2"
        >
          <input
            className="flex-1 border-0 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
            placeholder="输入你的问题，例如：我想申请退货 / 快递在哪里？"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Send size={16} />
            发送
          </button>
        </form>

        {error && <div className="text-sm text-rose-500">{error}</div>}
        {conversationId && (
          <div className="text-xs text-slate-400">会话 ID：{conversationId}</div>
        )}
      </main>
    </div>
  );
}
