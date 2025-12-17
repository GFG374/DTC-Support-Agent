"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

export default function OrdersPage() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50 pb-[80px] animate-[fadeIn_0.3s_ease-out]">
      <div className="bg-white px-6 pt-12 pb-4 border-b sticky top-0 z-10">
        <h1 className="text-2xl font-bold">我的订单</h1>
        <div className="text-sm text-gray-500 mt-2">{session ? "暂无订单数据" : "请登录后查看订单"}</div>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">
        暂无订单记录，试着浏览商品或联系客服。
      </div>
    </div>
  );
}

