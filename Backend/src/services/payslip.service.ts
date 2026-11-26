/** Builds the payslip email (HTML + plain text) for one salary or teacher pay line. */

export interface PayslipData {
  company: string;
  employee: { name: string; code: string; position: string; department: string };
  month: string; // YYYY-MM
  status: "approved" | "paid";
  earnings: [string, number][];
  deductions: [string, number][];
  net: number;
  note?: string | null;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(n);
const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function salaryPayslip(
  l: { month: string; basic: number; allowance: number; commission: number; deduction: number; note: string | null; status: string },
  employee: PayslipData["employee"],
): Omit<PayslipData, "company"> {
  return {
    employee,
    month: l.month,
    status: l.status as PayslipData["status"],
    earnings: [["Basic salary", l.basic], ["Allowance", l.allowance], ["Commission", l.commission]],
    deductions: [["Deductions", l.deduction]],
    net: l.basic + l.allowance + l.commission - l.deduction,
    note: l.note,
  };
}

export function teacherPayslip(
  l: { month: string; sessions: number; hours: number; rate: number; allowance: number; deduction: number; status: string },
  employee: PayslipData["employee"],
): Omit<PayslipData, "company"> {
  const gross = l.hours * l.rate;
  return {
    employee,
    month: l.month,
    status: l.status as PayslipData["status"],
    earnings: [[`Teaching: ${l.sessions} sessions, ${l.hours} h × ${money(l.rate)}`, gross], ["Allowance", l.allowance]],
    deductions: [["Deductions", l.deduction]],
    net: gross + l.allowance - l.deduction,
  };
}

export function renderPayslipEmail(p: PayslipData) {
  const period = monthName(p.month);
  const subject = `Your payslip for ${period}`;
  const first = p.employee.name.split(" ")[0] || p.employee.name;
  const totalEarn = p.earnings.reduce((s, [, v]) => s + v, 0);
  const totalDed = p.deductions.reduce((s, [, v]) => s + v, 0);
  const statusText = p.status === "paid" ? "Paid" : "Approved (payment pending)";

  const row = (label: string, value: string, opts: { bold?: boolean; color?: string } = {}) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #eef2f1;color:#334155;font-size:14px;${opts.bold ? "font-weight:600;" : ""}">${esc(label)}</td>` +
    `<td align="right" style="padding:8px 0;border-bottom:1px solid #eef2f1;font-size:14px;white-space:nowrap;color:${opts.color ?? "#0f172a"};${opts.bold ? "font-weight:600;" : ""}">${value}</td></tr>`;
  const section = (title: string) =>
    `<tr><td colspan="2" style="padding:18px 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:600">${title}</td></tr>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <tr><td style="background:#01279b;padding:22px 28px;color:#ffffff">
    <div style="font-size:13px;opacity:.85">${esc(p.company)}</div>
    <div style="font-size:22px;font-weight:700;margin-top:2px">Payslip · ${esc(period)}</div>
  </td></tr>
  <tr><td style="padding:24px 28px 8px">
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a">Hi ${esc(first)},</p>
    <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.5">Your payslip for <b>${esc(period)}</b> is below.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:12px 14px;font-size:13px;color:#475569">
      <tr><td><b style="color:#0f172a">${esc(p.employee.name)}</b> · ${esc(p.employee.code)}</td><td align="right">${esc(statusText)}</td></tr>
      <tr><td colspan="2" style="padding-top:2px">${esc([p.employee.position, p.employee.department].filter(Boolean).join(" · "))}</td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${section("Earnings")}
      ${p.earnings.map(([k, v]) => row(k, money(v))).join("")}
      ${row("Total earnings", money(totalEarn), { bold: true })}
      ${section("Deductions")}
      ${p.deductions.map(([k, v]) => row(k, `− ${money(v)}`, { color: "#be123c" })).join("")}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#f5f7ff;border:1px solid #cbd7fa;border-radius:10px">
      <tr><td style="padding:14px 16px;font-size:15px;font-weight:700;color:#01279b">Net pay</td>
          <td align="right" style="padding:14px 16px;font-size:20px;font-weight:700;color:#01279b;white-space:nowrap">${money(p.net)}</td></tr>
    </table>
    ${p.note ? `<p style="margin:16px 0 0;font-size:13px;color:#475569"><b>Note:</b> ${esc(p.note)}</p>` : ""}
  </td></tr>
  <tr><td style="padding:18px 28px 26px;font-size:12px;color:#94a3b8;line-height:1.5">
    This payslip is confidential and intended only for ${esc(p.employee.name)}. If anything looks wrong, reply to this email or contact HR.
    You can also see your full pay history under <b>My payroll</b> in ${esc(p.company)}.
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${p.company} · Payslip for ${period}`,
    "",
    `Hi ${first},`,
    "",
    `${p.employee.name} (${p.employee.code})${p.employee.position ? ` · ${p.employee.position}` : ""}`,
    `Status: ${statusText}`,
    "",
    "EARNINGS",
    ...p.earnings.map(([k, v]) => `  ${k}: ${money(v)}`),
    `  Total earnings: ${money(totalEarn)}`,
    "",
    "DEDUCTIONS",
    ...p.deductions.map(([k, v]) => `  ${k}: -${money(v)}`),
    "",
    `NET PAY: ${money(p.net)}`,
    ...(p.note ? ["", `Note: ${p.note}`] : []),
    "",
    "This payslip is confidential. If anything looks wrong, reply to this email or contact HR.",
  ].join("\n");

  return { subject, html, text, totalDed };
}
