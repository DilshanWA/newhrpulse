"use client";

import { Check, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, TableWrap, THead, statusTone } from "@/components/ui";
import { LEAVE_POLICY, leaveBalance, leaveDays, validateLeave, type LeaveType } from "@/domain/policy";
import { useConfirm } from "@/components/ui/confirm";
import { can, type LeaveRequest } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useRealtime } from "@/hooks/useRealtime";
import { useSession } from "@/hooks/useSession";
import { cn, fmtDate, todayStr, withYouLabel } from "@/lib/utils";
import { services } from "@/services";

const TYPES: LeaveType[] = ["Annual", "Sick", "Casual", "Unpaid"];

function Meter({ label, used, total, hint }: { label: string; used: number; total: number; hint: string }) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  const full = used >= total;
  return (
    <Card>
      <p className="label">{label}</p>
      <p className="text-2xl font-semibold text-white">
        {used}
        <span className="text-base font-normal text-slate-400"> / {total} days used</span>
      </p>
      <div className="mt-3 h-2 rounded-full bg-slate-100">
        <div
          className={cn("h-2 rounded-full", full ? "bg-rose-400" : "bg-gradient-to-r from-brand-600 to-brand-300")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">{hint}</p>
    </Card>
  );
}

export default function LeavePage() {
  const { user } = useSession();
  const confirm = useConfirm();
  const isStaff = !!user && can.approveLeave(user.role);
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [form, setForm] = useState({ type: "Annual" as LeaveType, from: todayStr(), to: todayStr(), reason: "" });

  const { data, loading, reload, refresh } = useAsync(async () => {
    const [rows, emps] = await Promise.all([
      services.leave.list(isStaff ? undefined : { employeeId: user?.employeeId }),
      services.employees.list(),
    ]);
    return { rows, emps };
  }, [user?.id]);
  // New requests and decisions appear without reloading the page.
  useRealtime("leave", refresh);

  const empId = user?.employeeId;
  const bal = useMemo(() => (data && empId ? leaveBalance(data.rows, empId) : undefined), [data, empId]);
  const problem = useMemo(
    () => (data && empId ? validateLeave(data.rows, { employeeId: empId, type: form.type, from: form.from, to: form.to }) : null),
    [data, empId, form.type, form.from, form.to],
  );
  const days = leaveDays(form.from, form.to);

  async function submit() {
    if (!empId || problem) return;
    try {
      setSubmitError(undefined);
      await services.leave.create({ employeeId: empId, ...form });
      setOpen(false);
      setForm({ ...form, reason: "" });
      reload();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not submit the request.");
    }
  }
  async function decide(l: LeaveRequest, s: "approved" | "rejected") {
    const who = withYouLabel(data?.emps.find((e) => e.id === l.employeeId)?.name ?? "this employee", l.employeeId === user?.employeeId);
    const n = leaveDays(l.from, l.to);
    const ok = await confirm({
      title: s === "approved" ? "Approve leave request?" : "Reject leave request?",
      message: (
        <>
          <b className="text-slate-700">{who}</b> · {l.type} leave, {fmtDate(l.from)}
          {l.to !== l.from && <> – {fmtDate(l.to)}</>} ({n} working day{n === 1 ? "" : "s"}).
          {l.reason && <span className="mt-2 block italic">&ldquo;{l.reason}&rdquo;</span>}
          <span className="mt-2 block">{who.split(" ")[0]} will be notified straight away.</span>
        </>
      ),
      confirmLabel: s === "approved" ? "Approve" : "Reject",
      tone: s === "approved" ? "info" : "danger",
      action: () => services.leave.setStatus(l.id, s),
    });
    if (ok) refresh();
  }

  return (
    <>
      <PageHeader
        title="Leave"
        subtitle={isStaff ? "Review requests and see everyone's balance" : "Request and track your leave"}
        actions={
          <Button onClick={() => { setSubmitError(undefined); setOpen(true); }}>
            <Plus size={16} /> Request leave
          </Button>
        }
      />

      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          {bal && (
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <Meter
                label={`Annual leave ${new Date().getFullYear()}`}
                used={bal.annualUsed}
                total={LEAVE_POLICY.annualEntitlement}
                hint={`${bal.annualLeft} days remaining this year`}
              />
              <Meter
                label="This month"
                used={bal.monthUsed}
                total={LEAVE_POLICY.monthlyLimit}
                hint={`Maximum ${LEAVE_POLICY.monthlyLimit} days per month`}
              />
              <Card>
                <p className="label">You can still take this month</p>
                <p className="text-2xl font-semibold text-brand-400">
                  {bal.availableThisMonth} <span className="text-base font-normal text-slate-400">day{bal.availableThisMonth === 1 ? "" : "s"}</span>
                </p>
                <p className="mt-3 text-xs text-slate-400">Pending requests count towards your balance. Rejected ones do not.</p>
              </Card>
            </div>
          )}

          <TableWrap>
            <THead cols={["Employee", "Type", "From", "To", "Days", "Reason", "Status", ""]} />
            <tbody>
              {data.rows.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="td">{withYouLabel(data.emps.find((e) => e.id === l.employeeId)?.name ?? "—", l.employeeId === user?.employeeId)}</td>
                  <td className="td">{l.type}</td>
                  <td className="td">{fmtDate(l.from)}</td>
                  <td className="td">{fmtDate(l.to)}</td>
                  <td className="td">{leaveDays(l.from, l.to)}</td>
                  <td className="td max-w-[200px] truncate">{l.reason}</td>
                  <td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                  <td className="td text-right">
                    {isStaff && l.status === "pending" && (
                      <span className="inline-flex gap-2">
                        <Button size="sm" aria-label="Approve" onClick={() => decide(l, "approved")}><Check size={14} /></Button>
                        <Button size="sm" variant="danger" aria-label="Reject" onClick={() => decide(l, "rejected")}><X size={14} /></Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {!data.rows.length && <Empty text="No leave requests." />}

          {isStaff && (
            <>
              <h2 className="mb-3 mt-10 text-lg font-semibold text-white">Leave balances · {new Date().getFullYear()}</h2>
              <TableWrap>
                <THead cols={["Employee", "Annual used", "Annual left", "Used this month", "Left this month"]} />
                <tbody>
                  {data.emps
                    .filter((e) => e.status !== "terminated")
                    .map((e) => {
                      const b = leaveBalance(data.rows, e.id);
                      return (
                        <tr key={e.id} className="border-b border-slate-100">
                          <td className="td font-medium">{withYouLabel(e.name, e.id === user?.employeeId)}</td>
                          <td className="td">{b.annualUsed} / {LEAVE_POLICY.annualEntitlement}</td>
                          <td className={cn("td font-semibold", b.annualLeft === 0 ? "text-rose-300" : "text-brand-400")}>{b.annualLeft}</td>
                          <td className="td">{b.monthUsed} / {LEAVE_POLICY.monthlyLimit}</td>
                          <td className={cn("td font-semibold", b.monthLeft === 0 ? "text-rose-300" : "text-brand-400")}>{b.monthLeft}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </TableWrap>
            </>
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Request leave">
        <div className="space-y-4">
          <Field label="Type">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input type="date" className="input" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} /></Field>
            <Field label="To"><input type="date" min={form.from} className="input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
          </div>
          <Field label="Reason"><textarea className="input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>

          <div className={cn("rounded-xl border px-4 py-3 text-sm", problem ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-brand-500/20 bg-brand-500/[0.07] text-slate-200")}>
            {problem ?? `${days} working day${days === 1 ? "" : "s"}${form.type === "Unpaid" ? " (unpaid, does not use your balance)" : ""}.`}
          </div>
          {submitError && <p className="text-sm text-rose-300">{submitError}</p>}
          <Button className="w-full" onClick={submit} disabled={!!problem || !empId}>Submit request</Button>
        </div>
      </Modal>
    </>
  );
}
