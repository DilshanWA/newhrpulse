"use client";

import { Badge, Card, PageHeader } from "@/components/ui";
import { ProfilePhotoCard } from "@/components/features/ProfilePhotoCard";
import { useSession } from "@/hooks/useSession";
import { USE_MOCK } from "@/lib/http";

export default function SettingsPage() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and environment" />
      <div className="grid max-w-3xl gap-5">
        <ProfilePhotoCard />
        <Card>
          <h3 className="mb-3 font-semibold text-white">Sign-in</h3>
          <p className="text-sm text-slate-400">This workspace uses Microsoft account sign-in only. Passwords are never stored here.</p>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-white">Data source</h3>
          <Badge tone={USE_MOCK ? "amber" : "green"}>{USE_MOCK ? "Demo data (browser)" : "Live backend API"}</Badge>
          <p className="mt-3 text-sm text-slate-400">Change <code className="rounded bg-slate-100 px-1.5">NEXT_PUBLIC_DATA_SOURCE</code> in <code className="rounded bg-slate-100 px-1.5">.env.local</code>.</p>
        </Card>
      </div>
    </>
  );
}
