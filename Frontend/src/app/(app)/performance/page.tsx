"use client";

import { Card, PageHeader, Spinner } from "@/components/ui";
import { can } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { withYouLabel } from "@/lib/utils";
import { services } from "@/services";

export default function PerformancePage() {
  const { user } = useSession();
  const isStaff = !!user && can.manageEmployees(user.role);
  const { data, loading } = useAsync(async () => {
    const [rows, emps] = await Promise.all([
      services.performance.list(isStaff ? undefined : { employeeId: user?.employeeId }),
      services.employees.list(),
    ]);
    return { rows, emps };
  }, [user?.id]);

  if (loading || !data) return <Spinner />;
  return (
    <>
      <PageHeader title="Performance" subtitle="Quarterly reviews and goal progress" />
      <div className="grid gap-5 md:grid-cols-2">
        {data.rows.map((r) => {
          const pct = Math.round((r.goalsDone / r.goalsTotal) * 100);
          return (
            <Card key={r.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-white">{withYouLabel(data.emps.find((e) => e.id === r.employeeId)?.name ?? "—", r.employeeId === user?.employeeId)}</p>
                  <p className="text-xs text-slate-400">{r.period}</p>
                </div>
                <p className="text-3xl font-semibold text-brand-400">{r.score}</p>
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-slate-400">
                  <span>Goals {r.goalsDone}/{r.goalsTotal}</span><span>{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-300" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-300">{r.note}</p>
            </Card>
          );
        })}
      </div>
    </>
  );
}
