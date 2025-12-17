"use client";

import { useState } from "react";
import supabase from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setError(null);
    setMessage(null);
    if (!email) {
      setError("请输入邮箱");
      return;
    }
    setLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (resetErr) throw resetErr;
      setMessage("重置邮件已发送，请检查邮箱");
    } catch (err: any) {
      setError(err.message || "发送失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">找回密码</h1>
        <p className="text-sm text-gray-500">输入注册邮箱，我们会发送重置链接给你。</p>
        <input
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition disabled:opacity-60"
        >
          {loading ? "发送中..." : "发送重置邮件"}
        </button>
        {message && <div className="text-sm text-green-600">{message}</div>}
        {error && <div className="text-sm text-rose-500">{error}</div>}
      </div>
    </div>
  );
}

