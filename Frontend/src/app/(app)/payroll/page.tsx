"use client";

import { CheckCircle2, Download, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { reportError } from "@/lib/errors";
import { Badge, Button, Empty, PageHeader, Spinner, Stat, TableWrap, THead, statusTone } from "@/components/ui";
import { EmailedTag, EmailMonthButton, EmailSlipButton, useMailReady } from "@/components/features/PayslipEmail";
import { salaryNet, type SalaryLine } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { downloadCsv, fmtMonth, monthStr, money, withYouLabel } from "@/lib/utils";
import { services } from "@/services";

type NumKey = "basic" | "allowance" | "commission" | "deduction";

export default function PayrollPage() {
  const { user } = useSession();
  const [month, setMonth] = useState(monthStr());
  const mailReady = useMailReady();
  const { data, setData, loading, reload, refresh } = useAsync(async () => {
    if (!month) return { lines: [] as SalaryLine[], emps: [] };
    const [lines, emps] = await Promise.all([services.payroll.listSalary(month), services.employees.list()]);
    return { lines, emps };
  }, [month]);
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string>();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Typed amounts waiting for their autosave, so "Update month" can save them first. */
  const pending = useRef(new Map<string, SalaryLine>());

  const lines = data?.lines ?? [];
  const name = (id: string) => data?.emps.find((e) => e.id === id)?.name ?? id;
  const displayName = (id: string) => withYouLabel(name(id), id === user?.employeeId);
  const total = lines.reduce((s, l) => s + salaryNet(l), 0);
  const drafts = lines.filter((l) => l.status === "draft").length;

  useEffect(() => setSummary(undefined), [month]);

  /** Creates the month, or refreshes it with new staff, current salaries and newly paid commissions. */
  async function updateMonth() {
    if (!month) return;
    const exists = lines.length > 0;
    if (exists) {
      const ok = await confirm({
        title: `Update the ${fmtMonth(month)} salary sheet?`,
        message: (
          <>
            <span className="block">• Adds staff who aren&apos;t on the sheet yet.</span>
            <span className="block">• On the {drafts} draft line{drafts === 1 ? "" : "s"}, <b className="text-slate-700">Basic</b> is reset to the current base salary and <b className="text-slate-700">Commission</b> to commissions paid in {fmtMonth(month)}.</span>
            <span className="block">• Allowance, deduction and notes you typed are kept.</span>
            <span className="mt-2 block">Approved and paid lines are not changed.</span>
          </>
        ),
        confirmLabel: "Update month",
      });
      if (!ok) return;
    }
    setBusy(true);
    setSummary(undefined);
    try {
      // Save anything still waiting for autosave, so it isn't lost or overwritten out of order.
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
      await Promise.all([...pending.current.values()].map((l) => services.payroll.updateSalary(l)));
      pending.current.clear();

      const r = await services.payroll.updateSalaryMonth(month);
      setData((d) => d && { ...d, lines: r.lines });
      const parts = [
        r.added && `${r.added} employee${r.added === 1 ? "" : "s"} added`,
        r.updated && `${r.updated} draft line${r.updated === 1 ? "" : "s"} updated`,
        r.locked && `${r.locked} approved/paid line${r.locked === 1 ? "" : "s"} left unchanged`,
      ].filter(Boolean);
      setSummary(exists ? (parts.length ? `${parts.join(" · ")}.` : "Already up to date. Nothing changed.") : `Salary sheet created for ${r.lines.length} employee${r.lines.length === 1 ? "" : "s"}.`);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  /** Updates the row at once; saves typed amounts after a pause, status changes immediately. */
  function patch(l: SalaryLine, p: Partial<SalaryLine>) {
    const next = { ...l, ...p };
    setData((d) => d && { ...d, lines: d.lines.map((x) => (x.id === l.id ? next : x)) });
    clearTimeout(timers.current.get(l.id));
    pending.current.set(l.id, next);
    const save = () => {
      timers.current.delete(l.id);
      pending.current.delete(l.id);
      services.payroll
        .updateSalary(next)
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
        title="Salary sheet"
        subtitle="Monthly salary, allowance, commission and deductions for every employee"
        actions={
          <>
            <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
            <Button
              variant="secondary"
              onClick={updateMonth}
              disabled={busy || !month}
              title={lines.length ? "Add new staff and refresh draft lines with current salaries and paid commissions" : "Create the salary sheet for this month"}
            >
              <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> {lines.length ? "Update month" : "Generate month"}
            </Button>
            <Button variant="secondary" disabled={!lines.length} onClick={() => downloadCsv(`salary-${month}.csv`, [["Employee", "Basic", "Allowance", "Commission", "Deduction", "Net", "Status"], ...lines.map((l) => [name(l.employeeId), l.basic, l.allowance, l.commission, l.deduction, salaryNet(l), l.status])])}>
              <Download size={15} /> CSV
            </Button>
            <EmailMonthButton kind="salary" month={month} lines={lines} mailReady={mailReady} onDone={refresh} />
          </>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Employees on sheet" value={lines.length} />
        <Stat label="Total net payable" value={money(total)} tone="violet" />
        <Stat label="Drafts" value={drafts} hint="Not yet approved" tone="amber" />
      </div>
      {summary && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0" /> {summary}
          <button onClick={() => setSummary(undefined)} aria-label="Dismiss" className="ml-auto rounded p-0.5 hover:bg-emerald-100"><X size={14} /></button>
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : !lines.length ? (
        <Empty text={`No salary sheet for ${month}. Click “Generate month”.`} />
      ) : (
        <TableWrap>
          <THead cols={["Employee", "Basic", "Allowance", "Commission", "Deduction", "Net", "Status", ""]} />
          <tbody>
            {lines.map((l) => {
              const locked = l.status === "paid";
              return (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="td font-medium">{displayName(l.employeeId)}</td>
                  {(["basic", "allowance", "commission", "deduction"] as NumKey[]).map((k) => (
                    <td key={k} className="td">
                      <input
                        type="number" min={0} disabled={locked}
                        className="input w-28 py-1.5 disabled:opacity-60"
                        value={l[k]}
                        onChange={(e) => patch(l, { [k]: Math.max(0, +e.target.value) } as Partial<typeof l>)}
                      />
                    </td>
                  ))}
                  <td className="td font-semibold text-brand-400">{money(salaryNet(l))}</td>
                  <td className="td">
                    <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    <EmailedTag at={l.emailedAt} />
                  </td>
                  <td className="td text-right">
                    <span className="inline-flex items-center gap-2">
                      {l.status === "draft" && <Button size="sm" onClick={() => patch(l, { status: "approved" })}>Approve</Button>}
                      {l.status === "approved" && <Button size="sm" variant="secondary" onClick={() => patch(l, { status: "paid" })}>Mark paid</Button>}
                      <EmailSlipButton
                        kind="salary"
                        line={l}
                        employee={data?.emps.find((e) => e.id === l.employeeId)}
                        net={salaryNet(l)}
                        mailReady={mailReady}
                        onSent={(saved) => setData((d) => d && { ...d, lines: d.lines.map((x) => (x.id === saved.id ? (saved as SalaryLine) : x)) })}
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
