import { backendBase } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const auth = req.headers.get("authorization") || "";
  const res = await fetch(`${backendBase}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });

  // If backend出错，读取文本方便前端排查
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text || `backend status ${res.status}` }, { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "text/plain";
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "content-type": contentType,
    },
  });
}
