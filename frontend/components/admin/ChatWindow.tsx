"use client";

import { useState } from "react";
import { AlertTriangle, Zap, Send } from "lucide-react";
import { chatHistory, ChatMessage } from "@/data/admin";

const Avatar = ({ label }: { label: string }) => (
  <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs text-gray-600">{label}</div>
);

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>(chatHistory);
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: "ai", content: input }]);
    setInput("");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 relative">
      <div className="h-16 bg-white border-b px-6 flex items-center justify-between shadow-sm z-10">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            Mike Ross <span className="text-xs font-normal text-gray-400 border px-2 py-0.5 rounded">Order #ORD-7789</span>
          </h3>
        </div>
        <div className="flex gap-3">
          <button className="px-3 py-1.5 text-xs font-medium border bg-white rounded-md text-gray-600 hover:bg-gray-50">转接同事</button>
          <button className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-md shadow hover:bg-gray-800 transition flex items-center gap-2">
            <span>接管对话</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, i) =>
          msg.role === "system" ? (
            <div key={i} className="flex justify-center fade-in">
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs px-4 py-2 rounded-full flex items-center gap-2 shadow-sm">
                <AlertTriangle size={14} />
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"} fade-in`}>
              {msg.role === "user" && <Avatar label="U" />}
              <div
                className={`max-w-[60%] p-4 rounded-xl text-sm leading-relaxed shadow-sm ${
                  msg.role === "user"
                    ? "bg-white border border-gray-200 text-gray-800 rounded-tl-none"
                    : "bg-blue-600 text-white rounded-tr-none"
                }`}
              >
                {msg.content}
                {msg.role === "ai" && (
                  <div className="text-[10px] text-blue-200 mt-2 flex items-center gap-1">
                    <Zap size={12} /> AI Confidence: 94%
                  </div>
                )}
              </div>
              {msg.role === "ai" && (
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white text-xs ml-3">AI</div>
              )}
            </div>
          )
        )}
      </div>

      <div className="p-4 bg-white border-t">
        <div className="mb-3 flex gap-2 overflow-x-auto">
          <button className="whitespace-nowrap text-xs bg-purple-50 text-purple-700 border border-purple-100 px-3 py-1.5 rounded-full hover:bg-purple-100 transition">
            ✓ 建议回复: 同意退款并提供免邮标签
          </button>
          <button className="whitespace-nowrap text-xs bg-gray-50 text-gray-600 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-100 transition">
            查询库存 (L码)
          </button>
        </div>
        <div className="relative">
          <input
            className="w-full bg-gray-100 border-transparent focus:bg-white focus:border-gray-300 rounded-lg pl-4 pr-12 py-3 text-sm transition outline-none"
            placeholder="输入回复内容，AI 将辅助优化语气..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="absolute right-2 top-2 p-1.5 bg-black text-white rounded-md hover:bg-gray-800 transition" onClick={handleSend} type="button">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
