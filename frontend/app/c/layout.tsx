"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import supabase from "@/lib/supabaseClient";

const tabs = [
  { id: "assistant", label: "助理", icon: "聊", href: "/c/assistant" },
  { id: "orders", label: "订单", icon: "单", href: "/c/orders" },
  { id: "profile", label: "我的", icon: "我", href: "/c/profile" },
];

export default function CLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .single();
      if (profile?.role === "admin") {
        router.replace("/admin/inbox");
        return;
      }
      setReady(true);
    });
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen w-full bg-gray-200 flex justify-center">
      <div className="w-full h-screen max-w-[480px] bg-white shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">{children}</div>
        <div className="bg-white/95 backdrop-blur-sm border-t border-gray-100 flex justify-around items-center h-[80px] pb-4 safe-bottom">
          {tabs.map((tab) => {
            const active = pathname?.startsWith(tab.href);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`flex flex-col items-center gap-1 p-2 transition-colors ${active ? "text-black" : "text-gray-400"}`}
              >
                <span className="text-[13px] font-semibold">{tab.icon}</span>
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
