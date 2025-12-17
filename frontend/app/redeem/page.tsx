"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabaseClient";
import { fetchWithAuth } from "@/lib/api";

export default function RedeemPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
      } else {
        setToken(data.session.access_token);
      }
    });
  }, [router]);

  const handleRedeem = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await fetchWithAuth("/invites/redeem", token, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setSuccess("邀请码使用成功，已升级为客服。");
      setTimeout(() => router.push("/admin/inbox"), 800);
    } catch (err: any) {
      setError(err.message || "邀请码无效或已过期");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">输入邀请码</h1>
        <p className="text-sm text-gray-500 mb-6">登录后输入邀请码，升级为客服账号。</p>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="邀请码"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <div className="text-sm text-rose-500 mb-3">{error}</div>}
        {success && <div className="text-sm text-green-600 mb-3">{success}</div>}
        <button
          onClick={handleRedeem}
          disabled={loading || !code}
          className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? "处理中..." : "提交邀请码"}
        </button>
      </div>
    </div>
  );
}
