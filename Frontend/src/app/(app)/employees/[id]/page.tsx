"use client";

import { ArrowLeft, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { ContractsPanel } from "@/components/features/ContractsPanel";
import { Avatar, Badge, Card, RoleBadge, Spinner, statusTone } from "@/components/ui";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { fmtDate, money, withYouLabel } from "@/lib/utils";
import { services } from "@/services";

export default function EmployeeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSession();
  const { data: e, loading } = useAsync(() => services.employees.get(id), [id]);

  if (loading) return <Spinner />;
  if (!e) return <p className="text-slate-400">Employee not found.</p>;

  return (
    <>
      <Link href="/employees" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={15} /> Employees
      </Link>
      <Card className="mb-6 flex flex-wrap items-center gap-5">
        <Avatar name={e.name} src={e.avatarUrl} size={64} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-white">{withYouLabel(e.name, e.id === user?.employeeId)}</h1>
            <RoleBadge role={e.accessRole} />
          </div>
          <p className="text-slate-400">{e.position} · {e.department}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-300">
            <span className="inline-flex items-center gap-1.5"><Mail size={14} /> {e.email}</span>
            <span className="inline-flex items-center gap-1.5"><Phone size={14} /> {e.phone}</span>
          </div>
        </div>
        <Badge tone={statusTone(e.status)}>{e.status.replace("_", " ")}</Badge>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Employee code", e.code],
          ["Type", e.type === "teacher" ? "Teacher" : "Employer"],
          ["Joined", fmtDate(e.joinedOn)],
          [e.type === "teacher" ? "Hourly rate" : "Base salary", money(e.type === "teacher" ? e.hourlyRate ?? 0 : e.baseSalary)],
        ].map(([k, v]) => (
          <Card key={k}><p className="label">{k}</p><p className="text-lg font-semibold text-white">{v}</p></Card>
        ))}
      </div>

      <ContractsPanel employeeId={e.id} employeeName={e.id === user?.employeeId ? "you" : e.name} />
    </>
  );
}
