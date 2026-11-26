"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Empty, Field, Modal, PageHeader, Spinner, Stat, TableWrap, THead, Tabs, statusTone } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm";
import { COMMISSION_LABEL, type CommissionKind } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { downloadCsv, fmtDate, money, todayStr, withYouLabel } from "@/lib/utils";
import { services } from "@/services";
import { messageOf } from "@/lib/errors";

type Filter = "all" | CommissionKind;
const blank = { customer: "", employeeId: "", kind: "first_sale" as CommissionKind, amount: 0, dealDate: todayStr(), paidDate: "" };

export default function CommissionsPage() {
  const { user } = useSession();
  const confirm = useConfirm();
  const { data, loading, reload } = useAsync(async () => {
    const [rows, emps] = await Promise.all([services.commissions.list(), services.employees.list()]);
    return { rows, emps };
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);

  const emps = data?.emps ?? [];
  const name = (id: string) => emps.find((e) => e.id === id)?.name ?? "—";
  const displayName = (id: string) => withYouLabel(name(id), id === user?.employeeId);
  const rows = (data?.rows ?? []).filter((r) => filter === "all" || r.kind === filter);
  const sum = (k: CommissionKind) => (data?.rows ?? []).filter((r) => r.kind === k).reduce((s, r) => s + r.amount, 0);

  const [saveErr, setSaveErr] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setSaveErr(undefined);
    try {
      await services.commissions.create({ ...f, paidDate: f.paidDate || undefined });
      setOpen(false);
      setF(blank);
      reload();
    } catch (e) {
      setSaveErr(messageOf(e, "Could not save the commission."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="SIG Commissions"
        subtitle="1st sales, 2nd sales and operation commission for every customer"
        actions={
          <>
            <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv("sig-commissions.csv", [["Customer", "Type", "Employee", "Amount", "Deal date", "Paid date", "Status"], ...rows.map((r) => [r.customer, COMMISSION_LABEL[r.kind], name(r.employeeId), r.amount, r.dealDate, r.paidDate ?? "", r.status])])}>
              <Download size={15} /> CSV
            </Button>
            <Button onClick={() => setOpen(true)}><Plus size={16} /> Add commission</Button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="1st sales" value={money(sum("first_sale"))} />
        <Stat label="2nd sales" value={money(sum("second_sale"))} tone="violet" />
        <Stat label="Operation" value={money(sum("operation"))} tone="amber" />
      </div>

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        tabs={[{ id: "all", label: "All" }, { id: "first_sale", label: "1st Sales" }, { id: "second_sale", label: "2nd Sales" }, { id: "operation", label: "Operation" }]}
      />

      {loading ? (
        <Spinner />
      ) : !rows.length ? (
        <Empty text="No commission entries." />
      ) : (
        <TableWrap>
          <THead cols={["Customer", "Type", "Employee", "Amount", "Deal date", "Paid date", "Status", ""]} />
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="td font-medium">{r.customer}</td>
                <td className="td">{COMMISSION_LABEL[r.kind]}</td>
                <td className="td">{displayName(r.employeeId)}</td>
                <td className="td font-semibold text-brand-400">{money(r.amount)}</td>
                <td className="td">{fmtDate(r.dealDate)}</td>
                <td className="td">{fmtDate(r.paidDate)}</td>
                <td className="td"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                <td className="td text-right">
                  <span className="inline-flex gap-2">
                    {r.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Mark commission as paid?",
                            message: <>{money(r.amount)} to <b className="text-slate-700">{displayName(r.employeeId)}</b> for {r.customer}, paid today ({fmtDate(todayStr())}).</>,
                            confirmLabel: "Mark paid",
                            action: () => services.commissions.markPaid(r.id, todayStr()),
                          });
                          if (ok) reload();
                        }}
                      >
                        Mark paid
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete commission for ${r.customer}`}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete this commission?",
                          message: <>The {money(r.amount)} commission for <b className="text-slate-700">{r.customer}</b> ({displayName(r.employeeId)}) will be permanently removed.</>,
                          confirmLabel: "Delete",
                          tone: "danger",
                          icon: "delete",
                          action: () => services.commissions.remove(r.id),
                        });
                        if (ok) reload();
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add commission">
        <div className="space-y-3">
          <Field label="Customer"><input className="input" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Commission type">
              <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CommissionKind })}>
                {(Object.keys(COMMISSION_LABEL) as CommissionKind[]).map((k) => <option key={k} value={k}>{COMMISSION_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Employee">
              <select className="input" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
                <option value="">Select…</option>
                {emps.filter((e) => e.type === "staff").map((e) => <option key={e.id} value={e.id}>{withYouLabel(e.name, e.id === user?.employeeId)}</option>)}
              </select>
            </Field>
            <Field label="Amount (LKR)"><input type="number" min={0} className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: +e.target.value })} /></Field>
            <Field label="Deal date"><input type="date" className="input" value={f.dealDate} onChange={(e) => setF({ ...f, dealDate: e.target.value })} /></Field>
          </div>
          <Field label="Paid date (leave empty if unpaid)"><input type="date" className="input" value={f.paidDate} onChange={(e) => setF({ ...f, paidDate: e.target.value })} /></Field>
          {saveErr && <p className="text-sm text-rose-500">{saveErr}</p>}
          <Button className="w-full" onClick={save} disabled={saving || !f.customer.trim() || !f.employeeId || f.amount <= 0}>{saving ? "Saving…" : "Save commission"}</Button>
        </div>
      </Modal>
    </>
  );
}
