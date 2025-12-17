import { backendBase } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const auth = req.headers.get("authorization") || "";
  const res = await fetch(`${backendBase}/api/chat/kimi`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text || `backend status ${res.status}` }, { status: res.status });
  }

  // 流式响应，禁用缓冲
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
