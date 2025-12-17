"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/inbox");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-gray-400 text-sm">Loading workspace...</p>
    </div>
  );
}