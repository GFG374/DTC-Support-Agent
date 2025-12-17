"use client";

import { Search, Bot, AlertTriangle } from "lucide-react";
import { chatList, ChatItem } from "@/data/admin";

export default function ChatList({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  return (
    <div className="w-[300px] bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-bold text-gray-800">Inbox</h2>
        <div className="bg-gray-100 p-2 rounded-lg text-gray-500">
          <Search size={16} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {chatList.map((chat: ChatItem) => (
          <div
            key={chat.id}
            onClick={() => onSelect(chat.id)}
            className={`p-4 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
              chat.id === selectedId ? "bg-blue-50/50 border-l-4 border-l-blue-500" : ""
            }`}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-bold text-sm text-gray-900">{chat.user}</span>
              <span className="text-xs text-gray-400">{chat.time}</span>
            </div>
            <p className="text-xs text-gray-500 truncate mb-2">{chat.lastMsg}</p>
            <div className="flex gap-2">
              {chat.status === "ai_handling" && (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border flex items-center gap-1">
                  <Bot size={12} /> AI 接管中
                </span>
              )}
              {chat.status === "needs_human" && (
                <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-200 flex items-center gap-1">
                  <AlertTriangle size={12} /> 需人工
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
