"use client";

import { FormEvent, useEffect, useMemo, useRef } from "react";
import { MoreHorizontal, Image as ImageIcon, Send, Bot } from "lucide-react";
import Avatar from "@/components/common/Avatar";
import type { Message, Profile } from "./types";

export default function AssistantTab({
  messages,
  input,
  setInput,
  onSend,
  busy,
  profile,
}: {
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  onSend: (e?: FormEvent) => void;
  busy: boolean;
  profile: Profile | null;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const quickChips = useMemo(() => ["我要退货", "我的快递到哪了？", "尺码咨询"], []);

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
        <button type="button">
          <MoreHorizontal size={20} className="text-gray-500" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`flex items-start gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {msg.role === "user" ? (
                <Avatar url={profile?.avatar_url} />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                  <Bot size={16} />
                </div>
              )}
              <div
                className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === "user"
                    ? "bg-black text-white rounded-br-none"
                    : "bg-white text-gray-800 border border-gray-100 rounded-bl-none"
                }`}
              >
                {msg.content}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border-t p-3 pb-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,20px) + 12px)" }}>
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
          {quickChips.map((chip) => (
            <button
              key={chip}
              className="whitespace-nowrap bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full text-xs text-gray-600 hover:bg-gray-100"
              type="button"
              onClick={() => setInput(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <form className="flex gap-2 items-center" onSubmit={onSend}>
          <button className="text-gray-400 p-2" type="button">
            <ImageIcon size={22} />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none"
            placeholder="输入消息..."
            disabled={busy}
          />
          <button
            type="submit"
            className="bg-black text-white w-10 h-10 rounded-full flex items-center justify-center shadow-md disabled:opacity-50"
            disabled={busy}
          >
            <Send size={18} />
          </button>
        </form>
        {profile?.role && profile.role !== "customer" && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
            当前角色：{profile.role}。此页为 C 端视角。
          </div>
        )}
      </div>
    </div>
  );
}
