"use client";

import { Inbox, CheckCircle } from "lucide-react";

export default function Sidebar({
  active,
  onChange,
}: {
  active: "inbox" | "approvals";
  onChange: (v: "inbox" | "approvals") => void;
}) {
  return (
    <div className="w-[64px] bg-black h-full flex flex-col items-center py-6 gap-6 z-20 shadow-xl">
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-bold text-xs mb-4">AI</div>
      <button
        onClick={() => onChange("inbox")}
        className={`p-3 rounded-xl transition ${active === "inbox" ? "bg-white/20 text-white" : "text-gray-500 hover:text-white"}`}
        title="对话"
        type="button"
      >
        <Inbox size={20} />
      </button>
      <button
        onClick={() => onChange("approvals")}
        className={`p-3 rounded-xl transition relative ${active === "approvals" ? "bg-white/20 text-white" : "text-gray-500 hover:text-white"}`}
        title="审批"
        type="button"
      >
        <CheckCircle size={20} />
        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-black" />
      </button>
      <div className="flex-1" />
      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500" />
    </div>
  );
}
