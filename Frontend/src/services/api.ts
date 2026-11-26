/**
 * REST adapter. Each method documents the endpoint your backend should expose.
 * Switch on with NEXT_PUBLIC_DATA_SOURCE=api. Adjust paths/payloads to your backend.
 */
import { API_BASE, http } from "@/lib/http";
import { authClient, startMicrosoftSignIn } from "@/lib/auth-client";
import type {
  AttendanceRecord, AuditEntry, CommissionEntry, ContractDoc, Employee, LeaveRequest,
  Notice, PerformanceReview, SalaryLine, TeacherPayLine, User,
} from "@/domain/types";
import type { EmailMonthResult, SalaryMonthUpdate, Services } from "./types";

const qs = (o?: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(o ?? {}).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const apiServices: Services = {
  auth: {
    async signInWithMicrosoft() {
      await startMicrosoftSignIn("/dashboard");
      // The browser is now navigating to Microsoft; this promise never settles.
      return new Promise<User>(() => {});
    },
    async signOut() {
      const { data, error } = await authClient.signOut({ disableRedirect: true });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error("The server did not confirm sign-out. Please try again.");
    },
  },
  employees: {
    list: () => http.get<Employee[]>("/employees"),
    get: (id) => http.get<Employee>(`/employees/${id}`),
    create: (e) => http.post<Employee>("/employees", e),
    update: (id, p) => http.patch<Employee>(`/employees/${id}`, p),
    listContracts: async (id) =>
      (await http.get<ContractDoc[]>(`/employees/${id}/contracts`)).map((d) => ({
        ...d,
        // Opened in the browser with the session cookie; the API checks ownership.
        url: `${API_BASE}/contracts/${d.id}/download`,
      })),
    uploadContract: (id, file, meta) => {
      const f = new FormData();
      f.append("file", file);
      Object.entries(meta).forEach(([k, v]) => v && f.append(k, String(v)));
      return http.post<ContractDoc>(`/employees/${id}/contracts`, f);
    },
    deleteContract: (id) => http.del<void>(`/contracts/${id}`),
    downloadContract: (d) => http.download(`/contracts/${d.id}/download`, d.fileName),
  },
  attendance: {
    list: (f) => http.get<AttendanceRecord[]>(`/attendance${qs(f)}`),
    today: async (id) =>
      (await http.get<AttendanceRecord | null>(`/attendance/today?employeeId=${encodeURIComponent(id)}`)) ?? undefined,
    clockIn: (employeeId, where) => http.post<AttendanceRecord>("/attendance/clock-in", { employeeId, ...where }),
    clockOut: (employeeId, where, earlyReason) =>
      http.post<AttendanceRecord>("/attendance/clock-out", { employeeId, ...where, earlyReason }),
  },
  leave: {
    list: (f) => http.get<LeaveRequest[]>(`/leave${qs(f)}`),
    create: (r) => http.post<LeaveRequest>("/leave", r),
    setStatus: (id, status) => http.patch<void>(`/leave/${id}`, { status }),
  },
  performance: { list: (f) => http.get<PerformanceReview[]>(`/performance${qs(f)}`) },
  payroll: {
    listSalary: (m) => http.get<SalaryLine[]>(`/payroll/salary?month=${m}`),
    generateSalary: (m) => http.post<SalaryLine[]>("/payroll/salary/generate", { month: m }),
    updateSalary: (l) => http.put<SalaryLine>(`/payroll/salary/${l.id}`, l),
    updateSalaryMonth: (m) => http.post<SalaryMonthUpdate>("/payroll/salary/update-month", { month: m }),
    // "/me" endpoints: the backend identifies the caller from the session cookie.
    mySalary: () => http.get<SalaryLine[]>("/payroll/me/salary"),
    myTeacherPay: () => http.get<TeacherPayLine[]>("/payroll/me/teachers"),
    listTeacherPay: (m) => http.get<TeacherPayLine[]>(`/payroll/teachers?month=${m}`),
    generateTeacherPay: (m) => http.post<TeacherPayLine[]>("/payroll/teachers/generate", { month: m }),
    updateTeacherPay: (l) => http.put<TeacherPayLine>(`/payroll/teachers/${l.id}`, l),
    mailStatus: () => http.get<{ configured: boolean }>("/mail/status"),
    emailSalarySlip: (id) => http.post<SalaryLine>(`/payroll/salary/${id}/email`),
    emailTeacherSlip: (id) => http.post<TeacherPayLine>(`/payroll/teachers/${id}/email`),
    emailMonth: (kind, month, onlyUnsent = true) =>
      http.post<EmailMonthResult>(`/payroll/${kind}/email-month`, { month, onlyUnsent }),
  },
  commissions: {
    list: () => http.get<CommissionEntry[]>("/commissions"),
    listFor: () => http.get<CommissionEntry[]>("/commissions/me"),
    create: (c) => http.post<CommissionEntry>("/commissions", c),
    markPaid: (id, paidDate) => http.patch<CommissionEntry>(`/commissions/${id}/paid`, { paidDate }),
    remove: (id) => http.del<void>(`/commissions/${id}`),
  },
  admin: {
    users: () => http.get<User[]>("/admin/users"),
    setRole: (id, role) => http.patch<void>(`/admin/users/${id}/role`, { role }),
    setActive: (id, isActive) => http.patch<void>(`/admin/users/${id}/active`, { isActive }),
    audit: () => http.get<AuditEntry[]>("/admin/audit"),
  },
  profile: {
    uploadAvatar: (image) => {
      const f = new FormData();
      f.append("file", image, "avatar.jpg");
      return http.put<{ avatarUrl: string | null }>("/me/avatar", f);
    },
    removeAvatar: () => http.del<void>("/me/avatar"),
  },
  notices: {
    list: () => http.get<Notice[]>("/notifications"),
    markAllRead: () => http.post<void>("/notifications/read-all"),
  },
};
