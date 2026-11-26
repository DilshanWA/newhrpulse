"use client";

import { AlertTriangle, Menu, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { redirectFor } from "@/lib/access";
import { ERROR_EVENT, messageOf } from "@/lib/errors";
import { ApiError } from "@/lib/http";
import { useEffect, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { withYouLabel } from "@/lib/utils";
import { LiveNotifications } from "./LiveNotifications";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const blockedTo = user ? redirectFor(user.role, pathname) : null;

  // Catch failed service calls from any page (load errors and unhandled button actions).
  useEffect(() => {
    const handle = (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        refresh(); // session expired: drops the user, which redirects to /login
        return;
      }
      setError(messageOf(e));
    };
    const onReport = (ev: Event) => handle((ev as CustomEvent).detail);
    const onRejection = (ev: PromiseRejectionEvent) => handle(ev.reason);
    window.addEventListener(ERROR_EVENT, onReport);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener(ERROR_EVENT, onReport);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [refresh]);

  useEffect(() => setError(undefined), [pathname]);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (blockedTo) router.replace(blockedTo);
  }, [ready, user, blockedTo, pathname, router]);

  if (!ready || !user || blockedTo) return <Spinner />;

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <p className="hidden text-sm text-slate-400 lg:block">
            Welcome back, <span className="font-medium text-white">{withYouLabel(user.name.split(" ")[0], true)}</span>
          </p>
          <LiveNotifications />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
          {error && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p className="flex-1">{error}</p>
              <button onClick={() => setError(undefined)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-rose-100">
                <X size={16} />
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
