/**
 * Domain layer: pure types and business rules. No React, no fetch, no storage.
 * Field names are chosen so a REST/GraphQL backend can return them as-is.
 */

export type Role = "superadmin" | "admin" | "employee";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeId?: string;
  /** Present on admin user listings; omitted from the signed-in session. */
  isActive?: boolean;
  /** Profile picture (API-relative path, or a data: URL in demo mode). */
  avatarUrl?: string | null;
}

export type EmployeeStatus = "active" | "on_leave" | "terminated";
export type EmployeeType = "staff" | "teacher";

export interface Employee {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  type: EmployeeType;
  status: EmployeeStatus;
  joinedOn: string; // ISO date
  baseSalary: number;
  /** Teachers are paid per session */
  hourlyRate?: number;
  /** Profile picture of the linked login, if they uploaded one. */
  avatarUrl?: string | null;
  /** HR Pulse role of the linked login (null if they have never signed in). */
  accessRole?: Role | null;
}

export type ContractKind = "Employment Contract" | "Amendment" | "NDA" | "Other";

export interface ContractDoc {
  id: string;
  employeeId: string;
  kind: ContractKind;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  validFrom?: string;
  validTo?: string;
  /** Mock only: blob/object URL. A real backend returns a signed download URL. */
  url?: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
  name?: string | null;
  placeId?: string | null;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  clockIn?: string; // ISO datetime
  clockOut?: string;
  inLocation?: GeoPoint;
  outLocation?: GeoPoint;
  /** Present on clock actions when reverse geocoding could not return a place name. */
  locationWarning?: string;
  /** Required when clocking out before the end of the shift. */
  earlyReason?: string;
}

export type LeaveStatus = "pending" | "approved" | "rejected";
export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: "Annual" | "Sick" | "Casual" | "Unpaid";
  from: string;
  to: string;
  reason: string;
  status: LeaveStatus;
}

export interface PerformanceReview {
  id: string;
  employeeId: string;
  period: string;
  score: number; // 0-100
  goalsDone: number;
  goalsTotal: number;
  note: string;
}

/** One line on a monthly salary sheet (staff). */
export interface SalaryLine {
  id: string;
  month: string; // YYYY-MM
  employeeId: string;
  basic: number;
  allowance: number;
  commission: number;
  deduction: number;
  note?: string;
  status: "draft" | "approved" | "paid";
  /** When the payslip was last emailed to the employee (cleared if amounts change). */
  emailedAt?: string | null;
}

/** Teacher pay sheet line: replaces the Excel sheet. */
export interface TeacherPayLine {
  id: string;
  month: string;
  employeeId: string;
  sessions: number;
  hours: number;
  rate: number;
  allowance: number;
  deduction: number;
  status: "draft" | "approved" | "paid";
  /** When the payslip was last emailed to the employee (cleared if amounts change). */
  emailedAt?: string | null;
}

export type CommissionKind = "first_sale" | "second_sale" | "operation";
export type CommissionStatus = "pending" | "paid";

/** SIG CMS commission entry per customer. */
export interface CommissionEntry {
  id: string;
  customer: string;
  employeeId: string;
  kind: CommissionKind;
  amount: number;
  dealDate: string;
  paidDate?: string;
  status: CommissionStatus;
  note?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  /** In-app path to open, e.g. "/leave". */
  link?: string | null;
  at: string;
  read: boolean;
}

/* ---------- Business rules (pure functions) ---------- */

export const salaryNet = (l: Pick<SalaryLine, "basic" | "allowance" | "commission" | "deduction">) =>
  l.basic + l.allowance + l.commission - l.deduction;

export const teacherGross = (l: Pick<TeacherPayLine, "hours" | "rate">) => l.hours * l.rate;

export const teacherNet = (l: Pick<TeacherPayLine, "hours" | "rate" | "allowance" | "deduction">) =>
  teacherGross(l) + l.allowance - l.deduction;

export const COMMISSION_LABEL: Record<CommissionKind, string> = {
  first_sale: "1st Sales Commission",
  second_sale: "2nd Sales Commission",
  operation: "Operation Commission",
};

export const hoursBetween = (a?: string, b?: string) =>
  a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 36e5) : 0;

export const can = {
  manageEmployees: (r: Role) => r === "admin" || r === "superadmin",
  managePayroll: (r: Role) => r === "admin" || r === "superadmin",
  manageCommissions: (r: Role) => r === "admin" || r === "superadmin",
  approveLeave: (r: Role) => r === "admin" || r === "superadmin",
  adminPanel: (r: Role) => r === "admin" || r === "superadmin",
  manageRoles: (r: Role) => r === "superadmin",
  viewAudit: (r: Role) => r === "superadmin",
};
