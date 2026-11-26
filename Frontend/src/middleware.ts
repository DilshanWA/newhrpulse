import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession } from "@/lib/session";
import { redirectFor } from "@/lib/access";

const PUBLIC = ["/login"];

/**
 * Demo-mode gate only. In API mode the Better Auth session cookie belongs to the
 * backend's domain, so AppShell checks the session and roles on the client and
 * the API enforces them on every request.
 */
export function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "api") return NextResponse.next();

  const { pathname } = req.nextUrl;
  const user = decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (user && isPublic) return NextResponse.redirect(new URL("/dashboard", req.url));
  const to = user ? redirectFor(user.role, pathname) : null;
  if (to) return NextResponse.redirect(new URL(to, req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
