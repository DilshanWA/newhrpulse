"use client";

import { LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm";
import { useRealtime } from "@/hooks/useRealtime";
import { useSession } from "@/hooks/useSession";
import { cn, withYouLabel } from "@/lib/utils";
import { services } from "@/services";
import { NAV } from "./nav";

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const path = usePathname();
  const router = useRouter();
  const { user, signOut } = useSession();
  const confirm = useConfirm();
  const [pendingLeave, setPendingLeave] = useState(0);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();

  const isAdmin = !!user && user.role !== "employee";
  const loadPending = useCallback(() => {
    if (!isAdmin) return;
    services.leave
      .list()
      .then((l) => setPendingLeave(l.filter((x) => x.status === "pending").length))
      .catch(() => setPendingLeave(0)); // badge is optional; never crash the shell
  }, [isAdmin]);
  useEffect(loadPending, [loadPending, path]);
  useRealtime("leave", loadPending, isAdmin);

  if (!user) return null;

  return (
    <aside
      className={cn(
        "fixed inset-y-3 left-3 z-40 flex w-64 flex-col rounded-3xl border border-white/20 bg-brand-500 shadow-xl transition-transform lg:inset-y-4 lg:left-4 lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="mx-3 mt-3 flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-4 shadow-sm">
        <Image src="/logo-deep-royal-blue.svg" alt="" width={40} height={40} priority className="brightness-0 invert" />
        <div>
          <p className="font-semibold leading-tight text-slate-50">HR Pulse</p>
          <p className="text-[10px] uppercase tracking-widest text-slate-50/70">Software</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV.map((g) => {
          const items = g.items.filter((i) => i.roles.includes(user.role));
          if (!items.length) return null;
          return (
            <div key={g.title}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-50/70">{g.title}</p>
              <ul className="space-y-1">
                {items.map((i) => {
                  const active = path === i.href || (i.href !== "/dashboard" && path.startsWith(i.href));
                  const badge = i.badgeKey === "leave" ? pendingLeave : 0;
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                          active ? "bg-white text-brand-700 shadow-sm" : "text-slate-50 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <i.icon size={18} />
                        <span className="flex-1">{i.label}</span>
                        {badge > 0 && <span className="rounded-full bg-orange-500 px-1.5 text-[11px] font-semibold text-white">{badge}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="p-3">
        {signOutError && (
          <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {signOutError}
          </p>
        )}
        <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 shadow-sm">
          <Avatar name={user.name} src={user.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-50">{withYouLabel(user.name, true)}</p>
            <p className="truncate text-xs text-slate-50/80">{user.email}</p>
            <p className="text-[11px] capitalize text-slate-50/70">{user.role === "superadmin" ? "Super Admin" : user.role}</p>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            disabled={signOutPending}
            title="Sign out"
            onClick={async () => {
              setSignOutError(undefined);
              setSignOutPending(true);
              // The dialog runs the sign-out itself and shows any error with a retry.
              const ok = await confirm({
                title: "Sign out of HR Pulse?",
                message: "You'll need to sign in with your Microsoft account again to continue.",
                confirmLabel: "Sign out",
                tone: "info",
                icon: "logout",
                action: signOut,
              });
              setSignOutPending(false);
              if (ok) {
                router.replace("/login");
                router.refresh();
              }
            }}
            className="rounded-lg p-2 text-slate-50/70 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
