/**
 * Company policy rules (pure functions, no I/O).
 * Change the numbers in LEAVE_POLICY / WORK_POLICY to change the rules everywhere.
 * The backend MUST enforce the same rules; the UI check is only for fast feedback.
 */
import type { LeaveRequest } from "./types";

export type LeaveType = LeaveRequest["type"];

export const LEAVE_POLICY = {
  /** Total leave days per calendar year. */
  annualEntitlement: 18,
  /** Maximum leave days in any single calendar month. */
  monthlyLimit: 2,
  /** Leave types that use up the balance. "Unpaid" is not counted. */
  countedTypes: ["Annual", "Sick", "Casual"] as LeaveType[],
  /** Days that count as leave days: 0 = Sunday … 6 = Saturday. Default Mon–Fri. */
  workingDays: [1, 2, 3, 4, 5],
};

export const WORK_POLICY = {
  /** Clocking out before this local time requires a reason. */
  shiftEnd: "17:00",
};

/* ---------------- Leave ---------------- */

/** Working days of a leave range, grouped by month ("YYYY-MM" → days). */
export function leaveDaysByMonth(from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return out;
  for (let t = start; t <= end; t += 864e5) {
    const d = new Date(t);
    if (!LEAVE_POLICY.workingDays.includes(d.getUTCDay())) continue;
    const key = d.toISOString().slice(0, 7);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export const leaveDays = (from: string, to: string) =>
  Object.values(leaveDaysByMonth(from, to)).reduce((s, n) => s + n, 0);

const counts = (r: Pick<LeaveRequest, "type" | "status">) =>
  r.status !== "rejected" && LEAVE_POLICY.countedTypes.includes(r.type);

export interface LeaveBalance {
  annualUsed: number;
  annualLeft: number;
  monthUsed: number;
  monthLeft: number;
  /** What can still be taken this month: the smaller of the two limits. */
  availableThisMonth: number;
}

/** Pending and approved requests both use up the balance; rejected ones do not. */
export function leaveBalance(requests: LeaveRequest[], employeeId: string, ref = new Date()): LeaveBalance {
  const monthKey = ref.toISOString().slice(0, 7);
  const year = monthKey.slice(0, 4);
  let annualUsed = 0;
  let monthUsed = 0;
  for (const r of requests) {
    if (r.employeeId !== employeeId || !counts(r)) continue;
    for (const [k, n] of Object.entries(leaveDaysByMonth(r.from, r.to))) {
      if (k.startsWith(year)) annualUsed += n;
      if (k === monthKey) monthUsed += n;
    }
  }
  const annualLeft = Math.max(0, LEAVE_POLICY.annualEntitlement - annualUsed);
  const monthLeft = Math.max(0, LEAVE_POLICY.monthlyLimit - monthUsed);
  return { annualUsed, annualLeft, monthUsed, monthLeft, availableThisMonth: Math.min(annualLeft, monthLeft) };
}

const monthName = (key: string) =>
  new Date(`${key}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Returns an error message, or null when the request is allowed. */
export function validateLeave(
  existing: LeaveRequest[],
  req: Pick<LeaveRequest, "employeeId" | "type" | "from" | "to">,
): string | null {
  if (!req.from || !req.to) return "Choose a start and end date.";
  if (req.to < req.from) return "The end date is before the start date.";

  const mine = existing.filter((r) => r.employeeId === req.employeeId && r.status !== "rejected");
  if (mine.some((r) => r.from <= req.to && req.from <= r.to)) return "You already have leave that overlaps these dates.";

  const byMonth = leaveDaysByMonth(req.from, req.to);
  if (!Object.keys(byMonth).length) return "The selected dates contain no working days.";
  if (!LEAVE_POLICY.countedTypes.includes(req.type)) return null;

  const usedByMonth: Record<string, number> = {};
  for (const r of mine.filter((x) => LEAVE_POLICY.countedTypes.includes(x.type))) {
    for (const [k, n] of Object.entries(leaveDaysByMonth(r.from, r.to))) usedByMonth[k] = (usedByMonth[k] ?? 0) + n;
  }

  for (const [k, n] of Object.entries(byMonth)) {
    const left = LEAVE_POLICY.monthlyLimit - (usedByMonth[k] ?? 0);
    if (n > left) {
      return `Monthly limit is ${LEAVE_POLICY.monthlyLimit} days. You have ${Math.max(0, left)} left in ${monthName(k)}.`;
    }
  }

  const yearUse: Record<string, number> = {};
  for (const [k, n] of Object.entries(usedByMonth)) yearUse[k.slice(0, 4)] = (yearUse[k.slice(0, 4)] ?? 0) + n;
  const reqByYear: Record<string, number> = {};
  for (const [k, n] of Object.entries(byMonth)) reqByYear[k.slice(0, 4)] = (reqByYear[k.slice(0, 4)] ?? 0) + n;
  for (const [y, n] of Object.entries(reqByYear)) {
    const left = LEAVE_POLICY.annualEntitlement - (yearUse[y] ?? 0);
    if (n > left) return `Annual limit is ${LEAVE_POLICY.annualEntitlement} days. You have ${Math.max(0, left)} left in ${y}.`;
  }
  return null;
}

/* ---------------- Attendance ---------------- */

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** True when the current Colombo time is before the end of the shift. */
export const isEarlyClockOut = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute < toMinutes(WORK_POLICY.shiftEnd);
};
