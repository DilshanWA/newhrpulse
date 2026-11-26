"use client";

import { Download } from "lucide-react";
import { Button, Card, PageHeader, Spinner } from "@/components/ui";
import { BarChart, ChartLabels } from "@/components/ui/BarChart";
import { COMMISSION_LABEL, salaryNet, teacherNet, type CommissionKind } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { downloadCsv, monthStr, money } from "@/lib/utils";
import { services } from "@/services";

export default function ReportsPage() {
  const month = monthStr();
  const { data, loading } = useAsync(async () => {
    const [emps, sal, tp, comm] = await Promise.all([
      services.employees.list(),
      services.payroll.listSalary(month),
      services.payroll.listTeacherPay(month),
      services.commissions.list(),
    ]);
    return { emps, sal, tp, comm };
  });
  if (loading || !data) return <Spinner />;
  const { emps, sal, tp, comm } = data;

  const depts = Object.entries(emps.reduce<Record<string, number>>((m, e) => ((m[e.department] = (m[e.department] ?? 0) + 1), m), {}));
  const kinds = Object.keys(COMMISSION_LABEL) as CommissionKind[];

  return (
    <>
      <PageHeader title="Reports" subtitle={`Summary for ${month}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 font-semibold text-white">Headcount by department</h3>
          <BarChart data={depts.map(([label, value]) => ({ label, value }))} />
          <ChartLabels labels={depts.map(([d]) => d)} />
        </Card>
        <Card>
          <h3 className="mb-4 font-semibold text-white">Commission by type</h3>
          <BarChart data={kinds.map((k) => ({ label: k, value: comm.filter((c) => c.kind === k).reduce((s, c) => s + c.amount, 0) }))} />
          <ChartLabels labels={kinds.map((k) => COMMISSION_LABEL[k].replace(" Commission", ""))} />
        </Card>
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Payroll summary</h3>
              <p className="mt-1 text-sm text-slate-400">Staff {money(sal.reduce((s, l) => s + salaryNet(l), 0))} · Teachers {money(tp.reduce((s, l) => s + teacherNet(l), 0))}</p>
            </div>
            <Button variant="secondary" onClick={() => downloadCsv(`employees.csv`, [["Code", "Name", "Department", "Type", "Status"], ...emps.map((e) => [e.code, e.name, e.department, e.type, e.status])])}>
              <Download size={15} /> Export employees
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
