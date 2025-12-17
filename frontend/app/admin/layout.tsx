"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import supabase from "@/lib/supabaseClient";
import { fetchWithAuth } from "@/lib/api";

const SvgIcon = ({ children, size = 20, className = "" }: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const Icons = {
  Inbox: (
    <SvgIcon>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </SvgIcon>
  ),
  CheckCircle: (
    <SvgIcon>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </SvgIcon>
  ),
  Key: (
    <SvgIcon>
      <path d="M3 11a5 5 0 1 1 9.9 1h-1.4l-1.1 1.1V15H8v1H6v1H4v-2.6L3 13.5V11z" />
    </SvgIcon>
  ),
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = pathname.includes("approvals") ? "approvals" : pathname.includes("invites") ? "invites" : "inbox";

  const [avatar, setAvatar] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [agentInfo, setAgentInfo] = useState<{ name: string; email: string; id?: string }>({ name: "Admin", email: "" });
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      const user = session.user;
      const fallbackName = user.user_metadata?.display_name || "Admin";
      setAgentInfo({ email: user.email ?? "", name: fallbackName, id: user.id });
      setNameInput(fallbackName);
      setAccessToken(session.access_token);

      const { data } = await supabase
        .from("user_profiles")
        .select("avatar_url, display_name, role")
        .eq("user_id", user.id)
        .single();

      if (data?.role !== "admin") {
        router.replace("/login");
        return;
      }

      if (data?.avatar_url) setAvatar(data.avatar_url);
      if (data?.display_name) {
        setAgentInfo((prev) => ({ ...prev, name: data.display_name }));
        setNameInput(data.display_name);
      }
      setReady(true);
    };

    fetchProfile();
  }, [router]);

  // Click outside to close popover / exit editing
  useEffect(() => {
    if (!showProfile) return;
    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setShowProfile(false);
      setEditingName(false);
      setNameInput(agentInfo.name);
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [showProfile, agentInfo.name]);

  const saveDisplayName = async () => {
    if (!agentInfo.id) return;
    const newName = nameInput.trim();
    if (!newName || newName === agentInfo.name) {
      setEditingName(false);
      return;
    }
    const { error } = await supabase.from("user_profiles").update({ display_name: newName }).eq("user_id", agentInfo.id);
    if (error) {
      setProfileMessage("更新名字失败，请稍后再试");
      return;
    }
    setAgentInfo((prev) => ({ ...prev, name: newName }));
    setEditingName(false);
    setProfileMessage("姓名已更新");
    setTimeout(() => setProfileMessage(null), 2000);
  };

  const handleAvatarFile = async (file?: File | null) => {
    if (!file || !agentInfo.id || !accessToken) return;
    setUploadingAvatar(true);
    setProfileMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filename", file.name);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });

      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      const data = contentType.includes("application/json") ? JSON.parse(text) : { message: text };

      if (!res.ok) {
        throw new Error(data.message || data.error || "上传失败");
      }

      const url = data.avatarUrl as string;
      if (url) {
        setAvatar(url);
        setProfileMessage("头像已更新");
        setTimeout(() => setProfileMessage(null), 2000);
      }
    } catch (err: any) {
      setProfileMessage(err?.message || "上传头像失败，请稍后再试");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!ready) return null;

  return (
    <div className="flex h-screen w-full bg-white">
      <div className="w-[64px] bg-black h-full flex flex-col items-center py-6 gap-6 z-20 shadow-xl flex-shrink-0">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-bold text-xs mb-4">AI</div>

        <Link href="/admin/inbox">
          <div
            className={`p-3 rounded-xl transition cursor-pointer ${activeTab === "inbox" ? "bg-white/20 text-white" : "text-gray-500 hover:text-white"}`}
            title="对话"
          >
            {Icons.Inbox}
          </div>
        </Link>

        <Link href="/admin/approvals">
          <div
            className={`p-3 rounded-xl transition relative cursor-pointer ${activeTab === "approvals" ? "bg-white/20 text-white" : "text-gray-500 hover:text-white"}`}
            title="审批"
          >
            {Icons.CheckCircle}
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-black"></span>
          </div>
        </Link>

        <Link href="/admin/invites">
          <div
            className={`p-3 rounded-xl transition cursor-pointer ${activeTab === "invites" ? "bg-white/20 text-white" : "text-gray-500 hover:text-white"}`}
            title="邀请码"
          >
            {Icons.Key}
          </div>
        </Link>

        <div className="flex-1" />

        <div className="relative">
          <div
            ref={triggerRef}
            onClick={() => setShowProfile(!showProfile)}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 mb-2 cursor-pointer border-2 border-transparent hover:border-white transition overflow-hidden"
          >
            {avatar && <img src={avatar} className="w-full h-full object-cover" alt="" />}
          </div>

          {showProfile && (
            <div ref={popoverRef} className="absolute bottom-0 left-12 ml-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 z-50 fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden relative group">
                  {avatar ? (
                    <img src={avatar} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-purple-500 to-blue-500" />
                  )}
                  <div
                    className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white cursor-pointer transition"
                    title="点击更换头像"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingAvatar ? "上传中.." : "更换"}
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => handleAvatarFile(e.target.files?.[0])}
                />
                <div>
                  <div className="flex items-center gap-2">
                    {editingName ? (
                      <input
                        className="text-sm border border-gray-200 rounded px-2 py-1 w-32"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="输入名字"
                        autoFocus
                        onBlur={() => {
                          saveDisplayName();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveDisplayName();
                          }
                          if (e.key === "Escape") {
                            setEditingName(false);
                            setNameInput(agentInfo.name);
                          }
                        }}
                      />
                    ) : (
                      <h3
                        className="font-bold text-gray-900 text-sm cursor-pointer hover:underline"
                        onClick={() => {
                          setNameInput(agentInfo.name);
                          setEditingName(true);
                        }}
                        title="点击修改名字"
                      >
                        {agentInfo.name}
                      </h3>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate w-32">{agentInfo.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-500 flex justify-between">
                  <span>Role</span>
                  <span className="font-medium text-gray-900">Admin</span>
                </div>
                <div className="text-xs text-gray-500 flex justify-between">
                  <span>Status</span>
                  <span className="text-green-600 font-medium">● Online</span>
                </div>
                {profileMessage && <div className="text-[11px] text-blue-600">{profileMessage}</div>}
              </div>

              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
                className="mt-4 w-full py-2 bg-gray-50 text-gray-600 text-xs font-bold rounded-lg hover:bg-red-50 hover:text-red-600 transition"
              >
                Sign Out
              </button>
              <button
                onClick={async () => {
                  if (!accessToken) return;
                  try {
                    await fetchWithAuth("/account/deactivate", accessToken, { method: "POST" });
                    await supabase.auth.signOut();
                    window.location.href = "/login";
                  } catch (err: any) {
                    setProfileMessage(err?.message || "注销失败，请稍后再试");
                    setTimeout(() => setProfileMessage(null), 3000);
                  }
                }}
                className="mt-2 w-full py-2 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 transition"
              >
                注销账号（30天内可恢复）
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">{children}</main>
    </div>
  );
}
