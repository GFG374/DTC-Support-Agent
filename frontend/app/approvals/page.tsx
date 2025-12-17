"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import supabase from "@/lib/supabaseClient";
import { fetchWithAuth } from "@/lib/api";

type ApprovalTask = {
  id: string;
  status: string;
  reason?: string;
  created_at?: string;
};

export default function ApprovalsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSession(data.session);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    fetchWithAuth("/approvals", session.access_token)
      .then((data) => setTasks(data.items || []))
      .catch((err) => console.error(err));
  }, [session]);

  if (!session) {
    return (
      <main className="page">
        <div className="glass" style={{ padding: "32px" }}>
          <p>Checking your session...</p>
        </div>
      </main>
    );
  }

  const updateStatus = async (id: string, action: "approve" | "reject") => {
    await fetchWithAuth(`/approvals/${id}/${action}`, session.access_token, {
      method: "POST",
    });
    const refreshed = await fetchWithAuth("/approvals", session.access_token);
    setTasks(refreshed.items || []);
  };

  return (
    <main className="page">
      <div className="glass" style={{ padding: "32px" }}>
        <div className="pill">Approvals</div>
        <h1 style={{ margin: "12px 0 8px" }}>Pending tasks</h1>
        <div className="card-grid" style={{ marginTop: "16px" }}>
          {tasks.map((task) => (
            <div key={task.id} className="glass" style={{ padding: "16px" }}>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>Task {task.id}</div>
              <div style={{ fontWeight: 700, margin: "8px 0" }}>{task.status}</div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>{task.reason || "Pending review"}</div>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button className="btn" onClick={() => updateStatus(task.id, "approve")}>
                  Approve
                </button>
                <button
                  className="btn"
                  style={{ background: "#1f2937", color: "var(--foreground)" }}
                  onClick={() => updateStatus(task.id, "reject")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
          {tasks.length === 0 && <p style={{ color: "var(--muted)" }}>No approval tasks right now.</p>}
        </div>
      </div>
    </main>
  );
}
