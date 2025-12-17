"use client";

import { User as UserIcon } from "lucide-react";

export default function Avatar({
  url,
  fallback,
  className = "",
}: {
  url?: string | null;
  fallback?: React.ReactNode;
  className?: string;
}) {
  if (url) {
    return <img src={url} alt="avatar" className={`w-9 h-9 rounded-full border object-cover ${className}`} />;
  }
  return (
    <div className={`w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-xs ${className}`}>
      {fallback || <UserIcon size={16} />}
    </div>
  );
}
