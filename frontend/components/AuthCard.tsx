"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabaseClient";
import { postPublic } from "@/lib/api";
import { Mail, Lock, Eye, EyeOff, User as UserIcon, ArrowLeft, Check, Upload } from "lucide-react";

type View = "login" | "signup" | "forgot" | "reset-sent" | "confirm-email";

const InputField = ({
  icon,
  type = "text",
  placeholder,
  value,
  onChange,
  isPassword = false,
}: {
  icon: React.ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isPassword?: boolean;
}) => {
  const [show, setShow] = useState(false);
  const inputType = isPassword ? (show ? "text" : "password") : type;
  return (
    <div className="input-group flex items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 transition-all duration-200 mb-4">
      <div className="text-gray-400 mr-3">{icon}</div>
      <input
        type={inputType}
        className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder-gray-400 font-medium"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      {isPassword && (
        <button type="button" onClick={() => setShow((v) => !v)} className="text-gray-400 hover:text-gray-600 transition">
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
  );
};

export default function AuthCard({ initialView = "login" as View }) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 当邮箱改变时，尝试加载用户头像
  useEffect(() => {
    if (view !== "login" || !email || !email.includes("@")) {
      setUserAvatar(null);
      return;
    }

    const loadUserAvatar = async () => {
      try {
        console.log("🔍 正在查询邮箱头像:", email);
        const response = await fetch("http://localhost:8000/api/users/avatar-by-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        });
        
        const data = await response.json();
        console.log("📦 收到头像数据:", data);
        
        if (data.avatar_url) {
          console.log("✅ 设置头像:", data.avatar_url);
          setUserAvatar(data.avatar_url);
        } else {
          console.log("⚠️ 没有找到头像");
          setUserAvatar(null);
        }
      } catch (err) {
        console.error("❌ 加载头像失败:", err);
        setUserAvatar(null);
      }
    };

    const debounce = setTimeout(loadUserAvatar, 500);
    return () => clearTimeout(debounce);
  }, [email, view]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const objectUrl = URL.createObjectURL(file);
      setAvatarPreview(objectUrl);
    }
  };

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const submitLabel = useMemo(() => {
    if (view === "login") return "登录";
    if (view === "signup") return "注册";
    if (view === "forgot") return "发送重置链接";
    if (view === "confirm-email") return "我已完成邮箱验证，继续";
    return "返回登录";
  }, [view]);

  const redirectByRole = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      router.push("/c/assistant");
      return;
    }
    const { data, error: profileErr } = await supabase.from("user_profiles").select("role").eq("user_id", userId).single();
    if (profileErr || !data?.role) {
      router.push("/c/assistant");
      return;
    }
    if (data.role === "admin") {
      router.push("/admin/inbox");
    } else {
      router.push("/c/assistant");
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (view === "reset-sent") {
      setView("login");
      return;
    }
    if (view === "confirm-email") {
      setLoading(true);
      try {
        const { error: loginErr, data } = await supabase.auth.signInWithPassword({ email, password });
        if (loginErr) throw loginErr;
        if (data.session) {
          await redirectByRole();
        }
      } catch (err: any) {
        setError(err.message || "请先在邮箱完成验证");
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      if (view === "forgot") {
        if (!email) throw new Error("请输入邮箱");
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (resetErr) throw resetErr;
        setView("reset-sent");
        return;
      }

      if (view === "signup") {
        if (!displayName) throw new Error("请输入昵称");
        if (!email || !password) throw new Error("请输入邮箱与密码");
        if (password !== confirmPassword) throw new Error("两次密码不一致");
        await postPublic("/auth/register", {
          email,
          password,
          display_name: displayName,
          invite_code: inviteCode || undefined,
        });
        setView("confirm-email");
        setError("请到邮箱完成验证后，点击下方按钮继续登录");
        return;
      }

      if (!email || !password) throw new Error("请输入邮箱与密码");
      const { error: loginErr, data } = await supabase.auth.signInWithPassword({ email, password });
      if (loginErr) throw loginErr;
      if (data.session) {
        await redirectByRole();
      }
    } catch (err: any) {
      setError(err.message || "出错了");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl p-8 w-full relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

      <div className="text-center mb-8 relative z-10">
        <div
          onClick={view === "signup" ? handleAvatarClick : undefined}
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 font-bold text-xl shadow-lg transition-all relative overflow-hidden group ${
            view === "signup" ? "cursor-pointer hover:scale-105" : ""
          } ${avatarPreview || userAvatar ? "bg-white border-2 border-gray-100" : "bg-gradient-to-br from-blue-500 to-indigo-600 text-white"}`}
        >
          {avatarPreview ? (
            <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
          ) : userAvatar && view === "login" ? (
            <img src={userAvatar} alt="User" className="w-full h-full object-cover" />
          ) : view === "login" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          ) : (
            displayName?.[0]?.toUpperCase() || "U"
          )}

          {view === "signup" && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Upload className="text-white w-6 h-6" />
            </div>
          )}
        </div>

        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          {view === "login" && "欢迎回来"}
          {view === "signup" && "创建账户"}
          {view === "forgot" && "重置密码"}
          {view === "reset-sent" && "邮件已发送"}
          {view === "confirm-email" && "请先完成邮箱验证"}
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          {view === "login" && "请输入您的账户以继续"}
          {view === "signup" && "加入我们，享受专属会员权益"}
          {view === "forgot" && "别担心，我们会帮您找回来"}
          {view === "reset-sent" && "请检查您的邮箱收件箱"}
          {view === "confirm-email" && "我们已发送验证邮件，请完成验证后继续"}
        </p>
      </div>

      <div className="relative z-10 fade-in-up" key={view}>
        {view === "reset-sent" ? (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check />
            </div>
            <button onClick={() => setView("login")} className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition shadow-lg">
              返回登录
            </button>
          </div>
        ) : view === "confirm-email" ? (
          <div className="text-center py-4 space-y-4">
            <p className="text-sm text-gray-600">请前往邮箱点击验证链接，然后点击下方按钮继续。</p>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition shadow-lg disabled:opacity-60"
            >
              {loading ? "验证中..." : "我已完成邮箱验证，继续"}
            </button>
            <button
              type="button"
              className="text-xs text-gray-500 underline"
              onClick={async () => {
                setError("");
                const { error: resendErr } = await supabase.auth.resend({ type: "signup", email });
                if (resendErr) setError(resendErr.message);
                else setError("验证邮件已重新发送，请查收");
              }}
            >
              没收到？重新发送
            </button>
          </div>
        ) : (
          <>
            {view === "signup" && (
              <>
                <InputField icon={<UserIcon />} placeholder="您的昵称 / 姓名" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </>
            )}

            <InputField icon={<Mail />} placeholder="name@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

            {view !== "forgot" && (
              <>
                <InputField icon={<Lock />} placeholder="密码" isPassword value={password} onChange={(e) => setPassword(e.target.value)} />
                {view === "signup" && <InputField icon={<Lock />} placeholder="确认密码" isPassword value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />}
                {view === "signup" && <InputField icon={<Mail />} placeholder="邀请码（可选）" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />}
              </>
            )}

            {view === "login" && (
              <div className="flex justify-end mb-6">
                <button onClick={() => setView("forgot")} className="text-xs font-semibold text-gray-500 hover:text-black transition">
                  忘记密码?
                </button>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition shadow-lg flex items-center justify-center gap-2 mb-6 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
              {submitLabel}
            </button>

            {error && <div className="text-sm text-rose-500 mb-3 text-center">{error}</div>}

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-400">或通过以下方式继续</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <button className="bg-white border border-gray-200 w-full py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-2 shadow-sm">
                Google
              </button>
              <button className="bg-white border border-gray-200 w-full py-2.5 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-2 shadow-sm">
                Apple
              </button>
            </div>

            <div className="text-center mt-2 relative z-10">
              <p className="text-sm text-gray-500">
                {view === "login" ? "还没有账户? " : "已经有账户了? "}
                <button onClick={() => setView(view === "login" ? "signup" : "login")} className="font-bold text-black hover:underline ml-1">
                  {view === "login" ? "立即注册" : "直接登录"}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
