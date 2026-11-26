import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

export const money = (n: number, currency = "LKR") =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/* ---------- Dates & times: always Sri Lanka time, 12-hour clock with AM/PM ---------- */

/** Every time in the app is shown in Sri Lanka time, whatever the viewer's device is set to. */
export const TIME_ZONE = "Asia/Colombo";

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });
const clockFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "2-digit", month: "short", year: "numeric" });

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

/** "25 Nov 2026" */
export const fmtDate = (iso?: string | null) => (iso ? dateFmt.format(toDate(iso)) : "—");

/** "9:05 AM" */
export const fmtTime = (iso?: string | Date | null) => (iso ? timeFmt.format(toDate(iso)) : "—");

/** "9:05:32 AM" — live clocks. */
export const fmtClock = (d: Date) => clockFmt.format(d);

/** "25 Nov 2026, 9:05 AM" */
export const fmtDateTime = (iso?: string | Date | null) => (iso ? `${dateFmt.format(toDate(iso))}, ${timeFmt.format(toDate(iso))}` : "—");

/** A "HH:mm" setting such as a shift end ("17:00") shown as "5:00 PM". */
export function fmtHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "2026-11" → "November 2026" */
export const fmtMonth = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Local calendar date (not UTC: toISOString() is a day behind in Sri Lanka before 05:30). */
const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayStr = () => localYmd(new Date());
export const monthStr = (d = new Date()) => localYmd(d).slice(0, 7);

export const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

export const withYouLabel = (name: string, isYou: boolean) =>
  isYou ? `${name} (You)` : name;

export const uid = () => Math.random().toString(36).slice(2, 10);

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
