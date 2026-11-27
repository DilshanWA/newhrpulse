import type { Role } from "@/domain/types";

const ADMIN_ONLY = ["/employees", "/payroll", "/teachers", "/commissions", "/reports", "/admin", "/recruitment"];
const SUPERADMIN_ONLY = ["/admin/roles", "/admin/audit"];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Where a user should be sent instead of `path`, or null if they may view it.
 * Used by the middleware (demo mode) and AppShell (API mode). The backend
 * enforces the same rules on every API call; this only keeps the UI tidy.
 */
export function redirectFor(role: Role, path: string): string | null {
  if (role !== "superadmin" && SUPERADMIN_ONLY.some((p) => under(path, p))) return role === "admin" ? "/admin" : "/dashboard";
  if (role === "employee" && ADMIN_ONLY.some((p) => under(path, p))) return "/dashboard";
  return null;
}

/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login") ? next : fallback;
}
