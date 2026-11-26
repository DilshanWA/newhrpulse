"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Notice } from "@/domain/types";
import { useRealtime } from "@/hooks/useRealtime";
import { services } from "@/services";

const TOAST_MS = 8000;

/** Header bell with unread count, plus pop-up toasts for notifications pushed live. */
export function LiveNotifications() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Notice[]>([]);

  const loadCount = useCallback(() => {
    services.notices
      .list()
      .then((l) => setUnread(l.filter((n) => !n.read).length))
      .catch(() => {}); // the badge is optional; never break the shell
  }, []);
  useEffect(loadCount, [loadCount]);

  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useRealtime("notification", (data) => {
    const n = data as Notice;
    if (!n?.id) return;
    setUnread((c) => c + 1);
    setToasts((t) => [n, ...t.filter((x) => x.id !== n.id)].slice(0, 4));
    setTimeout(() => dismiss(n.id), TOAST_MS);

    // System notification when the tab is in the background (only if the user allowed it).
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      const sys = new Notification(n.title, { body: n.body, tag: n.id });
      sys.onclick = () => {
        window.focus();
        if (n.link) router.push(n.link);
        sys.close();
      };
    }
  });
  useRealtime("notifications-read", loadCount);

  return (
    <>
      <Link
        href="/notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative rounded-xl p-2.5 text-slate-600 hover:bg-slate-100"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold !text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>

      <div aria-live="polite" className="pointer-events-none fixed right-4 top-16 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((n) => (
          <div key={n.id} role="status" className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <Bell size={16} className="mt-0.5 shrink-0 text-brand-500" />
            <button
              className="flex-1 text-left"
              onClick={() => {
                dismiss(n.id);
                router.push(n.link || "/notifications");
              }}
            >
              <p className="text-sm font-medium text-slate-900">{n.title}</p>
              <p className="text-xs text-slate-500">{n.body}</p>
            </button>
            <button onClick={() => dismiss(n.id)} aria-label="Dismiss" className="rounded p-0.5 text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
