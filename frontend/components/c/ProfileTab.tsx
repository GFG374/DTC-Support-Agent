"use client";

import { LogOut, UserX, RefreshCw, ChevronRight, MapPin, CreditCard, ShieldCheck, HelpCircle } from "lucide-react";
import type { Profile } from "./types";

export default function ProfileTab({
  onSignOut,
  onDeactivate,
  onRestore,
  avatarUrl,
  profile,
  stats,
}: {
  onSignOut: () => void;
  onDeactivate: () => void;
  onRestore: () => void;
  avatarUrl?: string | null;
  profile: Profile & { email?: string | null };
  stats: { points: number; coupons: number; balance: number };
}) {
  const isDeleted = !!profile.deleted_at;
  const name = profile.display_name || profile.email || "未命名";
  const role = profile.role || "customer";
  const { points, coupons, balance } = stats;

  return (
    <div className="flex flex-col h-full bg-[#f5f7fa] pb-[80px] animate-[fadeIn_0.3s_ease-out]">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#2c3e50] via-[#34495e] to-[#2c3e50] text-white px-6 pt-12 pb-8">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="flex items-center gap-4 relative z-10 mb-6">
          <div className="w-20 h-20 rounded-full bg-white/15 border-2 border-white/30 overflow-hidden shadow-2xl backdrop-blur-sm">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-2xl font-bold">
                {name.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight mb-1">{name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-md bg-white/15 border border-white/25 backdrop-blur-sm">
                {role === "admin" ? "管理员" : "会员"}
              </span>
              {profile.email && (
                <span className="text-xs text-white/80 truncate max-w-[160px]">{profile.email}</span>
              )}
            </div>
          </div>
        </div>
        {isDeleted && (
          <div className="mt-4 text-xs text-amber-200 relative z-10">账号已停用，可在30天内恢复。请点击下方“恢复账号”。</div>
        )}
      </div>

      <div className="px-5 space-y-4 flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-900 text-white p-3 shadow-sm">
            <div className="text-[11px] text-slate-200">积分</div>
            <div className="text-2xl font-bold mt-1">{points}</div>
          </div>
          <div className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm">
            <div className="text-[11px] text-slate-500">优惠券</div>
            <div className="text-2xl font-bold mt-1">{coupons}</div>
          </div>
          <div className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm">
            <div className="text-[11px] text-slate-500">余额</div>
            <div className="text-2xl font-bold mt-1">¥{balance}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {[
            { label: "收货地址", desc: "管理常用地址", icon: <MapPin size={18} className="text-slate-600" /> },
            { label: "支付方式", desc: "添加 / 管理支付方式", icon: <CreditCard size={18} className="text-slate-600" /> },
            { label: "账号与安全", desc: "修改密码 / 邮箱绑定", icon: <ShieldCheck size={18} className="text-slate-600" /> },
            { label: "帮助与客服", desc: "查看常见问题或联系客服", icon: <HelpCircle size={18} className="text-slate-600" /> },
          ].map((item, idx) => (
            <div
              key={idx}
              className={`px-4 py-4 flex justify-between items-center active:bg-slate-50 transition-colors cursor-pointer ${
                idx !== 3 ? 'border-b border-slate-50' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                  {item.icon}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </div>
          ))}
        </div>

        {!isDeleted && (
          <button
            className="w-full p-4 text-red-600 bg-white border border-red-100 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm active:bg-red-50 transition-colors"
            onClick={onDeactivate}
            type="button"
          >
            <UserX size={18} />
            注销账号（30天内可恢复）
          </button>
        )}

        {isDeleted && (
          <button
            className="w-full p-4 text-green-600 bg-white border border-green-100 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm active:bg-green-50 transition-colors"
            onClick={onRestore}
            type="button"
          >
            <RefreshCw size={18} />
            恢复账号
          </button>
        )}

        <button
          className="w-full p-4 text-slate-600 bg-white border border-slate-100 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 shadow-sm active:bg-slate-50 transition-colors"
          onClick={onSignOut}
          type="button"
        >
          <LogOut size={18} />
          退出登录
        </button>
      </div>
    </div>
  );
}
