"use client";

import AuthCard from "@/components/AuthCard";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <AuthCard initialView="signup" />
      </div>
    </div>
  );
}
