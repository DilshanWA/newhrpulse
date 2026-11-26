"use client";

import { Download, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { reportError } from "@/lib/errors";
import { Badge, Button, Empty, PageHeader, Spinner, Stat, TableWrap, THead, statusTone } from "@/components/ui";
import { EmailedTag, EmailMonthButton, EmailSlipButton, useMailReady } from "@/components/features/PayslipEmail";
import { teacherGross, teacherNet, type TeacherPayLine } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { downloadCsv, monthStr, money, withYouLabel } from "@/lib/utils";
import { services } from "@/services";

type NumKey = "sessions" | "hours" | "rate" | "allowance" | "deduction";

export default function TeacherPayPage() {
  const { user } = useSession();
  const [month, setMonth] = useState(monthStr());
  const mailReady = useMailReady();
  const { data, setData, loading, reload, refresh } = useAsync(async () => {
    if (!month) return { lines: [] as TeacherPayLine[], emps: [] };
    const [lines, emps] = await Promise.all([services.payroll.listTeacherPay(month), services.employees.list()]);
    return { lines, emps };
  }, [month]);
  const [busy, setBusy] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const lines = data?.lines ?? [];
  const name = (id: string) => data?.emps.find((e) => e.id === id)?.name ?? id;
  const displayName = (id: string) => withYouLabel(name(id), id === user?.employeeId);

  async function generate() {
    if (!month) return;
    setBusy(true);
    try {
      const l = await services.payroll.generateTeacherPay(month);
      setData((d) => d && { ...d, lines: l });
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  /** Updates the row at once; saves typed amounts after a pause, status changes immediately. */
  function patch(l: TeacherPayLine, p: Partial<TeacherPayLine>) {
    const next = { ...l, ...p };
    if ("sessions" in p) next.sessions = Math.round(next.sessions);
    setData((d) => d && { ...d, lines: d.lines.map((x) => (x.id === l.id ? next : x)) });
    clearTimeout(timers.current.get(l.id));
    const save = () => {
      timers.current.delete(l.id);
      services.payroll
        .updateTeacherPay(next)
        // Only take "emailed" back from the server (it clears when amounts change); keep what the user is typing.
        .then((saved) => setData((d) => d && { ...d, lines: d.lines.map((x) => (x.id === saved.id ? { ...x, emailedAt: saved.emailedAt } : x)) }))
        .catch((e) => { reportError(e); reload(); });
    };
    if ("status" in p) save();
    else timers.current.set(l.id, setTimeout(save, 600));
  }

  return (
    <>
      <PageHeader
        title="Teacher pay sheet"
        subtitle="Sessions, hours and rate per teacher. Replaces the Excel sheet."
        actions={
          <>
            <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Button variant="secondary" onClick={generate} disabled={busy}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Generate month</Button>
            <Button variant="secondary" disabled={!lines.length} onClick={() => downloadCsv(`teachers-${month}.csv`, [["Teacher name", "Sessions", "Hours", "Rate", "Gross", "Allowance", "Deduction", "Net", "Status"], ...lines.map((l) => [name(l.employeeId), l.sessions, l.hours, l.rate, teacherGross(l), l.allowance, l.deduction, teacherNet(l), l.status])])}>
              <Download size={15} /> CSV
            </Button>
            <EmailMonthButton kind="teachers" month={month} lines={lines} mailReady={mailReady} onDone={refresh} />
          </>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Teachers" value={lines.length} />
        <Stat label="Total hours" value={lines.reduce((s, l) => s + l.hours, 0)} tone="violet" />
        <Stat label="Total net payable" value={money(lines.reduce((s, l) => s + teacherNet(l), 0))} tone="amber" />
      </div>

      {loading ? (
        <Spinner />
      ) : !lines.length ? (
        <Empty text={`No teacher sheet for ${month}. Click “Generate month”.`} />
      ) : (
        <TableWrap>
          <THead cols={["Teacher name", "Sessions", "Hours", "Rate", "Gross", "Allowance", "Deduction", "Net", "Status", ""]} />
          <tbody>
            {lines.map((l) => {
              const locked = l.status === "paid";
              return (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="td font-medium">{displayName(l.employeeId)}</td>
                  {(["sessions", "hours", "rate"] as NumKey[]).map((k) => (
                    <td key={k} className="td">
                      <input type="number" min={0} disabled={locked} className="input w-24 py-1.5 disabled:opacity-60" value={l[k]} onChange={(e) => patch(l, { [k]: Math.max(0, +e.target.value) } as Partial<typeof l>)} />
                    </td>
                  ))}
                  <td className="td">{money(teacherGross(l))}</td>
                  {(["allowance", "deduction"] as NumKey[]).map((k) => (
                    <td key={k} className="td">
                      <input type="number" min={0} disabled={locked} className="input w-24 py-1.5 disabled:opacity-60" value={l[k]} onChange={(e) => patch(l, { [k]: Math.max(0, +e.target.value) } as Partial<typeof l>)} />
                    </td>
                  ))}
                  <td className="td font-semibold text-brand-400">{money(teacherNet(l))}</td>
                  <td className="td">
                    <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    <EmailedTag at={l.emailedAt} />
                  </td>
                  <td className="td text-right">
                    <span className="inline-flex items-center gap-2">
                      {l.status === "draft" && <Button size="sm" onClick={() => patch(l, { status: "approved" })}>Approve</Button>}
                      {l.status === "approved" && <Button size="sm" variant="secondary" onClick={() => patch(l, { status: "paid" })}>Mark paid</Button>}
                      <EmailSlipButton
                        kind="teachers"
                        line={l}
                        employee={data?.emps.find((e) => e.id === l.employeeId)}
                        net={teacherNet(l)}
                        mailReady={mailReady}
                        onSent={(saved) => setData((d) => d && { ...d, lines: d.lines.map((x) => (x.id === saved.id ? (saved as TeacherPayLine) : x)) })}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
