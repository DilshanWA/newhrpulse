"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, Badge, Button, Field, Modal, PageHeader, RoleBadge, Spinner, TableWrap, THead, statusTone } from "@/components/ui";
import type { Employee } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { fmtDate, todayStr, withYouLabel } from "@/lib/utils";
import { messageOf } from "@/lib/errors";
import { services } from "@/services";

const blank = { name: "", email: "", phone: "", department: "", position: "", type: "staff" as Employee["type"], baseSalary: 0, hourlyRate: 0 };

export default function EmployeesPage() {
  const { user, refresh } = useSession();
  const { data, loading, reload } = useAsync(() => services.employees.list());
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [saveErr, setSaveErr] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setSaveErr(undefined);
    try {
      const email = f.email.trim().toLowerCase();
      await services.employees.create({
        ...f, email, status: "active", joinedOn: todayStr(),
        hourlyRate: f.type === "teacher" ? f.hourlyRate : undefined,
      });
      if (user?.email.toLowerCase() === email) await refresh();
      setOpen(false);
      setF(blank);
      reload();
    } catch (e) {
      setSaveErr(messageOf(e, "Could not save the employee."));
    } finally {
      setSaving(false);
    }
  }

  const rows = (data ?? []).filter((e) => `${e.name} ${e.code} ${e.department}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Employees" subtitle="Profiles, contracts and employment details" actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> Add employee</Button>} />
      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="absolute left-3.5 top-3 text-slate-500" />
        <input className="input pl-10" placeholder="Search name, code, department…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <TableWrap>
          <THead cols={["Employee", "Code", "Department", "Type", "Joined", "Status"]} />
          <tbody>
            {rows.map((e) => {
              const status = e.status === "active" && !e.accessRole ? "pending" : e.status;
              return (
                <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="td">
                    <Link href={`/employees/${e.id}`} className="flex items-center gap-3 hover:text-brand-400">
                      <Avatar name={e.name} src={e.avatarUrl} />
                      <span>
                        <span className="flex items-center gap-2 font-medium">{withYouLabel(e.name, e.id === user?.employeeId)} <RoleBadge role={e.accessRole} /></span>
                        <span className="block text-xs text-slate-500">{e.position}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="td">{e.code}</td>
                  <td className="td">{e.department}</td>
                  <td className="td">{e.type === "teacher" ? "Teacher" : "Employer"}</td>
                  <td className="td">{fmtDate(e.joinedOn)}</td>
                  <td className="td"><Badge tone={statusTone(status)}>{status.replace("_", " ")}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add employee">
        <div className="space-y-3">
          <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Type">
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Employee["type"] })}>
                <option value="staff">Employer</option><option value="teacher">Teacher</option>
              </select>
            </Field>
            <Field label="Department"><input className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
            <Field label="Position"><input className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></Field>
          </div>
          {f.type === "staff" ? (
            <Field label="Base salary (LKR)"><input className="input" type="number" value={f.baseSalary} onChange={(e) => setF({ ...f, baseSalary: +e.target.value })} /></Field>
          ) : (
            <Field label="Hourly rate (LKR)"><input className="input" type="number" value={f.hourlyRate} onChange={(e) => setF({ ...f, hourlyRate: +e.target.value })} /></Field>
          )}
          {saveErr && <p className="text-sm text-rose-500">{saveErr}</p>}
          <Button className="w-full" onClick={save} disabled={saving || !f.name.trim() || !f.email.trim()}>{saving ? "Saving…" : "Save employee"}</Button>
        </div>
      </Modal>
    </>
  );
}
