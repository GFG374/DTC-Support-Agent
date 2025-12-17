"use client";

import { MessageSquare, Package, User as UserIcon } from "lucide-react";

type Tab = "assistant" | "orders" | "profile";

export default function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const items: { id: Tab; label: string; icon: any }[] = [
    { id: "assistant", label: "助理", icon: MessageSquare },
    { id: "orders", label: "订单", icon: Package },
    { id: "profile", label: "我的", icon: UserIcon },
  ];
  return (
    <div className="bg-white/95 backdrop-blur-sm border-t border-gray-100 flex justify-around items-center h-[80px] pb-[env(safe-area-inset-bottom,20px)] fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-50">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`flex flex-col items-center gap-1 p-2 transition-colors ${
            active === item.id ? "text-black" : "text-gray-400"
          }`}
          type="button"
        >
          <item.icon size={24} strokeWidth={active === item.id ? 2.5 : 2} />
          <span className="text-[10px] font-medium">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
