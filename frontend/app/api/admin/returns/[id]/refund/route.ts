import { backendBase } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = req.headers.get("authorization") || "";
  const res = await fetch(`${backendBase}/api/admin/returns/${params.id}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
  });

  return new NextResponse(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
