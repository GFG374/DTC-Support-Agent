"use client";

import { useEffect, useRef, useState } from "react";
import supabase from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";
import ProfileTab from "@/components/c/ProfileTab";
import { fetchWithAuth } from "@/lib/api";
import type { Profile } from "@/components/c/types";

export default function ProfilePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const hasLoaded = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    const load = async () => {
      try {
        const { data } = await supabase
          .from("user_profiles")
          .select("display_name, role, avatar_url, deleted_at, purge_after")
          .eq("user_id", session.user.id)
          .single();
        setProfile({ ...(data || {}), email: session.user.email || undefined });
      } catch {
        setProfile({ email: session.user.email || undefined });
      }
    };
    load();
  }, [session?.user?.id, session?.user?.email]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleDeactivate = async () => {
    if (!session) return;
    try {
      await fetchWithAuth("/account/deactivate", session.access_token, { method: "POST" });
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (err: any) {
      setError(err.message || "注销失败，请稍后再试");
    }
  };

  const handleRestore = async () => {
    if (!session) return;
    try {
      await fetchWithAuth("/account/restore", session.access_token, { method: "POST" });
      const { data } = await supabase
        .from("user_profiles")
        .select("display_name, role, avatar_url, deleted_at, purge_after")
        .eq("user_id", session.user.id)
        .single();
      setProfile({ ...(data || {}), email: session.user.email || undefined });
    } catch (err: any) {
      setError(err.message || "恢复失败，请稍后再试");
    }
  };

  const stats = { points: 0, coupons: 0, balance: 0 };

  return (
    <div className="h-full flex flex-col">
      <ProfileTab
        profile={profile || {}}
        onSignOut={handleSignOut}
        onDeactivate={handleDeactivate}
        onRestore={handleRestore}
        avatarUrl={profile?.avatar_url}
        stats={stats}
      />
      {error && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-sm text-rose-500 px-3 py-2 bg-white/90 backdrop-blur rounded-full shadow">
          {error}
        </div>
      )}
    </div>
  );
}

