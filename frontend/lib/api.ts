const backendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:8000";

const toUrl = (path: string) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.startsWith("/api") ? `${backendBase}${normalized}` : `${backendBase}/api${normalized}`;
};

export async function fetchWithAuth(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<any> {
  const res = await fetch(toUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend error ${res.status}: ${text}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

export async function postPublic(path: string, body: any): Promise<any> {
  const res = await fetch(`${backendBase}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Backend error ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "";
  return contentType.includes("application/json") ? res.json() : res.text();
}

export { backendBase };
