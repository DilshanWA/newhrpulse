import type { Role, User } from "@/domain/types";

/**
 * DEMO session helpers (cookie readable by middleware).
 * Production authentication uses Better Auth's httpOnly session cookie.
 */
export const SESSION_COOKIE = "hrp_session";

export const encodeSession = (u: User) => encodeURIComponent(JSON.stringify(u));

export function decodeSession(raw?: string | null): User | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as User;
  } catch {
    return null;
  }
}

export function readClientSession(): User | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return decodeSession(m?.[1]);
}

export function writeClientSession(u: User) {
  document.cookie = `${SESSION_COOKIE}=${encodeSession(u)}; path=/; max-age=28800; samesite=lax`;
}

export function clearClientSession() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

export const homeFor = (r: Role) => (r === "employee" ? "/dashboard" : "/dashboard");
