/**
 * HTTP client used by the "api" implementation of each service.
 * Set NEXT_PUBLIC_DATA_SOURCE=api; Vercel uses the same-origin /api proxy.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:4000/api");

/** API-relative paths ("/avatars/…") become absolute; data:/blob:/http URLs pass through. */
export function assetUrl(p?: string | null) {
  if (!p) return undefined;
  return p.startsWith("/") ? `${API_BASE}${p}` : p;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include", // httpOnly session cookie issued by the backend
      headers: isForm || body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the HR Pulse server. Check your connection and try again.");
  }
  if (!res.ok) {
    // The API answers errors as { error, code? }; fall back to the raw text.
    const text = await res.text();
    let message = text || res.statusText;
    let code: string | undefined;
    try {
      const j = JSON.parse(text);
      if (typeof j?.error === "string") message = j.error;
      if (typeof j?.code === "string") code = j.code;
    } catch {}
    throw new ApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Hands the browser a file to save under `fileName`. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Downloads a protected file with the session cookie; API errors surface as ApiError, not a raw tab. */
async function download(path: string, fileName: string) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  } catch {
    throw new ApiError(0, "Cannot reach the HR Pulse server. Check your connection and try again.");
  }
  if (!res.ok) {
    let message = res.statusText || "Download failed";
    try {
      const j = await res.json();
      if (typeof j?.error === "string") message = j.error;
    } catch {}
    throw new ApiError(res.status, message);
  }
  saveBlob(await res.blob(), fileName);
}

export const http = {
  download,
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b),
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
};

export const USE_MOCK = (process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock") === "mock";
