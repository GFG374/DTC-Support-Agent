"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabaseClient";

type GeneratedInvite = { code: string; expires_at?: string | null; email?: string | null };

export default function AdminInvitesPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [count, setCount] = useState(1);
  const [expiresHours, setExpiresHours] = useState(72);
  const [invites, setInvites] = useState<GeneratedInvite[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setToken(data.session.access_token);
      }
    });
  }, []);

  const handleGenerate = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setInvites([]);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          count,
          email: email || undefined,
          expires_in_hours: expiresHours,
        }),
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();
        if (contentType.includes("application/json")) {
          try {
            const json = JSON.parse(text);
            throw new Error(json.message || json.detail || json.error || "生成失败");
          } catch {
            throw new Error(text || "生成失败");
          }
        }
        throw new Error(text || "生成失败");
      }
      const data = await res.json();
      setInvites(data.invites || []);
    } catch (err: any) {
      setError(err.message || "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 w-full max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">生成客服邀请码</h1>
      <p className="text-sm text-gray-500 mb-6">仅限管理员生成，邀请码只显示一次。</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-500">绑定邮箱（可选）</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">数量</label>
          <input
            type="number"
            min={1}
            max={50}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1"
            value={count}
            onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value))))}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">有效期（小时）</label>
          <input
            type="number"
            min={1}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1"
            value={expiresHours}
            onChange={(e) => setExpiresHours(Math.max(1, Number(e.target.value)))}
          />
        </div>
      </div>

      {error && <div className="text-sm text-rose-500 mb-3">{error}</div>}

      <button
        onClick={handleGenerate}
        disabled={!token || loading}
        className="bg-black text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-800 transition disabled:opacity-60"
      >
        {loading ? "生成中..." : "生成邀请码"}
      </button>

      {invites.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">生成结果（仅此一次展示）</h2>
          {invites.map((inv, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-3 bg-gray-50 flex justify-between items-center">
              <div>
                <div className="font-mono text-sm text-gray-900">{inv.code}</div>
                <div className="text-xs text-gray-500">
                  {inv.expires_at ? `过期时间：${inv.expires_at}` : "不过期"}
                  {inv.email ? ` · 绑定邮箱：${inv.email}` : ""}
                </div>
              </div>
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => navigator.clipboard.writeText(inv.code)}
              >
                复制
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
