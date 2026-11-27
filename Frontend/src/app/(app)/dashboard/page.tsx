"use client";

import { CalendarClock, HandCoins, Users, Wallet } from "lucide-react";
import { Badge, Card, PageHeader, Spinner, Stat, statusTone } from "@/components/ui";
import { BarChart, ChartLabels } from "@/components/ui/BarChart";
import { ClockWidget } from "@/components/features/ClockWidget";
import { LEAVE_POLICY, leaveBalance } from "@/domain/policy";
import { can, salaryNet, teacherNet } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useRealtime } from "@/hooks/useRealtime";
import { useSession } from "@/hooks/useSession";
import { fmtDate, monthStr, money, withYouLabel } from "@/lib/utils";
import { services } from "@/services";

export default function DashboardPage() {
  const { user } = useSession();
  const isStaff = !!user && can.manageEmployees(user.role);
  const month = monthStr();

  const { data, loading, refresh } = useAsync(async () => {
    const [emps, leave, sal, tp, comm, att] = await Promise.all([
      services.employees.list(),
      services.leave.list(isStaff ? undefined : { employeeId: user?.employeeId }),
      isStaff ? services.payroll.listSalary(month) : Promise.resolve([]),
      isStaff ? services.payroll.listTeacherPay(month) : Promise.resolve([]),
      isStaff ? services.commissions.list() : Promise.resolve([]),
      services.attendance.list(isStaff ? undefined : { employeeId: user?.employeeId }),
    ]);
    return { emps, leave, sal, tp, comm, att };
  }, [user?.id]);
  useRealtime("leave", refresh); // keeps "Pending leave" and "Recent leave" live

  if (loading || !data || !user) return <Spinner />;
  const { emps, leave, sal, tp, comm, att } = data;

  const payrollTotal = sal.reduce((s, l) => s + salaryNet(l), 0) + tp.reduce((s, l) => s + teacherNet(l), 0);
  const unpaid = comm.filter((c) => c.status === "pending");
  const attendanceByDay = att.reduce<Record<string, Set<string>>>((counts, record) => {
    if (!counts[record.date]) counts[record.date] = new Set();
    counts[record.date].add(record.employeeId);
    return counts;
  }, {});
  const today = new Date();
  const byDay = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      label: new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric" }).format(date),
      value: attendanceByDay[dateKey]?.size ?? 0,
    };
  });

  return (
    <>
      <PageHeader title="Dashboard" subtitle={isStaff ? "Company overview" : "Your day at a glance"} />
      <div className="grid gap-5 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <ClockWidget />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
          {isStaff ? (
            <>
              <Stat label="Employees" value={emps.length} hint={`${emps.filter((e) => e.type === "teacher").length} teachers`} icon={<Users size={20} />} />
              <Stat label="Pending leave" value={leave.filter((l) => l.status === "pending").length} hint="Awaiting approval" icon={<CalendarClock size={20} />} tone="amber" />
              <Stat label={`Payroll · ${month}`} value={money(payrollTotal)} hint="Staff + teachers" icon={<Wallet size={20} />} tone="violet" />
              <Stat label="Unpaid commissions" value={money(unpaid.reduce((s, c) => s + c.amount, 0))} hint={`${unpaid.length} entries`} icon={<HandCoins size={20} />} tone="rose" />
            </>
          ) : (
            <>
              <Stat label="My leave requests" value={leave.length} hint={`${leave.filter((l) => l.status === "pending").length} pending`} icon={<CalendarClock size={20} />} tone="amber" />
              <Stat label="Days attended" value={att.length} hint="Last 30 days" icon={<Users size={20} />} />
              {user.employeeId && (
                <Stat
                  label="Annual leave left"
                  value={`${leaveBalance(leave, user.employeeId).annualLeft} / ${LEAVE_POLICY.annualEntitlement}`}
                  hint={`${leaveBalance(leave, user.employeeId).availableThisMonth} day(s) available this month`}
                  icon={<CalendarClock size={20} />}
                  tone="violet"
                />
              )}
            </>
          )}
        </div>

        <Card className="lg:col-span-3">
          <h3 className="font-semibold text-white">{isStaff ? "Employee check-ins" : "My attendance"}</h3>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            {isStaff ? "Company-wide employees checked in each day · last 7 days" : "Your attendance each day · last 7 days"}
          </p>
          {byDay.some(({ value }) => value > 0) ? (
            <>
              <BarChart data={byDay} />
              <ChartLabels labels={byDay.map(({ label }) => label)} />
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              {isStaff ? "No employees checked in during the last 7 days." : "You have no attendance records in the last 7 days."}
            </p>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 font-semibold text-white">Recent leave</h3>
          <ul className="space-y-3">
            {leave.slice(0, 5).map((l) => (
              <li key={l.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-slate-200">{withYouLabel(emps.find((e) => e.id === l.employeeId)?.name ?? "—", l.employeeId === user.employeeId)}</p>
                  <p className="text-xs text-slate-500">{l.type} · {fmtDate(l.from)}</p>
                </div>
                <Badge tone={statusTone(l.status)}>{l.status}</Badge>
              </li>
            ))}
            {!leave.length && <p className="text-sm text-slate-400">Nothing yet.</p>}
          </ul>
        </Card>
      </div>
    </>
  );
}
