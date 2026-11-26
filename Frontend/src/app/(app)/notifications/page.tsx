"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Empty, PageHeader, Spinner } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { useRealtime } from "@/hooks/useRealtime";
import { emit } from "@/lib/realtime";
import { cn, fmtDate, fmtDateTime, fmtTime } from "@/lib/utils";
import { services } from "@/services";

export default function NotificationsPage() {
  const { data, loading, reload, refresh } = useAsync(() => services.notices.list());
  useRealtime("notification", refresh);

  // Desktop alerts need the browser's permission, which may only be asked after a click.
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  useEffect(() => {
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  async function markAllRead() {
    await services.notices.markAllRead();
    emit("notifications-read");
    reload();
  }

  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            {permission === "default" && (
              <Button variant="secondary" onClick={async () => setPermission(await Notification.requestPermission())}>
                Enable desktop alerts
              </Button>
            )}
            <Button variant="secondary" onClick={markAllRead}>Mark all read</Button>
          </>
        }
      />
      {!data?.length ? (
        <Empty text="You're all caught up." />
      ) : (
        <div className="space-y-3">
          {data.map((n) => {
            const body = (
              <Card className="flex items-start gap-4">
                <div className={cn("rounded-xl p-2.5", n.read ? "bg-slate-100 text-slate-500" : "bg-brand-500/15 text-brand-400")}><Bell size={18} /></div>
                <div className="flex-1">
                  <p className={cn("font-medium", n.read ? "text-slate-300" : "text-white")}>{n.title}</p>
                  <p className="text-sm text-slate-400">{n.body}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-slate-500" title={fmtDateTime(n.at)}>{fmtDate(n.at)} · {fmtTime(n.at)}</span>
              </Card>
            );
            return n.link ? <Link key={n.id} href={n.link} className="block">{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </div>
      )}
    </>
  );
}
