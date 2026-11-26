/**
 * Service contracts (ports). UI code depends ONLY on these interfaces.
 * Two adapters implement them: ./mock.ts (demo) and ./api.ts (real backend).
 */
import type {
  AttendanceRecord, AuditEntry, CommissionEntry, ContractDoc, Employee, GeoPoint,
  LeaveRequest, LeaveStatus, Notice, PerformanceReview, Role, SalaryLine, TeacherPayLine, User,
} from "@/domain/types";

export interface AuthService {
  /** Microsoft Entra ID is the only sign-in method. Mock accepts a demo user id. */
  signInWithMicrosoft(demoUserId?: string): Promise<User>;
  signOut(): Promise<void>;
}

export interface EmployeeService {
  list(): Promise<Employee[]>;
  get(id: string): Promise<Employee | undefined>;
  create(e: Omit<Employee, "id" | "code">): Promise<Employee>;
  update(id: string, patch: Partial<Employee>): Promise<Employee>;
  listContracts(employeeId: string): Promise<ContractDoc[]>;
  uploadContract(
    employeeId: string,
    file: File,
    meta: Pick<ContractDoc, "kind" | "validFrom" | "validTo">,
    uploadedBy: string,
  ): Promise<ContractDoc>;
  deleteContract(id: string): Promise<void>;
  /** Saves the document to the user's device. Admins/superadmins: any employee; employees: their own. */
  downloadContract(doc: ContractDoc): Promise<void>;
}

export interface AttendanceService {
  list(filter?: { employeeId?: string }): Promise<AttendanceRecord[]>;
  today(employeeId: string): Promise<AttendanceRecord | undefined>;
  clockIn(employeeId: string, where: GeoPoint): Promise<AttendanceRecord>;
  /** `earlyReason` is required when clocking out before the end of the shift. */
  clockOut(employeeId: string, where: GeoPoint, earlyReason?: string): Promise<AttendanceRecord>;
}

export interface LeaveService {
  list(filter?: { employeeId?: string }): Promise<LeaveRequest[]>;
  create(r: Omit<LeaveRequest, "id" | "status">): Promise<LeaveRequest>;
  setStatus(id: string, status: LeaveStatus): Promise<void>;
}

export interface PerformanceService {
  list(filter?: { employeeId?: string }): Promise<PerformanceReview[]>;
}

export type PayKind = "salary" | "teachers";
export interface SalaryMonthUpdate {
  lines: SalaryLine[];
  added: number;
  updated: number;
  /** Approved/paid lines that were left as they are. */
  locked: number;
}
export interface EmailMonthResult {
  sent: number;
  failed: { name: string; error: string }[];
  skippedDrafts: number;
  skippedAlreadySent: number;
}

export interface PayrollService {
  listSalary(month: string): Promise<SalaryLine[]>;
  /** Creates draft lines for every staff member for the month (idempotent). */
  generateSalary(month: string): Promise<SalaryLine[]>;
  updateSalary(line: SalaryLine): Promise<SalaryLine>;
  /**
   * Creates the month if needed and refreshes it: adds missing staff, and on DRAFT lines resets
   * basic (current base salary) and commission (paid this month). Approved/paid lines are untouched.
   */
  updateSalaryMonth(month: string): Promise<SalaryMonthUpdate>;
  listTeacherPay(month: string): Promise<TeacherPayLine[]>;
  generateTeacherPay(month: string): Promise<TeacherPayLine[]>;
  updateTeacherPay(line: TeacherPayLine): Promise<TeacherPayLine>;
  /**
   * Self-service: the signed-in person's own pay history (newest first).
   * Drafts are hidden: a month appears once an admin approves it.
   * A real backend must derive the employee from the session, never trust the id.
   */
  mySalary(employeeId: string): Promise<SalaryLine[]>;
  myTeacherPay(employeeId: string): Promise<TeacherPayLine[]>;
  /** Whether the server can send email (SMTP configured). */
  mailStatus(): Promise<{ configured: boolean }>;
  /** Emails one approved/paid payslip to the employee. Returns the line with `emailedAt` set. */
  emailSalarySlip(id: string): Promise<SalaryLine>;
  emailTeacherSlip(id: string): Promise<TeacherPayLine>;
  /** Emails every approved/paid payslip for the month (skipping already-sent ones unless `onlyUnsent` is false). */
  emailMonth(kind: PayKind, month: string, onlyUnsent?: boolean): Promise<EmailMonthResult>;
}

export interface CommissionService {
  list(): Promise<CommissionEntry[]>;
  /** Self-service: only the signed-in person's own commissions. */
  listFor(employeeId: string): Promise<CommissionEntry[]>;
  create(c: Omit<CommissionEntry, "id" | "status">): Promise<CommissionEntry>;
  markPaid(id: string, paidDate: string): Promise<CommissionEntry>;
  remove(id: string): Promise<void>;
}

export interface AdminService {
  users(): Promise<User[]>;
  setRole(userId: string, role: Role, actor: string): Promise<void>;
  setActive(userId: string, isActive: boolean, actor: string): Promise<void>;
  audit(): Promise<AuditEntry[]>;
}

export interface NoticeService {
  list(): Promise<Notice[]>;
  markAllRead(): Promise<void>;
}

/** The signed-in person's own profile. */
export interface ProfileService {
  /** `image` should already be a square JPEG (see lib/image.ts). Returns the new picture URL. */
  uploadAvatar(image: Blob): Promise<{ avatarUrl: string | null }>;
  removeAvatar(): Promise<void>;
}

export interface Services {
  profile: ProfileService;
  auth: AuthService;
  employees: EmployeeService;
  attendance: AttendanceService;
  leave: LeaveService;
  performance: PerformanceService;
  payroll: PayrollService;
  commissions: CommissionService;
  admin: AdminService;
  notices: NoticeService;
}
