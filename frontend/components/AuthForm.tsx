"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabaseClient";

type Mode = "login" | "signup";

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    if (!email || !password) {
      setError("Email and password are required");
      setLoading(false);
      return;
    }
    const action =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { data, error } = await action;
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage(mode === "login" ? "Signed in successfully" : "Signed up, you can now sign in");
    if (data.session) {
      router.push("/chat");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="animate-fade-in">
      <div className="tabs">
        <button
          type="button"
          className={`tab ${mode === "login" ? "active" : ""}`}
          onClick={() => setMode("login")}
        >
          Login
        </button>
        <button
          type="button"
          className={`tab ${mode === "signup" ? "active" : ""}`}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      <div className="form-group">
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>

      <div className="form-group">
        <label className="label">Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          required
          minLength={6}
        />
      </div>

      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.3" />
              <path d="M4 12a8 8 0 018-8v8H4z" fill="currentColor" />
            </svg>
            Processing...
          </span>
        ) : mode === "login" ? (
          "Sign In"
        ) : (
          "Create Account"
        )}
      </button>

      {message && <div className="text-success text-center">{message}</div>}
      {error && <div className="text-error text-center">{error}</div>}
    </form>
  );
}
