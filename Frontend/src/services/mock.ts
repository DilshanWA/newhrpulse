import { DEMO_USERS } from "@/data/seed";
import type {
  AttendanceRecord, AuditEntry, CommissionEntry, ContractDoc, Employee, LeaveRequest, Notice,
  RecruitmentCandidate, RecruitmentInterview, RecruitmentJob, SalaryLine, TeacherPayLine, User,
} from "@/domain/types";
import { isEarlyClockOut, validateLeave } from "@/domain/policy";
import { emit } from "@/lib/realtime";
import { blobToDataUrl } from "@/lib/image";
import { saveBlob } from "@/lib/http";
import { readClientSession } from "@/lib/session";
import { createStore } from "@/lib/store";

export const mockAvatarKey = (userId: string) => `hrpulse:avatar:${userId}`;
/** Demo mode: the picture saved in this browser for a user, if any. */
export const mockAvatar = (userId?: string) =>
  (userId && typeof window !== "undefined" && localStorage.getItem(mockAvatarKey(userId))) || null;
import { todayStr, uid } from "@/lib/utils";
import type { Services } from "./types";

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));

const employees = createStore<Employee>("employees", () => []);
const contracts = createStore<ContractDoc>("contracts", () => []);
const attendance = createStore<AttendanceRecord>("attendance", () => []);
const leave = createStore<LeaveRequest>("leave", () => []);
const salary = createStore<SalaryLine>("salary", () => []);
const teacherPay = createStore<TeacherPayLine>("teacherPay", () => []);
const commissions = createStore<CommissionEntry>("commissions", () => []);
const recruitmentJobs = createStore<RecruitmentJob>("recruitmentJobs", () => []);
const recruitmentCandidates = createStore<RecruitmentCandidate>("recruitmentCandidates", () => []);
const recruitmentInterviews = createStore<RecruitmentInterview>("recruitmentInterviews", () => []);
const audit = createStore<AuditEntry>("audit", () => []);
const notices = createStore<Notice>("notices", () => []);
const users = createStore<User>("users", () => DEMO_USERS.map(({ title: _t, ...u }) => u));

/** Demo stand-in for the server's notifications: shows up live in the other open tabs. */
function pushNotice(title: string, body: string) {
  const n: Notice = { id: uid(), title, body, link: "/leave", at: new Date().toISOString(), read: false };
  notices.write([n, ...notices.read()]);
  emit("notification", n, { localTab: false }); // the person who acted doesn't need a toast
}

const withEmployeeAvatar = (e: Employee): Employee => {
  const login = users.read().find((u) => u.employeeId === e.id);
  return { ...e, avatarUrl: mockAvatar(login?.id), accessRole: login?.role ?? null };
};

/** Demo mode: uploaded contract files, kept in memory until the page reloads (too big for localStorage). */
const mockFiles = new Map<string, Blob>();

const log = (actor: string, action: string, target: string) =>
  audit.write([{ id: uid(), at: new Date().toISOString(), actor, action, target }, ...audit.read()]);

function recruitmentActor() {
  const user = readClientSession();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    throw new Error("Only admins and super admins can manage recruitment.");
  }
  return user;
}

export const mockServices: Services = {
  auth: {
    async signInWithMicrosoft(demoUserId) {
      const u = users.read().find((d) => d.id === demoUserId) ?? users.read()[0];
      if (!u) throw new Error("No demo accounts are configured.");
      if (u.isActive === false) throw new Error("This HR Pulse account has been disabled.");
      return delay(u, 600);
    },
    async signOut() {},
  },

  employees: {
    list: async () => delay(employees.read().map(withEmployeeAvatar)),
    get: async (id) => delay(employees.read().filter((e) => e.id === id).map(withEmployeeAvatar)[0]),
    async create(e) {
      const rows = employees.read();
      const n: Employee = { ...e, id: uid(), code: `${e.type === "teacher" ? "TCH" : "EMP"}-${String(rows.length + 1).padStart(3, "0")}` };
      employees.write([...rows, n]);
      users.write(users.read().map((u) =>
        u.email.toLowerCase() === n.email.toLowerCase() ? { ...u, name: n.name, employeeId: n.id } : u,
      ));
      log("system", "Created employee", n.name);
      return delay(n);
    },
    async update(id, patch) {
      const rows = employees.read().map((e) => (e.id === id ? { ...e, ...patch } : e));
      employees.write(rows);
      return delay(rows.find((e) => e.id === id)!);
    },
    listContracts: async (id) => delay(contracts.read().filter((c) => c.employeeId === id)),
    async uploadContract(employeeId, file, meta, uploadedBy) {
      const d: ContractDoc = {
        id: uid(), employeeId, ...meta, fileName: file.name, fileSize: file.size,
        uploadedAt: new Date().toISOString(), uploadedBy,
      };
      contracts.write([d, ...contracts.read()]);
      mockFiles.set(d.id, file);
      log(uploadedBy, "Uploaded contract", file.name);
      return delay(d, 400);
    },
    async deleteContract(id) {
      contracts.write(contracts.read().filter((c) => c.id !== id));
      mockFiles.delete(id);
      await delay(null);
    },
    async downloadContract(d) {
      const blob = mockFiles.get(d.id);
      if (!blob) throw new Error("Demo mode only keeps uploaded files until the page is reloaded. Upload it again to download it.");
      saveBlob(blob, d.fileName);
    },
  },

  attendance: {
    list: async (f) => delay(attendance.read().filter((a) => !f?.employeeId || a.employeeId === f.employeeId).sort((a, b) => b.date.localeCompare(a.date))),
    today: async (id) => delay(attendance.read().find((a) => a.employeeId === id && a.date === todayStr())),
    async clockIn(employeeId, where) {
      const rec: AttendanceRecord = { id: uid(), employeeId, date: todayStr(), clockIn: new Date().toISOString(), inLocation: where };
      attendance.write([rec, ...attendance.read()]);
      return delay(rec);
    },
    async clockOut(employeeId, where, earlyReason) {
      if (isEarlyClockOut() && !earlyReason?.trim()) throw new Error("A reason is required to clock out early.");
      let out!: AttendanceRecord;
      attendance.write(
        attendance.read().map((a) => {
          if (a.employeeId === employeeId && a.date === todayStr()) {
            out = { ...a, clockOut: new Date().toISOString(), outLocation: where, earlyReason: earlyReason?.trim() || undefined };
            return out;
          }
          return a;
        }),
      );
      return delay(out);
    },
  },

  leave: {
    list: async (f) => delay(leave.read().filter((l) => !f?.employeeId || l.employeeId === f.employeeId)),
    async create(r) {
      const problem = validateLeave(leave.read(), r);
      if (problem) throw new Error(problem);
      const n: LeaveRequest = { ...r, id: uid(), status: "pending" };
      leave.write([n, ...leave.read()]);
      const who = employees.read().find((e) => e.id === r.employeeId)?.name ?? "An employee";
      pushNotice("New leave request", `${who} requested ${r.type} leave: ${r.from} to ${r.to}.`);
      emit("leave", { id: n.id, status: n.status });
      return delay(n);
    },
    async setStatus(id, status) {
      let row: LeaveRequest | undefined;
      leave.write(leave.read().map((l) => (l.id === id ? (row = { ...l, status }) : l)));
      if (row) pushNotice(`Leave ${status}`, `${row.type} leave ${row.from} to ${row.to} was ${status}.`);
      emit("leave", { id, status });
      await delay(null);
    },
  },

  performance: {
    list: async () => delay([]),
  },

  payroll: {
    listSalary: async (month) => delay(salary.read().filter((s) => s.month === month)),
    async generateSalary(month) {
      const all = salary.read();
      const have = new Set(all.filter((s) => s.month === month).map((s) => s.employeeId));
      const paidComm = commissions.read().filter((c) => c.status === "paid" && c.paidDate?.startsWith(month));
      const prev = (id: string) => all.filter((s) => s.employeeId === id && s.month < month).sort((a, b) => b.month.localeCompare(a.month))[0];
      const fresh: SalaryLine[] = employees
        .read()
        .filter((e) => e.type === "staff" && e.status !== "terminated" && !have.has(e.id))
        .map((e) => {
          const p = prev(e.id);
          return {
            id: uid(), month, employeeId: e.id, basic: e.baseSalary,
            allowance: p?.allowance ?? 0,
            commission: paidComm.filter((c) => c.employeeId === e.id).reduce((s, c) => s + c.amount, 0),
            deduction: p?.deduction ?? 0, status: "draft" as const,
          };
        });
      salary.write([...all, ...fresh]);
      return delay(salary.read().filter((s) => s.month === month));
    },
    async updateSalary(line) {
      salary.write(salary.read().map((s) => (s.id === line.id ? line : s)));
      return delay(line, 60);
    },
    async updateSalaryMonth(month) {
      const before = new Set(salary.read().filter((s) => s.month === month).map((s) => s.id));
      await mockServices.payroll.generateSalary(month); // adds missing staff
      const emps = employees.read();
      const paid = (id: string) =>
        commissions.read().filter((c) => c.employeeId === id && c.status === "paid" && c.paidDate?.startsWith(month)).reduce((s, c) => s + c.amount, 0);
      let updated = 0;
      salary.write(salary.read().map((s) => {
        if (s.month !== month || s.status !== "draft" || !before.has(s.id)) return s;
        const basic = emps.find((e) => e.id === s.employeeId)?.baseSalary ?? s.basic;
        const commission = paid(s.employeeId);
        if (basic === s.basic && commission === s.commission) return s;
        updated++;
        return { ...s, basic, commission };
      }));
      const lines = salary.read().filter((s) => s.month === month);
      return delay({ lines, added: lines.length - before.size, updated, locked: lines.filter((s) => s.status !== "draft").length });
    },
    mySalary: async (id) =>
      delay(salary.read().filter((s) => s.employeeId === id && s.status !== "draft").sort((a, b) => b.month.localeCompare(a.month))),
    myTeacherPay: async (id) =>
      delay(teacherPay.read().filter((s) => s.employeeId === id && s.status !== "draft").sort((a, b) => b.month.localeCompare(a.month))),
    listTeacherPay: async (month) => delay(teacherPay.read().filter((s) => s.month === month)),
    async generateTeacherPay(month) {
      const all = teacherPay.read();
      const have = new Set(all.filter((s) => s.month === month).map((s) => s.employeeId));
      const fresh: TeacherPayLine[] = employees
        .read()
        .filter((e) => e.type === "teacher" && e.status !== "terminated" && !have.has(e.id))
        .map((e) => ({ id: uid(), month, employeeId: e.id, sessions: 0, hours: 0, rate: e.hourlyRate ?? 0, allowance: 0, deduction: 0, status: "draft" as const }));
      teacherPay.write([...all, ...fresh]);
      return delay(teacherPay.read().filter((s) => s.month === month));
    },
    async updateTeacherPay(line) {
      teacherPay.write(teacherPay.read().map((s) => (s.id === line.id ? line : s)));
      return delay(line, 60);
    },
    // Demo mode: pretends to send, so the flow can be tried without a mail server.
    mailStatus: async () => delay({ configured: true }),
    async emailSalarySlip(id) {
      const l = salary.read().find((s) => s.id === id);
      if (!l) throw new Error("Payslip not found");
      if (l.status === "draft") throw new Error("Approve this payslip before emailing it.");
      const next = { ...l, emailedAt: new Date().toISOString() };
      salary.write(salary.read().map((s) => (s.id === id ? next : s)));
      return delay(next, 700);
    },
    async emailTeacherSlip(id) {
      const l = teacherPay.read().find((s) => s.id === id);
      if (!l) throw new Error("Payslip not found");
      if (l.status === "draft") throw new Error("Approve this payslip before emailing it.");
      const next = { ...l, emailedAt: new Date().toISOString() };
      teacherPay.write(teacherPay.read().map((s) => (s.id === id ? next : s)));
      return delay(next, 700);
    },
    async emailMonth(kind, month, onlyUnsent = true) {
      const store = kind === "salary" ? salary : teacherPay;
      const rows = (store.read() as (SalaryLine | TeacherPayLine)[]).filter((s) => s.month === month);
      const targets = rows.filter((s) => s.status !== "draft" && !(onlyUnsent && s.emailedAt));
      const now = new Date().toISOString();
      const ids = new Set(targets.map((t) => t.id));
      store.write(store.read().map((s) => (ids.has(s.id) ? { ...s, emailedAt: now } : s)) as never);
      return delay({
        sent: targets.length,
        failed: [],
        skippedDrafts: rows.filter((s) => s.status === "draft").length,
        skippedAlreadySent: onlyUnsent ? rows.filter((s) => s.status !== "draft" && s.emailedAt).length : 0,
      }, 900);
    },
  },

  commissions: {
    list: async () => delay(commissions.read().sort((a, b) => b.dealDate.localeCompare(a.dealDate))),
    listFor: async (id) => delay(commissions.read().filter((c) => c.employeeId === id).sort((a, b) => b.dealDate.localeCompare(a.dealDate))),
    async create(c) {
      const n: CommissionEntry = { ...c, id: uid(), status: c.paidDate ? "paid" : "pending" };
      commissions.write([n, ...commissions.read()]);
      return delay(n);
    },
    async markPaid(id, paidDate) {
      let out!: CommissionEntry;
      commissions.write(commissions.read().map((c) => (c.id === id ? (out = { ...c, paidDate, status: "paid" }) : c)));
      return delay(out);
    },
    async remove(id) {
      commissions.write(commissions.read().filter((c) => c.id !== id));
      await delay(null);
    },
  },

  admin: {
    users: async () => delay(users.read().map((u) => ({ ...u, isActive: u.isActive !== false, avatarUrl: mockAvatar(u.id) }))),
    async setRole(userId, role, actor) {
      const rows = users.read();
      const target = rows.find((u) => u.id === userId);
      users.write(rows.map((u) => (u.id === userId ? { ...u, role } : u)));
      log(actor, `Changed role to ${role}`, target?.name ?? userId);
      await delay(null);
    },
    async setActive(userId, isActive, actor) {
      const actingUser = readClientSession();
      const target = users.read().find((u) => u.id === userId);
      if (!actingUser || !["admin", "superadmin"].includes(actingUser.role)) throw new Error("You do not have permission to change user accounts.");
      if (!target) throw new Error("User not found.");
      if (target.id === actingUser.id) throw new Error("You cannot deactivate your own account.");
      if (target.role === "superadmin" || (actingUser.role !== "superadmin" && target.role !== "employee")) {
        throw new Error("You do not have permission to change this account.");
      }
      users.write(users.read().map((u) => (u.id === userId ? { ...u, isActive } : u)));
      log(actor, isActive ? "Reactivated user account" : "Deactivated user account", `${target.name} (${target.role})`);
      await delay(null);
    },
    audit: async () => delay(audit.read()),
  },

  recruitment: {
    async jobs() {
      recruitmentActor();
      const order = { open: 0, draft: 1, closed: 2 };
      return delay([...recruitmentJobs.read()].sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt)));
    },
    async createJob(job) {
      const actor = recruitmentActor();
      const now = new Date().toISOString();
      const created: RecruitmentJob = { ...job, id: uid(), createdBy: actor.name, createdAt: now, updatedAt: now };
      recruitmentJobs.write([created, ...recruitmentJobs.read()]);
      log(actor.name, created.status === "open" ? "Posted recruitment role" : "Created recruitment role", created.title);
      return delay(created);
    },
    async updateJob(id, patch) {
      const actor = recruitmentActor();
      const existing = recruitmentJobs.read().find((j) => j.id === id);
      if (!existing) throw new Error("Recruitment role not found.");
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      const candidateIds = recruitmentCandidates.read().filter((c) => c.jobId === id).map((c) => c.id);
      recruitmentJobs.write(recruitmentJobs.read().map((j) => j.id === id ? updated : j));
      recruitmentCandidates.write(recruitmentCandidates.read().map((c) =>
        c.jobId === id ? { ...c, jobTitle: updated.title } : c,
      ));
      recruitmentInterviews.write(recruitmentInterviews.read().map((i) =>
        candidateIds.includes(i.candidateId) ? { ...i, jobTitle: updated.title } : i,
      ));
      log(actor.name, `Updated recruitment role (${updated.status})`, updated.title);
      return delay(updated);
    },
    async candidates() {
      recruitmentActor();
      return delay([...recruitmentCandidates.read()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    async createCandidate(candidate) {
      const actor = recruitmentActor();
      const job = recruitmentJobs.read().find((j) => j.id === candidate.jobId);
      if (!job) throw new Error("Recruitment role not found.");
      if (job.status !== "open") throw new Error("Applicants can only be added to open roles.");
      if (recruitmentCandidates.read().some((c) => c.jobId === job.id && c.email.toLowerCase() === candidate.email.toLowerCase())) {
        throw new Error("This candidate is already listed for the role.");
      }
      const now = new Date().toISOString();
      const created: RecruitmentCandidate = {
        ...candidate, id: uid(), jobTitle: job.title, stage: "applied", createdAt: now, updatedAt: now,
      };
      recruitmentCandidates.write([created, ...recruitmentCandidates.read()]);
      log(actor.name, "Added recruitment candidate", `${created.name} — ${job.title}`);
      return delay(created);
    },
    async updateCandidate(id, patch) {
      const actor = recruitmentActor();
      const existing = recruitmentCandidates.read().find((c) => c.id === id);
      if (!existing) throw new Error("Candidate not found.");
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      recruitmentCandidates.write(recruitmentCandidates.read().map((c) => c.id === id ? updated : c));
      log(actor.name, patch.stage ? `Moved candidate to ${patch.stage}` : "Updated candidate notes", updated.name);
      return delay(updated);
    },
    async interviews() {
      recruitmentActor();
      return delay([...recruitmentInterviews.read()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    },
    async createInterview(interview) {
      const actor = recruitmentActor();
      const candidate = recruitmentCandidates.read().find((c) => c.id === interview.candidateId);
      if (!candidate) throw new Error("Candidate not found.");
      if (candidate.stage === "hired" || candidate.stage === "rejected") {
        throw new Error("Interviews cannot be scheduled for a hired or rejected candidate.");
      }
      if (Number.isNaN(Date.parse(interview.scheduledAt))) throw new Error("Choose a valid interview date and time.");
      const created: RecruitmentInterview = {
        ...interview, id: uid(), candidateName: candidate.name, jobTitle: candidate.jobTitle,
        status: "scheduled", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      recruitmentInterviews.write([created, ...recruitmentInterviews.read()]);
      log(actor.name, "Scheduled recruitment interview", candidate.name);
      return delay(created);
    },
    async updateInterview(id, patch) {
      const actor = recruitmentActor();
      const existing = recruitmentInterviews.read().find((i) => i.id === id);
      if (!existing) throw new Error("Interview not found.");
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      recruitmentInterviews.write(recruitmentInterviews.read().map((i) => i.id === id ? updated : i));
      log(actor.name, `Marked interview ${patch.status}`, existing.candidateName);
      return delay(updated);
    },
  },

  profile: {
    // Demo mode keeps the picture in this browser only (the session cookie is too small for it).
    async uploadAvatar(image) {
      const me = readClientSession();
      if (!me) throw new Error("Not signed in.");
      const url = await blobToDataUrl(image);
      localStorage.setItem(mockAvatarKey(me.id), url);
      return delay({ avatarUrl: url }, 300);
    },
    async removeAvatar() {
      const me = readClientSession();
      if (me) localStorage.removeItem(mockAvatarKey(me.id));
      await delay(null);
    },
  },

  notices: {
    list: async () => delay(notices.read()),
    async markAllRead() {
      notices.write(notices.read().map((n) => ({ ...n, read: true })));
      await delay(null);
    },
  },
};
