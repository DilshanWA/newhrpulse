"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ClockWidget } from "@/components/features/ClockWidget";
import { LocationCell } from "@/components/features/LocationCell";
import { Badge, Button, Empty, PageHeader, Spinner, TableWrap, THead } from "@/components/ui";
import { can, hoursBetween } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { fmtDate, fmtTime, withYouLabel } from "@/lib/utils";
import { services } from "@/services";

export default function AttendancePage() {
  const { user } = useSession();
  const isStaff = !!user && can.manageEmployees(user.role);
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const [earlyOnly, setEarlyOnly] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    const [rows, emps] = await Promise.all([
      services.attendance.list(isStaff ? undefined : { employeeId: user?.employeeId }),
      services.employees.list(),
    ]);
    return { rows, emps };
  }, [user?.id]);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (date && r.date !== date) return false;
      if (earlyOnly && !r.earlyReason) return false;
      if (!term) return true;
      const e = data.emps.find((x) => x.id === r.employeeId);
      return `${e?.name ?? ""} ${e?.code ?? ""} ${e?.department ?? ""} ${e?.email ?? ""}`.toLowerCase().includes(term);
    });
  }, [data, q, date, earlyOnly]);

  const filtered = !!(q || date || earlyOnly);

  return (
    <>
      <PageHeader title="Attendance" subtitle={isStaff ? "All employees, with clock-in/out locations" : "Your clock-in history"} />
      <div className="mb-6 max-w-md">
        <ClockWidget onChange={reload} />
      </div>

      {isStaff && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-500" />
            <input
              className="input pl-10"
              placeholder="Search employee name, code, department…"
              aria-label="Search attendance by employee"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <input type="date" className="input w-auto" aria-label="Filter by date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={earlyOnly} onChange={(e) => setEarlyOnly(e.target.checked)} />
            Early clock-outs only
          </label>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setDate(""); setEarlyOnly(false); }}>
              <X size={14} /> Clear
            </Button>
          )}
          {data && <span className="ml-auto text-xs text-slate-400">Showing {rows.length} of {data.rows.length}</span>}
        </div>
      )}

      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          <TableWrap>
            <THead cols={["Date", ...(isStaff ? ["Employee"] : []), "In", "Out", "Hours", "Early clock-out reason", "Clock-in location", "Clock-out location"]} />
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="td">{fmtDate(r.date)}</td>
                  {isStaff && <td className="td">{withYouLabel(data.emps.find((e) => e.id === r.employeeId)?.name ?? "—", r.employeeId === user?.employeeId)}</td>}
                  <td className="td">{fmtTime(r.clockIn)}</td>
                  <td className="td">{fmtTime(r.clockOut)}</td>
                  <td className="td">{hoursBetween(r.clockIn, r.clockOut).toFixed(1)}</td>
                  <td className="td max-w-[240px]">
                    {r.earlyReason ? (
                      <span className="flex items-center gap-2"><Badge tone="amber">Early</Badge><span className="truncate text-slate-300" title={r.earlyReason}>{r.earlyReason}</span></span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td"><LocationCell point={r.inLocation} canOpenMap={isStaff} /></td>
                  <td className="td"><LocationCell point={r.outLocation} canOpenMap={isStaff} /></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {!rows.length && <Empty text={filtered ? "No records match your filters." : "No attendance records."} />}
        </>
      )}
    </>
  );
}
