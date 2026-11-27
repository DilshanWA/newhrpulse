"use client";

import { Briefcase, ClipboardList, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { can } from "@/domain/types";
import { useSession } from "@/hooks/useSession";

export default function AdminHome() {
  const { user } = useSession();
  if (!user) return null;
  const tiles = [
    { href: "/admin/users", icon: Users, title: "Users", text: "See all accounts and their roles.", show: true },
    { href: "/recruitment", icon: Briefcase, title: "Recruitment", text: "Post open roles and manage candidates and interviews.", show: can.manageEmployees(user.role) },
    { href: "/admin/roles", icon: ShieldCheck, title: "Roles & permissions", text: "Promote or demote admins (Super Admin only).", show: can.manageRoles(user.role) },
    { href: "/admin/audit", icon: ClipboardList, title: "Audit log", text: "Who changed what and when (Super Admin only).", show: can.viewAudit(user.role) },
  ].filter((t) => t.show);
  return (
    <>
      <PageHeader title="Admin panel" subtitle="Access control and oversight" />
      <div className="grid gap-5 md:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="h-full transition hover:border-brand-500/40 hover:shadow-glow">
              <div className="mb-4 inline-flex rounded-xl bg-brand-500/15 p-3 text-brand-400"><t.icon size={22} /></div>
              <p className="font-semibold text-white">{t.title}</p>
              <p className="mt-1 text-sm text-slate-400">{t.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
