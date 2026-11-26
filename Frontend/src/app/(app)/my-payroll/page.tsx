"use client";

import { Download, Eye, FileText } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Empty, Modal, PageHeader, Spinner, Stat, TableWrap, THead, statusTone } from "@/components/ui";
import { COMMISSION_LABEL, salaryNet, teacherGross, teacherNet } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { downloadCsv, fmtDate, fmtMonth, formatBytes, monthStr, money, withYouLabel } from "@/lib/utils";
import { services } from "@/services";

interface Slip {
  month: string;
  status: string;
  earnings: [string, number][];
  deductions: [string, number][];
  net: number;
}

function Row({ label, value, strong, negative }: { label: string; value: number; strong?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 text-sm ${strong ? "font-semibold text-white" : "text-slate-300"}`}>
      <span>{label}</span>
      <span className={negative ? "text-rose-300" : strong ? "text-brand-400" : ""}>{negative ? "− " : ""}{money(value)}</span>
    </div>
  );
}

export default function MyPayrollPage() {
  const { user } = useSession();
  const empId = user?.employeeId;
  const [slip, setSlip] = useState<Slip | null>(null);

  const { data, loading } = useAsync(async () => {
    if (!empId) return null;
    const [emp, sal, tp, comm, docs] = await Promise.all([
      services.employees.get(empId),
      services.payroll.mySalary(empId),
      services.payroll.myTeacherPay(empId),
      services.commissions.listFor(empId),
      services.employees.listContracts(empId),
    ]);
    return { emp, sal, tp, comm, docs };
  }, [empId]);

  if (loading) return <Spinner />;
  if (!empId || !data) return <Empty text="No employee profile is linked to your account. Please contact HR." />;

  const { emp, sal, tp, comm, docs } = data;
  const year = monthStr().slice(0, 4);
  const latest = sal[0] ? { month: sal[0].month, net: salaryNet(sal[0]) } : tp[0] ? { month: tp[0].month, net: teacherNet(tp[0]) } : undefined;
  const ytd =
    sal.filter((l) => l.month.startsWith(year)).reduce((s, l) => s + salaryNet(l), 0) +
    tp.filter((l) => l.month.startsWith(year)).reduce((s, l) => s + teacherNet(l), 0);
  const paidComm = comm.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const pendingComm = comm.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);

  const staffSlip = (l: (typeof sal)[number]): Slip => ({
    month: l.month,
    status: l.status,
    earnings: [["Basic salary", l.basic], ["Allowance", l.allowance], ["Commission", l.commission]],
    deductions: [["Deductions", l.deduction]],
    net: salaryNet(l),
  });
  const teacherSlip = (l: (typeof tp)[number]): Slip => ({
    month: l.month,
    status: l.status,
    earnings: [[`Teaching (${l.hours} h × ${money(l.rate)})`, teacherGross(l)], ["Allowance", l.allowance]],
    deductions: [["Deductions", l.deduction]],
    net: teacherNet(l),
  });

  return (
    <>
      <PageHeader
        title="My payroll"
        subtitle="Your salary, payslips, commissions and contract documents. Only you and HR can see this page."
        actions={
          <Button
            variant="secondary"
            disabled={!sal.length && !tp.length}
            onClick={() =>
              downloadCsv("my-pay-history.csv", [
                ["Month", "Earnings", "Deductions", "Net", "Status"],
                ...[...sal.map(staffSlip), ...tp.map(teacherSlip)]
                  .sort((a, b) => b.month.localeCompare(a.month))
                  .map((s) => [s.month, s.earnings.reduce((t, [, v]) => t + v, 0), s.deductions.reduce((t, [, v]) => t + v, 0), s.net, s.status]),
              ])
            }
          >
            <Download size={15} /> Download history
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={latest ? `Latest pay · ${fmtMonth(latest.month)}` : "Latest pay"} value={latest ? money(latest.net) : "—"} hint="Net amount" />
        <Stat label={`Earned in ${year}`} value={money(ytd)} hint="Net, approved months" tone="violet" />
        <Stat
          label={emp?.type === "teacher" ? "Hourly rate" : "Base salary"}
          value={emp ? money(emp.type === "teacher" ? emp.hourlyRate ?? 0 : emp.baseSalary) : "—"}
          hint={emp ? `${emp.position} · ${emp.code}` : undefined}
          tone="amber"
        />
        <Stat label="Commission" value={money(paidComm)} hint={`${money(pendingComm)} pending`} tone="rose" />
      </div>

      <h2 className="mb-3 text-lg font-semibold text-white">Pay history</h2>
      {!sal.length && !tp.length ? (
        <Empty text="No payslips yet. A month appears here once HR approves it." />
      ) : (
        <TableWrap>
          {sal.length > 0 && (
            <>
              <THead cols={["Month", "Basic", "Allowance", "Commission", "Deduction", "Net pay", "Status", ""]} />
              <tbody>
                {sal.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="td font-medium">{fmtMonth(l.month)}</td>
                    <td className="td">{money(l.basic)}</td>
                    <td className="td">{money(l.allowance)}</td>
                    <td className="td">{money(l.commission)}</td>
                    <td className="td">{money(l.deduction)}</td>
                    <td className="td font-semibold text-brand-400">{money(salaryNet(l))}</td>
                    <td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                    <td className="td text-right"><Button size="sm" variant="secondary" onClick={() => setSlip(staffSlip(l))}><Eye size={14} /> Payslip</Button></td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
          {tp.length > 0 && (
            <>
              <THead cols={["Month", "Sessions", "Hours", "Rate", "Allowance", "Deduction", "Net pay", "Status", ""]} />
              <tbody>
                {tp.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="td font-medium">{fmtMonth(l.month)}</td>
                    <td className="td">{l.sessions}</td>
                    <td className="td">{l.hours}</td>
                    <td className="td">{money(l.rate)}</td>
                    <td className="td">{money(l.allowance)}</td>
                    <td className="td">{money(l.deduction)}</td>
                    <td className="td font-semibold text-brand-400">{money(teacherNet(l))}</td>
                    <td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                    <td className="td text-right"><Button size="sm" variant="secondary" onClick={() => setSlip(teacherSlip(l))}><Eye size={14} /> Payslip</Button></td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </TableWrap>
      )}

      {comm.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-lg font-semibold text-white">My commissions</h2>
          <TableWrap>
            <THead cols={["Customer", "Type", "Amount", "Deal date", "Paid date", "Status"]} />
            <tbody>
              {comm.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="td font-medium">{c.customer}</td>
                  <td className="td">{COMMISSION_LABEL[c.kind]}</td>
                  <td className="td font-semibold text-brand-400">{money(c.amount)}</td>
                  <td className="td">{fmtDate(c.dealDate)}</td>
                  <td className="td">{fmtDate(c.paidDate)}</td>
                  <td className="td"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold text-white">My contract &amp; documents</h2>
      {!docs.length ? (
        <Empty text="No documents on file." />
      ) : (
        <Card>
          <ul className="divide-y divide-white/[0.06]">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-4 py-3">
                <div className="rounded-xl bg-brand-500/10 p-2.5 text-brand-400"><FileText size={18} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{d.fileName}</p>
                  <p className="text-xs text-slate-400">
                    {d.kind} · {formatBytes(d.fileSize)}
                    {d.validFrom ? ` · from ${fmtDate(d.validFrom)}` : ""}
                    {d.validTo ? ` to ${fmtDate(d.validTo)}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="secondary" aria-label={`Download ${d.fileName}`} onClick={() => services.employees.downloadContract(d)}>
                  <Download size={14} /> Download
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={!!slip} onClose={() => setSlip(null)} title={slip ? `Payslip · ${fmtMonth(slip.month)}` : "Payslip"}>
        {slip && (
          <div>
            <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
              <span>{emp && withYouLabel(emp.name, emp.id === user?.employeeId)} · {emp?.code}</span>
              <Badge tone={statusTone(slip.status)}>{slip.status}</Badge>
            </div>
            <p className="label mt-4">Earnings</p>
            <div className="divide-y divide-white/[0.06]">
              {slip.earnings.map(([k, v]) => <Row key={k} label={k} value={v} />)}
            </div>
            <p className="label mt-4">Deductions</p>
            <div className="divide-y divide-white/[0.06]">
              {slip.deductions.map(([k, v]) => <Row key={k} label={k} value={v} negative />)}
            </div>
            <div className="mt-4 rounded-xl border border-brand-500/20 bg-brand-500/[0.07] px-4">
              <Row label="Net pay" value={slip.net} strong />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
