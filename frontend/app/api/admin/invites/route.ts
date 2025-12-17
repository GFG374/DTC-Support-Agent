import { backendBase } from "@/lib/api";

export async function POST(req: Request) {
  const authorization = req.headers.get("authorization") || "";

  try {
    const body = await req.text();
    const upstream = await fetch(`${backendBase}/admin/invites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body,
      cache: "no-store",
    });

    const contentType = upstream.headers.get("content-type") || "";
    const payload = await upstream.text();
    return new Response(payload, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType || "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "backend_unreachable",
        message: err?.message || "Failed to reach backend",
        backend: backendBase,
      }),
      { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
}

