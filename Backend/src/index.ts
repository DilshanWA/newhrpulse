import "dotenv/config";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { toNodeHandler } from "better-auth/node";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "./auth.js";
import { pool, migrate, TODAY_SQL } from "./db.js";
import { env, trustedFrontendOrigins } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { requireAuth, requireRole } from "./middleware/auth.middleware.js";
import { reverseGeocode } from "./services/geocoding.service.js";
import { AVATAR_URL_SQL } from "./services/user.service.js";
import { isMailConfigured, MailNotConfiguredError, mailErrorMessage, sendMail } from "./services/mail.service.js";
import { renderPayslipEmail, salaryPayslip, teacherPayslip } from "./services/payslip.service.js";
import { adminUserIds, employeeUserIds, notify, publish, subscribe } from "./services/realtime.service.js";

/* ------------------------------------------------------------------ helpers */

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const badRequest = (message: string) => new HttpError(400, message);

/** Express 4 does not catch rejected promises; forward them to the error handler. */
const h = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const isEmail = (v: unknown): v is string => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function month(v: unknown) {
  if (!isMonth(v)) throw badRequest("month must be in YYYY-MM format");
  return v;
}
function optionalDate(v: unknown, name: string) {
  if (v === undefined || v === null || v === "") return null;
  if (!isDate(v)) throw badRequest(`${name} must be a valid YYYY-MM-DD date`);
  return v;
}
function amount(v: unknown, name: string, { min = 0, optional = false } = {}) {
  if (optional && (v === undefined || v === null || v === "")) return null;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min) throw badRequest(`${name} must be a number ≥ ${min}`);
  return n;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) throw badRequest(`${name} must be one of: ${allowed.join(", ")}`);
  return v as T;
}
function requiredText(v: unknown, name: string, max = 5000) {
  const value = str(v);
  if (!value) throw badRequest(`${name} is required`);
  if (value.length > max) throw badRequest(`${name} must be ${max} characters or fewer`);
  return value;
}
function optionalText(v: unknown, name: string, max = 5000) {
  if (typeof v !== "string") throw badRequest(`${name} must be text`);
  const value = v.trim();
  if (value.length > max) throw badRequest(`${name} must be ${max} characters or fewer`);
  return value;
}

/** The signed-in user's own employee id, or 403 if the login is not linked to one. */
function ownEmployeeId(req: Request) {
  const id = req.user?.employeeId;
  if (!id) throw new HttpError(403, "Your account is not linked to an employee record");
  return id;
}
/** Employees are always limited to themselves; admins may filter by `requested`. */
function scopeEmployee(req: Request, requested: unknown): string | undefined {
  if (req.user!.role === "employee") return ownEmployeeId(req);
  return typeof requested === "string" && requested ? requested : undefined;
}
/** Whose attendance to act on: self for employees, `requested` or self for admins. */
function targetEmployee(req: Request, requested: unknown) {
  return scopeEmployee(req, requested) ?? ownEmployeeId(req);
}

async function audit(actor: string, action: string, target: string) {
  await pool.query("insert into audit_entries (id,actor,action,target) values ($1,$2,$3,$4)", [randomUUID(), actor, action, target]);
}

/** Runs a side effect (notifications) after the main change has been saved; a failure here must not fail the request. */
function afterCommit(label: string, fn: () => Promise<unknown>) {
  fn().catch((e) => console.error(`${label} failed:`, e));
}

const EMPLOYEE_COLS = `id,code,name,email,phone,department,position,type,status,joined_on as "joinedOn",base_salary as "baseSalary",hourly_rate as "hourlyRate",
  (select ${AVATAR_URL_SQL} from users u where u.employee_id=employees.id and u.avatar_file is not null limit 1) as "avatarUrl",
  (select u.role from users u where u.employee_id=employees.id
     order by case u.role when 'superadmin' then 0 when 'admin' then 1 else 2 end limit 1) as "accessRole"`;
const CONTRACT_COLS = `id,employee_id as "employeeId",kind,file_name as "fileName",file_size as "fileSize",uploaded_at as "uploadedAt",uploaded_by as "uploadedBy",valid_from as "validFrom",valid_to as "validTo"`;
const ATTENDANCE_COLS = `id,employee_id as "employeeId",date,clock_in as "clockIn",clock_out as "clockOut",
  case when in_lat is null then null else jsonb_build_object('lat',in_lat,'lng',in_lng,'accuracy',in_accuracy,'placeId',in_place_id,'name',in_place_name) end as "inLocation",
  case when out_lat is null then null else jsonb_build_object('lat',out_lat,'lng',out_lng,'accuracy',out_accuracy,'placeId',out_place_id,'name',out_place_name) end as "outLocation",
  early_reason as "earlyReason"`;
const LEAVE_COLS = `id,employee_id as "employeeId",type,from_date as "from",to_date as "to",reason,status`;
const SALARY_COLS = `id,month,employee_id as "employeeId",basic,allowance,commission,deduction,note,status,emailed_at as "emailedAt"`;
const TEACHER_COLS = `id,month,employee_id as "employeeId",sessions,hours,rate,allowance,deduction,status,emailed_at as "emailedAt"`;
const COMMISSION_COLS = `id,customer,employee_id as "employeeId",kind,amount,deal_date as "dealDate",paid_date as "paidDate",status,note`;

const EMPLOYEE_TYPES = ["staff", "teacher"] as const;
const EMPLOYEE_STATUSES = ["active", "on_leave", "terminated"] as const;
const PAY_STATUSES = ["draft", "approved", "paid"] as const;
const CONTRACT_KINDS = ["Employment Contract", "Amendment", "NDA", "Other"] as const;
const COMMISSION_KINDS = ["first_sale", "second_sale", "operation"] as const;
const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Unpaid"] as const;
const JOB_TYPES = ["full_time", "part_time", "contract", "internship"] as const;
const JOB_STATUSES = ["draft", "open", "closed"] as const;
const CANDIDATE_STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;
const INTERVIEW_TYPES = ["video", "phone", "onsite"] as const;
const INTERVIEW_STATUSES = ["scheduled", "completed", "cancelled"] as const;

/* -------------------------------------------------------------- leave rules */
// Must match Frontend/src/domain/policy.ts.
const LEAVE_POLICY = { annualEntitlement: 18, monthlyLimit: 2, countedTypes: ["Annual", "Sick", "Casual"], workingDays: [1, 2, 3, 4, 5] };

function leaveDaysByMonth(from: string, to: string) {
  const out: Record<string, number> = {};
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = start; t <= end; t += 864e5) {
    const d = new Date(t);
    if (!LEAVE_POLICY.workingDays.includes(d.getUTCDay())) continue;
    const key = d.toISOString().slice(0, 7);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

type LeaveRow = { type: string; from_date: string; to_date: string };

/** `existing` = the employee's non-rejected requests. Returns an error message or null. */
function validateLeave(existing: LeaveRow[], type: string, from: string, to: string): string | null {
  if (to < from) return "The end date is before the start date.";
  if (existing.some((r) => r.from_date <= to && from <= r.to_date)) return "You already have leave that overlaps these dates.";
  const byMonth = leaveDaysByMonth(from, to);
  if (!Object.keys(byMonth).length) return "The selected dates contain no working days.";
  if (!LEAVE_POLICY.countedTypes.includes(type)) return null;

  const usedByMonth: Record<string, number> = {};
  for (const r of existing.filter((x) => LEAVE_POLICY.countedTypes.includes(x.type)))
    for (const [k, n] of Object.entries(leaveDaysByMonth(r.from_date, r.to_date))) usedByMonth[k] = (usedByMonth[k] ?? 0) + n;

  for (const [k, n] of Object.entries(byMonth)) {
    const left = LEAVE_POLICY.monthlyLimit - (usedByMonth[k] ?? 0);
    if (n > left) return `Monthly limit is ${LEAVE_POLICY.monthlyLimit} days. You have ${Math.max(0, left)} left in ${k}.`;
  }
  const yearUsed: Record<string, number> = {};
  for (const [k, n] of Object.entries(usedByMonth)) yearUsed[k.slice(0, 4)] = (yearUsed[k.slice(0, 4)] ?? 0) + n;
  const yearReq: Record<string, number> = {};
  for (const [k, n] of Object.entries(byMonth)) yearReq[k.slice(0, 4)] = (yearReq[k.slice(0, 4)] ?? 0) + n;
  for (const [y, n] of Object.entries(yearReq)) {
    const left = LEAVE_POLICY.annualEntitlement - (yearUsed[y] ?? 0);
    if (n > left) return `Annual limit is ${LEAVE_POLICY.annualEntitlement} days. You have ${Math.max(0, left)} left in ${y}.`;
  }
  return null;
}

/* --------------------------------------------------------------------- app */

const app = express();
app.set("trust proxy", 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: trustedFrontendOrigins, credentials: true }));
// Better Auth must see the raw body, so it is mounted before express.json().
app.use("/api/auth", authRouter);
app.all("/api/auth/*", toNodeHandler(auth));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
await mkdir(UPLOAD_DIR, { recursive: true });
const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(badRequest(`Allowed file types: ${ALLOWED_EXT.join(", ")}`));
  },
});

app.use("/api", requireAuth);

/* ---------------------------------------------------------------- employees */

app.get("/api/employees", h(async (req, res) => {
  // Employees only ever see their own record (pages use it to show names).
  const r = req.user!.role === "employee"
    ? await pool.query(`select ${EMPLOYEE_COLS} from employees where id=$1`, [ownEmployeeId(req)])
    : await pool.query(`select ${EMPLOYEE_COLS} from employees order by name`);
  res.json(r.rows);
}));

app.get("/api/employees/:id", h(async (req, res) => {
  if (req.user!.role === "employee" && req.user!.employeeId !== req.params.id) throw new HttpError(403, "Forbidden");
  const r = await pool.query(`select ${EMPLOYEE_COLS} from employees where id=$1`, [req.params.id]);
  if (!r.rowCount) throw new HttpError(404, "Employee not found");
  res.json(r.rows[0]);
}));

app.post("/api/employees", requireRole("superadmin", "admin"), h(async (req, res) => {
  const e = req.body ?? {};
  const name = str(e.name);
  if (!name) throw badRequest("name is required");
  if (!isEmail(e.email)) throw badRequest("A valid email is required");
  const type = oneOf(e.type, EMPLOYEE_TYPES, "type");
  const status = e.status === undefined ? "active" : oneOf(e.status, EMPLOYEE_STATUSES, "status");
  if (!isDate(e.joinedOn)) throw badRequest("joinedOn must be a valid YYYY-MM-DD date");
  const code = `${type === "teacher" ? "TCH" : "EMP"}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const email = e.email.trim().toLowerCase();
  const client = await pool.connect();
  let employee: { id: string; [key: string]: unknown };
  try {
    await client.query("begin");
    const r = await client.query<{ id: string; [key: string]: unknown }>(
      `insert into employees(id,code,name,email,phone,department,position,type,status,joined_on,base_salary,hourly_rate)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning ${EMPLOYEE_COLS}`,
      [randomUUID(), code, name, email, str(e.phone), str(e.department), str(e.position), type, status,
        e.joinedOn, amount(e.baseSalary ?? 0, "baseSalary"), amount(e.hourlyRate, "hourlyRate", { optional: true })],
    );
    employee = r.rows[0];
    if (status !== "terminated") {
      await client.query(
        "update users set name=$1, employee_id=$2 where lower(email)=$3",
        [name, employee.id, email],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  await audit(req.user!.name, "Created employee", name);
  res.status(201).json(employee);
}));

app.patch("/api/employees/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const columns: Record<string, string> = {
    name: "name", email: "email", phone: "phone", department: "department", position: "position", type: "type",
    status: "status", joinedOn: "joined_on", baseSalary: "base_salary", hourlyRate: "hourly_rate",
  };
  const b = req.body ?? {};
  const entries: [string, unknown][] = [];
  for (const [k, v] of Object.entries(b)) {
    if (!(k in columns)) continue;
    if (k === "email") { if (!isEmail(v)) throw badRequest("A valid email is required"); entries.push([k, v.trim().toLowerCase()]); }
    else if (k === "name") { if (!str(v)) throw badRequest("name is required"); entries.push([k, str(v)]); }
    else if (k === "type") entries.push([k, oneOf(v, EMPLOYEE_TYPES, "type")]);
    else if (k === "status") entries.push([k, oneOf(v, EMPLOYEE_STATUSES, "status")]);
    else if (k === "joinedOn") { if (!isDate(v)) throw badRequest("joinedOn must be a valid date"); entries.push([k, v]); }
    else if (k === "baseSalary") entries.push([k, amount(v, "baseSalary")]);
    else if (k === "hourlyRate") entries.push([k, amount(v, "hourlyRate", { optional: true })]);
    else entries.push([k, str(v)]);
  }
  if (!entries.length) throw badRequest("No valid fields");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const set = entries.map(([k], i) => `"${columns[k]}"=$${i + 1}`).join(",");
    const r = await client.query(`update employees set ${set} where id=$${entries.length + 1} returning ${EMPLOYEE_COLS}`,
      [...entries.map(([, v]) => v), req.params.id]);
    if (!r.rowCount) throw new HttpError(404, "Employee not found");
    // Keep the linked login in sync so the person can still sign in.
    await client.query("update users set email=$1, name=$2 where employee_id=$3", [r.rows[0].email, r.rows[0].name, req.params.id]);
    await client.query("commit");
    await audit(req.user!.name, "Updated employee", r.rows[0].name);
    res.json(r.rows[0]);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}));

/* ---------------------------------------------------------------- contracts */

app.get("/api/employees/:id/contracts", h(async (req, res) => {
  if (req.user!.role === "employee" && req.user!.employeeId !== req.params.id) throw new HttpError(403, "Forbidden");
  const r = await pool.query(`select ${CONTRACT_COLS} from contracts where employee_id=$1 order by uploaded_at desc`, [req.params.id]);
  res.json(r.rows);
}));

app.post("/api/employees/:id/contracts", requireRole("superadmin", "admin"), upload.single("file"), h(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest("File is required");
  try {
    const kind = req.body.kind ? oneOf(req.body.kind, CONTRACT_KINDS, "kind") : "Other";
    const validFrom = optionalDate(req.body.validFrom, "validFrom");
    const validTo = optionalDate(req.body.validTo, "validTo");
    if (validFrom && validTo && validTo < validFrom) throw badRequest("validTo is before validFrom");
    const emp = await pool.query("select name from employees where id=$1", [req.params.id]);
    if (!emp.rowCount) throw new HttpError(404, "Employee not found");
    const r = await pool.query(
      `insert into contracts(id,employee_id,kind,file_name,file_size,stored_name,uploaded_by,valid_from,valid_to)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${CONTRACT_COLS}`,
      [randomUUID(), req.params.id, kind, path.basename(file.originalname), file.size, file.filename, req.user!.name, validFrom, validTo],
    );
    await audit(req.user!.name, "Uploaded contract", `${file.originalname} (${emp.rows[0].name})`);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    await rm(file.path, { force: true }); // don't leave orphaned uploads behind
    throw e;
  }
}));

app.get("/api/contracts/:id/download", h(async (req, res) => {
  const r = await pool.query("select stored_name,file_name,employee_id from contracts where id=$1", [req.params.id]);
  if (!r.rowCount) throw new HttpError(404, "Contract not found");
  if (req.user!.role === "employee" && req.user!.employeeId !== r.rows[0].employee_id) throw new HttpError(403, "Forbidden");
  res.download(path.join(UPLOAD_DIR, path.basename(r.rows[0].stored_name)), r.rows[0].file_name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File is missing on the server" });
  });
}));

app.delete("/api/contracts/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const r = await pool.query("delete from contracts where id=$1 returning stored_name,file_name", [req.params.id]);
  if (!r.rowCount) throw new HttpError(404, "Contract not found");
  await rm(path.join(UPLOAD_DIR, path.basename(r.rows[0].stored_name)), { force: true });
  await audit(req.user!.name, "Deleted contract", r.rows[0].file_name);
  res.status(204).end();
}));

/* --------------------------------------------------------------- attendance */

function location(b: Record<string, unknown>) {
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw badRequest("A valid location (lat, lng) is required");
  const acc = b.accuracy === undefined || b.accuracy === null ? null : Number(b.accuracy);
  return { lat, lng, accuracy: Number.isFinite(acc) ? acc : null };
}

/**
 * Looks up the place name for a clock-in/out and saves it on the record.
 * The GPS coordinates are already saved; a failed lookup only means no name.
 */
async function savePlaceName(recordId: string, side: "in" | "out", lat: number, lng: number) {
  const geocoded = await reverseGeocode(lat, lng);
  if (geocoded.warningCode) console.warn(`Attendance place-name lookup (${side}) failed:`, geocoded.warningCode);
  if (!geocoded.name) return { record: null, warning: geocoded.warning };
  const r = await pool.query(
    `update attendance set ${side}_place_name=$2, ${side}_place_id=$3 where id=$1 returning ${ATTENDANCE_COLS}`,
    [recordId, geocoded.name, geocoded.placeId ?? null],
  );
  return { record: r.rows[0] ?? null, warning: undefined };
}

/** Older records (or ones whose lookup failed) get their place names filled in the background. */
let backfilling = false;
function backfillPlaceNames() {
  if (backfilling) return;
  backfilling = true;
  afterCommit("Attendance place-name backfill", async () => {
    try {
      const r = await pool.query<{ id: string; side: "in" | "out"; lat: number; lng: number }>(
        `select id,'in' as side,in_lat as lat,in_lng as lng from attendance where in_lat is not null and in_place_name is null
         union all
         select id,'out',out_lat,out_lng from attendance where out_lat is not null and out_place_name is null
         limit 10`,
      );
      for (const row of r.rows) await savePlaceName(row.id, row.side, row.lat, row.lng);
    } finally {
      backfilling = false;
    }
  });
}

app.get("/api/attendance", h(async (req, res) => {
  const employeeId = scopeEmployee(req, req.query.employeeId);
  const r = await pool.query(
    `select ${ATTENDANCE_COLS} from attendance ${employeeId ? "where employee_id=$1" : ""} order by date desc, clock_in desc`,
    employeeId ? [employeeId] : [],
  );
  res.json(r.rows);
  if (r.rows.some((x) => (x.inLocation && !x.inLocation.name) || (x.outLocation && !x.outLocation.name))) backfillPlaceNames();
}));

app.get("/api/attendance/today", h(async (req, res) => {
  const employeeId = targetEmployee(req, req.query.employeeId);
  const r = await pool.query(`select ${ATTENDANCE_COLS} from attendance where employee_id=$1 and date=${TODAY_SQL}`, [employeeId]);
  res.json(r.rows[0] ?? null);
}));

app.post("/api/attendance/clock-in", h(async (req, res) => {
  const employeeId = targetEmployee(req, req.body?.employeeId);
  const where = location(req.body ?? {});
  const r = await pool.query(
    `insert into attendance(id,employee_id,date,clock_in,in_lat,in_lng,in_accuracy)
     values($1,$2,${TODAY_SQL},now(),$3,$4,$5)
     on conflict(employee_id,date) do update set clock_in=now(),in_lat=$3,in_lng=$4,in_accuracy=$5,in_place_id=null,in_place_name=null
       where attendance.clock_in is null
     returning ${ATTENDANCE_COLS}`,
    [randomUUID(), employeeId, where.lat, where.lng, where.accuracy],
  );
  if (!r.rowCount) throw new HttpError(409, "You have already clocked in today");
  res.status(201).json(r.rows[0]);
  afterCommit("Attendance clock-in place-name lookup", async () => {
    await savePlaceName(r.rows[0].id, "in", where.lat, where.lng);
  });
}));

app.post("/api/attendance/clock-out", h(async (req, res) => {
  const employeeId = targetEmployee(req, req.body?.employeeId);
  const where = location(req.body ?? {});
  const reason = str(req.body?.earlyReason);
  const colomboNow = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  if (colomboNow < "17:00" && reason.length < 5) throw badRequest("A reason is required to clock out early");
  const r = await pool.query(
    `update attendance set clock_out=now(),out_lat=$2,out_lng=$3,out_accuracy=$4,out_place_id=null,out_place_name=null,early_reason=$5
      where employee_id=$1 and date=${TODAY_SQL} and clock_in is not null and clock_out is null
      returning ${ATTENDANCE_COLS}`,
    [employeeId, where.lat, where.lng, where.accuracy, reason || null],
  );
  if (!r.rowCount) {
    const existing = await pool.query(`select clock_out from attendance where employee_id=$1 and date=${TODAY_SQL}`, [employeeId]);
    if (existing.rows[0]?.clock_out) throw new HttpError(409, "You have already clocked out today");
    throw new HttpError(404, "No clock-in record exists for today");
  }
  res.json(r.rows[0]);
  afterCommit("Attendance clock-out place-name lookup", async () => {
    await savePlaceName(r.rows[0].id, "out", where.lat, where.lng);
  });
}));

/* -------------------------------------------------------------------- leave */

app.get("/api/leave", h(async (req, res) => {
  const employeeId = scopeEmployee(req, req.query.employeeId);
  const r = await pool.query(
    `select ${LEAVE_COLS} from leave_requests ${employeeId ? "where employee_id=$1" : ""} order by from_date desc`,
    employeeId ? [employeeId] : [],
  );
  res.json(r.rows);
}));

app.post("/api/leave", h(async (req, res) => {
  const b = req.body ?? {};
  const employeeId = targetEmployee(req, b.employeeId);
  const type = oneOf(b.type, LEAVE_TYPES, "type");
  if (!isDate(b.from) || !isDate(b.to)) throw badRequest("Choose a valid start and end date.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    // Serialise requests per employee so two parallel submissions can't both pass the limits.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [employeeId]);
    const existing = await client.query<LeaveRow>(
      "select type,from_date,to_date from leave_requests where employee_id=$1 and status<>'rejected'",
      [employeeId],
    );
    const problem = validateLeave(existing.rows, type, b.from, b.to);
    if (problem) throw badRequest(problem);
    const r = await client.query(
      `insert into leave_requests(id,employee_id,type,from_date,to_date,reason,status) values($1,$2,$3,$4,$5,$6,'pending')
       returning ${LEAVE_COLS}`,
      [randomUUID(), employeeId, type, b.from, b.to, str(b.reason)],
    );
    await client.query("commit");
    const leave = r.rows[0];
    res.status(201).json(leave);

    const actorId = req.user!.id;
    afterCommit("Leave request notification", async () => {
      const [admins, owners, emp] = await Promise.all([
        adminUserIds(),
        employeeUserIds(employeeId),
        pool.query<{ name: string }>("select name from employees where id=$1", [employeeId]),
      ]);
      const who = emp.rows[0]?.name ?? "An employee";
      await notify(admins.filter((id) => id !== actorId), {
        title: "New leave request",
        body: `${who} requested ${type} leave: ${describeRange(type, b.from, b.to)}.`,
        link: "/leave",
      });
      publish([...admins, ...owners], "leave", { id: leave.id, status: leave.status });
    });
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}));

app.patch("/api/leave/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const status = oneOf(req.body?.status, ["approved", "rejected"] as const, "status");
  const existing = await pool.query<{ employee_id: string; type: string; from_date: string; to_date: string }>(
    "select employee_id,type,from_date,to_date from leave_requests where id=$1", [req.params.id],
  );
  if (!existing.rowCount) throw new HttpError(404, "Leave request not found");
  const row = existing.rows[0];
  if (req.user!.role !== "superadmin" && row.employee_id === req.user!.employeeId)
    throw new HttpError(403, "You cannot approve or reject your own leave");
  await pool.query("update leave_requests set status=$1 where id=$2", [status, req.params.id]);
  await audit(req.user!.name, `${status === "approved" ? "Approved" : "Rejected"} leave request`, String(req.params.id));
  res.status(204).end();

  const actor = req.user!;
  afterCommit("Leave decision notification", async () => {
    const [admins, owners] = await Promise.all([adminUserIds(), employeeUserIds(row.employee_id)]);
    await notify(owners.filter((id) => id !== actor.id), {
      title: `Leave ${status}`,
      body: `${actor.name} ${status} your ${row.type} leave: ${describeRange(row.type, row.from_date, row.to_date)}.`,
      link: "/leave",
    });
    publish([...admins, ...owners], "leave", { id: req.params.id, status });
  });
}));

function describeRange(type: string, from: string, to: string) {
  const days = Object.values(leaveDaysByMonth(from, to)).reduce((s, n) => s + n, 0);
  const range = from === to ? from : `${from} to ${to}`;
  return `${range} (${days} working day${days === 1 ? "" : "s"}${type === "Unpaid" ? ", unpaid" : ""})`;
}

/* -------------------------------------------------------------- performance */

app.get("/api/performance", h(async (req, res) => {
  const employeeId = scopeEmployee(req, req.query.employeeId);
  const r = await pool.query(
    `select id,employee_id as "employeeId",period,score,goals_done as "goalsDone",goals_total as "goalsTotal",note
       from performance ${employeeId ? "where employee_id=$1" : ""} order by period desc`,
    employeeId ? [employeeId] : [],
  );
  res.json(r.rows);
}));

/* ------------------------------------------------------------------ payroll */

app.get("/api/payroll/salary", requireRole("superadmin", "admin"), h(async (req, res) => {
  const r = await pool.query(`select ${SALARY_COLS} from salary_lines where month=$1 order by employee_id`, [month(req.query.month)]);
  res.json(r.rows);
}));

app.post("/api/payroll/salary/generate", requireRole("superadmin", "admin"), h(async (req, res) => {
  const m = month(req.body?.month);
  const emps = await pool.query("select id,base_salary from employees where type='staff' and status<>'terminated'");
  for (const e of emps.rows) {
    await pool.query(
      `insert into salary_lines(id,month,employee_id,basic,allowance,commission,deduction,status)
       select $1,$2,$3,$4,
         coalesce((select allowance from salary_lines p where p.employee_id=$3 and p.month<$2 order by month desc limit 1),0),
         coalesce((select sum(amount) from commissions c where c.employee_id=$3 and c.status='paid' and to_char(paid_date,'YYYY-MM')=$2),0),
         coalesce((select deduction from salary_lines p where p.employee_id=$3 and p.month<$2 order by month desc limit 1),0),
         'draft'
       on conflict(month,employee_id) do nothing`,
      [randomUUID(), m, e.id, e.base_salary],
    );
  }
  const r = await pool.query(`select ${SALARY_COLS} from salary_lines where month=$1 order by employee_id`, [m]);
  await audit(req.user!.name, "Generated salary sheet", m);
  res.json(r.rows);
}));

/**
 * Creates or refreshes a month's salary sheet:
 * - adds a draft line for every active staff member who isn't on it yet;
 * - on existing DRAFT lines, resets basic to the current base salary and commission to the
 *   commissions paid that month (allowance, deduction and note are left as typed);
 * - approved and paid lines are never touched.
 */
app.post("/api/payroll/salary/update-month", requireRole("superadmin", "admin"), h(async (req, res) => {
  const m = month(req.body?.month);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('salary-month:' || $1))", [m]);
    const added = await client.query(
      `insert into salary_lines(id,month,employee_id,basic,allowance,commission,deduction,status)
       select gen_random_uuid()::text, $1, e.id, e.base_salary,
         coalesce((select p.allowance from salary_lines p where p.employee_id=e.id and p.month<$1 order by p.month desc limit 1),0),
         coalesce((select sum(c.amount) from commissions c where c.employee_id=e.id and c.status='paid' and to_char(c.paid_date,'YYYY-MM')=$1),0),
         coalesce((select p.deduction from salary_lines p where p.employee_id=e.id and p.month<$1 order by p.month desc limit 1),0),
         'draft'
       from employees e
       where e.type='staff' and e.status<>'terminated'
       on conflict(month,employee_id) do nothing
       returning id`,
      [m],
    );
    const updated = await client.query(
      `with fresh as (
         select l.id, e.base_salary as basic,
           coalesce((select sum(c.amount) from commissions c where c.employee_id=l.employee_id and c.status='paid' and to_char(c.paid_date,'YYYY-MM')=$1),0) as commission
         from salary_lines l join employees e on e.id=l.employee_id
         where l.month=$1 and l.status='draft'
       )
       update salary_lines l set basic=f.basic, commission=f.commission
       from fresh f
       where l.id=f.id and (l.basic,l.commission) is distinct from (f.basic,f.commission)
       returning l.id`,
      [m],
    );
    const locked = await client.query<{ n: number }>(
      "select count(*)::int as n from salary_lines where month=$1 and status<>'draft'", [m],
    );
    const lines = await client.query(`select ${SALARY_COLS} from salary_lines where month=$1 order by employee_id`, [m]);
    await client.query("commit");
    await audit(req.user!.name, "Updated salary sheet", `${m} (${added.rowCount} added, ${updated.rowCount} refreshed)`);
    res.json({ lines: lines.rows, added: added.rowCount ?? 0, updated: updated.rowCount ?? 0, locked: locked.rows[0].n });
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}));

app.put("/api/payroll/salary/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const l = req.body ?? {};
  const r = await pool.query(
    // Changing any amount after the payslip was emailed clears "emailed", so HR knows to resend.
    `update salary_lines set basic=$1,allowance=$2,commission=$3,deduction=$4,note=$5,status=$6,
       emailed_at = case when (basic,allowance,commission,deduction) is distinct from ($1::numeric,$2::numeric,$3::numeric,$4::numeric) then null else emailed_at end
     where id=$7 returning ${SALARY_COLS}`,
    [amount(l.basic, "basic"), amount(l.allowance, "allowance"), amount(l.commission, "commission"), amount(l.deduction, "deduction"),
      str(l.note) || null, oneOf(l.status, PAY_STATUSES, "status"), req.params.id],
  );
  if (!r.rowCount) throw new HttpError(404, "Salary line not found");
  await audit(req.user!.name, "Updated salary line", String(req.params.id));
  res.json(r.rows[0]);
}));

app.get("/api/payroll/me/salary", h(async (req, res) => {
  if (!req.user!.employeeId) return res.json([]);
  const r = await pool.query(`select ${SALARY_COLS} from salary_lines where employee_id=$1 and status<>'draft' order by month desc`, [req.user!.employeeId]);
  res.json(r.rows);
}));

app.get("/api/payroll/me/teachers", h(async (req, res) => {
  if (!req.user!.employeeId) return res.json([]);
  const r = await pool.query(`select ${TEACHER_COLS} from teacher_pay_lines where employee_id=$1 and status<>'draft' order by month desc`, [req.user!.employeeId]);
  res.json(r.rows);
}));

app.get("/api/payroll/teachers", requireRole("superadmin", "admin"), h(async (req, res) => {
  const r = await pool.query(`select ${TEACHER_COLS} from teacher_pay_lines where month=$1 order by employee_id`, [month(req.query.month)]);
  res.json(r.rows);
}));

app.post("/api/payroll/teachers/generate", requireRole("superadmin", "admin"), h(async (req, res) => {
  const m = month(req.body?.month);
  const emps = await pool.query("select id,hourly_rate from employees where type='teacher' and status<>'terminated'");
  for (const e of emps.rows) {
    await pool.query(
      `insert into teacher_pay_lines(id,month,employee_id,sessions,hours,rate,allowance,deduction,status)
       values($1,$2,$3,0,0,$4,0,0,'draft') on conflict(month,employee_id) do nothing`,
      [randomUUID(), m, e.id, e.hourly_rate ?? 0],
    );
  }
  const r = await pool.query(`select ${TEACHER_COLS} from teacher_pay_lines where month=$1 order by employee_id`, [m]);
  await audit(req.user!.name, "Generated teacher pay sheet", m);
  res.json(r.rows);
}));

app.put("/api/payroll/teachers/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const l = req.body ?? {};
  const sessions = amount(l.sessions, "sessions");
  if (!Number.isInteger(sessions)) throw badRequest("sessions must be a whole number");
  const r = await pool.query(
    `update teacher_pay_lines set sessions=$1,hours=$2,rate=$3,allowance=$4,deduction=$5,status=$6,
       emailed_at = case when (sessions,hours,rate,allowance,deduction) is distinct from ($1::int,$2::numeric,$3::numeric,$4::numeric,$5::numeric) then null else emailed_at end
     where id=$7 returning ${TEACHER_COLS}`,
    [sessions, amount(l.hours, "hours"), amount(l.rate, "rate"), amount(l.allowance, "allowance"), amount(l.deduction, "deduction"),
      oneOf(l.status, PAY_STATUSES, "status"), req.params.id],
  );
  if (!r.rowCount) throw new HttpError(404, "Teacher pay line not found");
  await audit(req.user!.name, "Updated teacher pay line", String(req.params.id));
  res.json(r.rows[0]);
}));

/* ---------------------------------------------------------- payslip emails */

const COMPANY_NAME = process.env.COMPANY_NAME?.trim() || "HR Pulse";
type PayKind = "salary" | "teachers";
const PAY_TABLE: Record<PayKind, { table: string; cols: string }> = {
  salary: { table: "salary_lines", cols: SALARY_COLS },
  teachers: { table: "teacher_pay_lines", cols: TEACHER_COLS },
};
const payKind = (v: unknown) => oneOf(v, ["salary", "teachers"] as const, "kind");

/** Emails one approved/paid payslip to the employee's address and records when it was sent. */
async function emailPayslip(kind: PayKind, lineId: string, actor: { name: string; email: string }) {
  const { table, cols } = PAY_TABLE[kind];
  const r = await pool.query(
    `select l.*, e.name, e.email, e.code, e.position, e.department
       from ${table} l join employees e on e.id = l.employee_id where l.id = $1`,
    [lineId],
  );
  const l = r.rows[0];
  if (!l) throw new HttpError(404, "Payslip not found");
  if (l.status === "draft") throw badRequest(`${l.name}'s payslip is still a draft. Approve it before emailing.`);
  if (!isEmail(l.email)) throw badRequest(`${l.name} has no valid email address on their employee record.`);

  const employee = { name: l.name, code: l.code, position: l.position, department: l.department };
  const slip = kind === "salary" ? salaryPayslip(l, employee) : teacherPayslip(l, employee);
  const mail = renderPayslipEmail({ ...slip, company: COMPANY_NAME, recipientEmail: l.email });
  try {
    await sendMail({ to: l.email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: actor.email });
  } catch (e) {
    console.error(`Payslip email to employee ${l.employee_id} failed:`, e);
    throw new HttpError(502, mailErrorMessage(e));
  }
  const saved = await pool.query(`update ${table} set emailed_at=now() where id=$1 returning ${cols}`, [lineId]);
  await audit(actor.name, "Emailed payslip", `${l.name} · ${l.month}`);
  return { line: saved.rows[0], name: l.name as string, email: l.email as string };
}

app.get("/api/mail/status", requireRole("superadmin", "admin"), (_req, res) => {
  res.json({ configured: isMailConfigured() });
});

app.post("/api/payroll/:kind/:id/email", requireRole("superadmin", "admin"), h(async (req, res) => {
  if (!isMailConfigured()) throw new HttpError(503, new MailNotConfiguredError().message);
  const result = await emailPayslip(payKind(req.params.kind), String(req.params.id), req.user!);
  res.json(result.line);
}));

/** Emails every approved/paid payslip for a month. `onlyUnsent` skips ones already emailed. */
app.post("/api/payroll/:kind/email-month", requireRole("superadmin", "admin"), h(async (req, res) => {
  if (!isMailConfigured()) throw new HttpError(503, new MailNotConfiguredError().message);
  const kind = payKind(req.params.kind);
  const m = month(req.body?.month);
  const onlyUnsent = req.body?.onlyUnsent !== false;
  const lines = await pool.query<{ id: string; status: string; emailed_at: string | null }>(
    `select id,status,emailed_at from ${PAY_TABLE[kind].table} where month=$1`, [m],
  );
  const targets = lines.rows.filter((l) => l.status !== "draft" && !(onlyUnsent && l.emailed_at));
  const sent: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const t of targets) {
    try {
      sent.push((await emailPayslip(kind, t.id, req.user!)).name);
    } catch (e) {
      const name = (await pool.query(
        `select e.name from ${PAY_TABLE[kind].table} l join employees e on e.id=l.employee_id where l.id=$1`, [t.id],
      )).rows[0]?.name ?? "Unknown";
      failed.push({ name, error: e instanceof HttpError ? e.message : "The email could not be sent." });
    }
  }
  res.json({
    sent: sent.length,
    failed,
    skippedDrafts: lines.rows.filter((l) => l.status === "draft").length,
    skippedAlreadySent: onlyUnsent ? lines.rows.filter((l) => l.status !== "draft" && l.emailed_at).length : 0,
  });
}));

/* -------------------------------------------------------------- commissions */

app.get("/api/commissions", requireRole("superadmin", "admin"), h(async (_req, res) => {
  const r = await pool.query(`select ${COMMISSION_COLS} from commissions order by deal_date desc`);
  res.json(r.rows);
}));

app.get("/api/commissions/me", h(async (req, res) => {
  if (!req.user!.employeeId) return res.json([]);
  const r = await pool.query(`select ${COMMISSION_COLS} from commissions where employee_id=$1 order by deal_date desc`, [req.user!.employeeId]);
  res.json(r.rows);
}));

app.post("/api/commissions", requireRole("superadmin", "admin"), h(async (req, res) => {
  const c = req.body ?? {};
  const customer = str(c.customer);
  if (!customer) throw badRequest("customer is required");
  if (!str(c.employeeId)) throw badRequest("employeeId is required");
  if (!isDate(c.dealDate)) throw badRequest("dealDate must be a valid date");
  const paidDate = optionalDate(c.paidDate, "paidDate");
  const r = await pool.query(
    `insert into commissions(id,customer,employee_id,kind,amount,deal_date,paid_date,status,note)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${COMMISSION_COLS}`,
    [randomUUID(), customer, c.employeeId, oneOf(c.kind, COMMISSION_KINDS, "kind"), amount(c.amount, "amount", { min: 0.01 }),
      c.dealDate, paidDate, paidDate ? "paid" : "pending", str(c.note) || null],
  );
  await audit(req.user!.name, "Created commission", customer);
  res.status(201).json(r.rows[0]);
}));

app.patch("/api/commissions/:id/paid", requireRole("superadmin", "admin"), h(async (req, res) => {
  const paidDate = optionalDate(req.body?.paidDate, "paidDate");
  if (!paidDate) throw badRequest("paidDate is required");
  const r = await pool.query(
    `update commissions set paid_date=$1,status='paid' where id=$2 returning ${COMMISSION_COLS}`,
    [paidDate, req.params.id],
  );
  if (!r.rowCount) throw new HttpError(404, "Commission not found");
  await audit(req.user!.name, "Marked commission paid", r.rows[0].customer);
  res.json(r.rows[0]);
}));

app.delete("/api/commissions/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const r = await pool.query("delete from commissions where id=$1 returning customer", [req.params.id]);
  if (!r.rowCount) throw new HttpError(404, "Commission not found");
  await audit(req.user!.name, "Deleted commission", r.rows[0].customer);
  res.status(204).end();
}));

/* ------------------------------------------------------------- recruitment */

const RECRUITMENT_JOB_COLS = `id,title,department,location,employment_type as "employmentType",description,requirements,status,
  created_by as "createdBy",created_at as "createdAt",updated_at as "updatedAt"`;
const RECRUITMENT_CANDIDATE_COLS = `c.id,c.job_id as "jobId",j.title as "jobTitle",c.name,c.email,c.phone,c.source,c.stage,c.notes,
  c.created_at as "createdAt",c.updated_at as "updatedAt"`;
const RECRUITMENT_INTERVIEW_COLS = `i.id,i.candidate_id as "candidateId",c.name as "candidateName",j.title as "jobTitle",
  i.interviewer,i.scheduled_at as "scheduledAt",i.meeting_type as "meetingType",i.status,i.notes,
  i.created_at as "createdAt",i.updated_at as "updatedAt"`;

app.get("/api/recruitment/jobs", requireRole("superadmin", "admin"), h(async (_req, res) => {
  const r = await pool.query(
    `select ${RECRUITMENT_JOB_COLS} from recruitment_jobs
     order by case status when 'open' then 0 when 'draft' then 1 else 2 end, created_at desc`,
  );
  res.json(r.rows);
}));

app.post("/api/recruitment/jobs", requireRole("superadmin", "admin"), h(async (req, res) => {
  const b = req.body ?? {};
  const title = requiredText(b.title, "title", 160);
  const department = requiredText(b.department, "department", 120);
  const location = requiredText(b.location, "location", 160);
  const employmentType = oneOf(b.employmentType, JOB_TYPES, "employmentType");
  const description = optionalText(b.description ?? "", "description");
  const requirements = optionalText(b.requirements ?? "", "requirements");
  const status = oneOf(b.status, JOB_STATUSES, "status");
  const r = await pool.query(
    `insert into recruitment_jobs(id,title,department,location,employment_type,description,requirements,status,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${RECRUITMENT_JOB_COLS}`,
    [randomUUID(), title, department, location, employmentType, description, requirements, status, req.user!.name],
  );
  await audit(req.user!.name, status === "open" ? "Posted recruitment role" : "Created recruitment role", title);
  res.status(201).json(r.rows[0]);
}));

app.patch("/api/recruitment/jobs/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const b = req.body ?? {};
  const title = requiredText(b.title, "title", 160);
  const department = requiredText(b.department, "department", 120);
  const location = requiredText(b.location, "location", 160);
  const employmentType = oneOf(b.employmentType, JOB_TYPES, "employmentType");
  const description = optionalText(b.description ?? "", "description");
  const requirements = optionalText(b.requirements ?? "", "requirements");
  const status = oneOf(b.status, JOB_STATUSES, "status");
  const r = await pool.query(
    `update recruitment_jobs set title=$1,department=$2,location=$3,employment_type=$4,description=$5,
       requirements=$6,status=$7,updated_at=now() where id=$8 returning ${RECRUITMENT_JOB_COLS}`,
    [title, department, location, employmentType, description, requirements, status, req.params.id],
  );
  if (!r.rowCount) throw new HttpError(404, "Recruitment role not found");
  await audit(req.user!.name, `Updated recruitment role (${status})`, title);
  res.json(r.rows[0]);
}));

app.get("/api/recruitment/candidates", requireRole("superadmin", "admin"), h(async (_req, res) => {
  const r = await pool.query(
    `select ${RECRUITMENT_CANDIDATE_COLS} from recruitment_candidates c
     join recruitment_jobs j on j.id=c.job_id order by c.created_at desc`,
  );
  res.json(r.rows);
}));

app.post("/api/recruitment/candidates", requireRole("superadmin", "admin"), h(async (req, res) => {
  const b = req.body ?? {};
  const jobId = requiredText(b.jobId, "jobId", 120);
  const job = await pool.query<{ title: string; status: string }>(
    "select title,status from recruitment_jobs where id=$1", [jobId],
  );
  if (!job.rowCount) throw new HttpError(404, "Recruitment role not found");
  if (job.rows[0].status !== "open") throw badRequest("Applicants can only be added to open roles");
  const name = requiredText(b.name, "name", 160);
  const email = requiredText(b.email, "email", 254).toLowerCase();
  if (!isEmail(email)) throw badRequest("Enter a valid candidate email address");
  const phone = optionalText(b.phone ?? "", "phone", 40);
  const source = optionalText(b.source ?? "", "source", 120);
  const notes = optionalText(b.notes ?? "", "notes");
  const id = randomUUID();
  await pool.query(
    `insert into recruitment_candidates(id,job_id,name,email,phone,source,stage,notes)
     values($1,$2,$3,$4,$5,$6,'applied',$7)`,
    [id, jobId, name, email, phone, source, notes],
  );
  await audit(req.user!.name, "Added recruitment candidate", `${name} — ${job.rows[0].title}`);
  const r = await pool.query(
    `select ${RECRUITMENT_CANDIDATE_COLS} from recruitment_candidates c
     join recruitment_jobs j on j.id=c.job_id where c.id=$1`,
    [id],
  );
  res.status(201).json(r.rows[0]);
}));

app.patch("/api/recruitment/candidates/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const b = req.body ?? {};
  if (b.stage === undefined && b.notes === undefined) throw badRequest("Provide a candidate stage or notes");
  const stage = b.stage === undefined ? null : oneOf(b.stage, CANDIDATE_STAGES, "stage");
  const notes = b.notes === undefined ? null : optionalText(b.notes, "notes");
  const changed = await pool.query<{ id: string }>(
    `update recruitment_candidates set stage=coalesce($1,stage),notes=coalesce($2,notes),updated_at=now()
     where id=$3 returning id`,
    [stage, notes, req.params.id],
  );
  if (!changed.rowCount) throw new HttpError(404, "Candidate not found");
  const r = await pool.query(
    `select ${RECRUITMENT_CANDIDATE_COLS} from recruitment_candidates c
     join recruitment_jobs j on j.id=c.job_id where c.id=$1`,
    [req.params.id],
  );
  await audit(req.user!.name, stage ? `Moved candidate to ${stage}` : "Updated candidate notes", r.rows[0].name);
  res.json(r.rows[0]);
}));

app.get("/api/recruitment/interviews", requireRole("superadmin", "admin"), h(async (_req, res) => {
  const r = await pool.query(
    `select ${RECRUITMENT_INTERVIEW_COLS} from recruitment_interviews i
     join recruitment_candidates c on c.id=i.candidate_id
     join recruitment_jobs j on j.id=c.job_id order by i.scheduled_at`,
  );
  res.json(r.rows);
}));

app.post("/api/recruitment/interviews", requireRole("superadmin", "admin"), h(async (req, res) => {
  const b = req.body ?? {};
  const candidateId = requiredText(b.candidateId, "candidateId", 120);
  const interviewer = requiredText(b.interviewer, "interviewer", 160);
  if (typeof b.scheduledAt !== "string" || !b.scheduledAt.trim() || Number.isNaN(Date.parse(b.scheduledAt)))
    throw badRequest("Choose a valid interview date and time");
  const meetingType = oneOf(b.meetingType, INTERVIEW_TYPES, "meetingType");
  const notes = optionalText(b.notes ?? "", "notes");
  const candidate = await pool.query<{ name: string; stage: string }>(
    "select name,stage from recruitment_candidates where id=$1", [candidateId],
  );
  if (!candidate.rowCount) throw new HttpError(404, "Candidate not found");
  if (candidate.rows[0].stage === "hired" || candidate.rows[0].stage === "rejected")
    throw badRequest("Interviews cannot be scheduled for a hired or rejected candidate");
  const id = randomUUID();
  await pool.query(
    `insert into recruitment_interviews(id,candidate_id,interviewer,scheduled_at,meeting_type,status,notes)
     values($1,$2,$3,$4,$5,'scheduled',$6)`,
    [id, candidateId, interviewer, new Date(b.scheduledAt).toISOString(), meetingType, notes],
  );
  await audit(req.user!.name, "Scheduled recruitment interview", candidate.rows[0].name);
  const r = await pool.query(
    `select ${RECRUITMENT_INTERVIEW_COLS} from recruitment_interviews i
     join recruitment_candidates c on c.id=i.candidate_id
     join recruitment_jobs j on j.id=c.job_id where i.id=$1`,
    [id],
  );
  res.status(201).json(r.rows[0]);
}));

app.patch("/api/recruitment/interviews/:id", requireRole("superadmin", "admin"), h(async (req, res) => {
  const b = req.body ?? {};
  const status = oneOf(b.status, INTERVIEW_STATUSES, "status");
  const notes = b.notes === undefined ? null : optionalText(b.notes, "notes");
  const changed = await pool.query<{ candidate_name: string }>(
    `update recruitment_interviews i set status=$1,notes=coalesce($2,i.notes),updated_at=now()
     from recruitment_candidates c where i.candidate_id=c.id and i.id=$3 returning c.name as candidate_name`,
    [status, notes, req.params.id],
  );
  if (!changed.rowCount) throw new HttpError(404, "Interview not found");
  await audit(req.user!.name, `Marked interview ${status}`, changed.rows[0].candidate_name);
  const r = await pool.query(
    `select ${RECRUITMENT_INTERVIEW_COLS} from recruitment_interviews i
     join recruitment_candidates c on c.id=i.candidate_id
     join recruitment_jobs j on j.id=c.job_id where i.id=$1`,
    [req.params.id],
  );
  res.json(r.rows[0]);
}));

/* -------------------------------------------------------------------- admin */

app.get("/api/admin/users", requireRole("superadmin", "admin"), h(async (_req, res) => {
  const r = await pool.query(`select id,name,email,role,employee_id as "employeeId",is_active as "isActive",${AVATAR_URL_SQL} as "avatarUrl" from users u order by name`);
  res.json(r.rows);
}));

app.patch("/api/admin/users/:id/active", requireRole("superadmin", "admin"), h(async (req, res) => {
  if (typeof req.body?.isActive !== "boolean") throw badRequest("isActive must be a boolean");
  const target = await pool.query<{ id: string; name: string; role: string }>(
    "select id,name,role from users where id=$1", [req.params.id],
  );
  const account = target.rows[0];
  if (!account) throw new HttpError(404, "User not found");
  if (account.id === req.user!.id) throw new HttpError(400, "You cannot deactivate your own account");
  if (account.role === "superadmin" || (req.user!.role !== "superadmin" && account.role !== "employee")) {
    throw new HttpError(403, "You do not have permission to change this account");
  }
  const updated = await pool.query(
    `update users set is_active=$1 where id=$2
       and role <> 'superadmin'
       and ($3::text = 'superadmin' or role = 'employee')
     returning is_active as "isActive"`,
    [req.body.isActive, account.id, req.user!.role],
  );
  if (!updated.rowCount) throw new HttpError(403, "You do not have permission to change this account");
  await audit(req.user!.name, req.body.isActive ? "Reactivated user account" : "Deactivated user account", `${account.name} (${account.role})`);
  res.json(updated.rows[0]);
}));

/* ---------------------------------------------------------- profile picture */

const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
await mkdir(AVATAR_DIR, { recursive: true });
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });

/** Trust the file's bytes, not its name or the browser's Content-Type. */
function imageType(b: Buffer): { mime: string; ext: string } | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: ".png" };
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: ".webp" };
  return null;
}

/** Everyone may change only their own picture. */
app.put("/api/me/avatar", avatarUpload.single("file"), h(async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest("Choose an image to upload");
  const type = imageType(file.buffer);
  if (!type) throw badRequest("Profile pictures must be JPG, PNG or WebP images");

  const stored = `${randomUUID()}${type.ext}`;
  await writeFile(path.join(AVATAR_DIR, stored), file.buffer);
  const prev = await pool.query<{ avatar_file: string | null }>("select avatar_file from users where id=$1", [req.user!.id]);
  try {
    await pool.query("update users set avatar_file=$1, avatar_type=$2, avatar_updated_at=now() where id=$3", [stored, type.mime, req.user!.id]);
  } catch (e) {
    await rm(path.join(AVATAR_DIR, stored), { force: true });
    throw e;
  }
  const old = prev.rows[0]?.avatar_file;
  if (old) await rm(path.join(AVATAR_DIR, path.basename(old)), { force: true });

  const r = await pool.query(`select ${AVATAR_URL_SQL} as "avatarUrl" from users u where id=$1`, [req.user!.id]);
  res.json(r.rows[0]);
}));

app.delete("/api/me/avatar", h(async (req, res) => {
  const prev = await pool.query<{ avatar_file: string | null }>(
    "update users u set avatar_file=null, avatar_type=null, avatar_updated_at=null from users old where u.id=old.id and u.id=$1 returning old.avatar_file",
    [req.user!.id],
  );
  const old = prev.rows[0]?.avatar_file;
  if (old) await rm(path.join(AVATAR_DIR, path.basename(old)), { force: true });
  res.status(204).end();
}));

/** Any signed-in colleague can see profile pictures (they appear in lists and the sidebar). */
app.get("/api/avatars/:userId", h(async (req, res) => {
  const r = await pool.query<{ avatar_file: string | null; avatar_type: string | null }>(
    "select avatar_file,avatar_type from users where id=$1", [req.params.userId],
  );
  const row = r.rows[0];
  if (!row?.avatar_file || !row.avatar_type) throw new HttpError(404, "No profile picture");
  res.set({
    "Content-Type": row.avatar_type,
    "X-Content-Type-Options": "nosniff",
    // URLs carry ?v=<upload time>, so a new upload gets a new URL.
    "Cache-Control": "private, max-age=86400",
  });
  res.sendFile(path.join(AVATAR_DIR, path.basename(row.avatar_file)), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Profile picture is missing on the server" });
  });
}));

app.patch("/api/admin/users/:id/role", requireRole("superadmin"), h(async (req, res) => {
  const role = oneOf(req.body?.role, ["superadmin", "admin", "employee"] as const, "role");
  // Prevents locking the system out by demoting the last superadmin (yourself).
  if (req.params.id === req.user!.id) throw new HttpError(403, "You cannot change your own role");
  const r = await pool.query("update users set role=$1 where id=$2 returning name", [role, req.params.id]);
  if (!r.rowCount) throw new HttpError(404, "User not found");
  await audit(req.user!.name, `Changed role to ${role}`, r.rows[0].name);
  res.status(204).end();
}));

app.get("/api/admin/audit", requireRole("superadmin"), h(async (_req, res) => {
  const r = await pool.query(`select id,at,actor,action,target from audit_entries order by at desc limit 500`);
  res.json(r.rows);
}));

/* ------------------------------------------------------------ notifications */

// Each user sees their own notifications plus company-wide ones (user_id null).
app.get("/api/notifications", h(async (req, res) => {
  const r = await pool.query(
    `select id,title,body,link,at,read from notices where user_id=$1 or user_id is null order by at desc limit 200`,
    [req.user!.id],
  );
  res.json(r.rows);
}));

app.post("/api/notifications/read-all", h(async (req, res) => {
  await pool.query("update notices set read=true where read=false and (user_id=$1 or user_id is null)", [req.user!.id]);
  res.status(204).end();
}));

/** Live event stream (Server-Sent Events). The browser reconnects on its own if it drops. */
app.get("/api/events", (req, res) => subscribe(req, res));

/* ------------------------------------------------------------------- errors */

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE"
      ? (_req.path.endsWith("/avatar") ? "Profile picture must be smaller than 2 MB" : "File is larger than 10 MB")
      : err.message });
  }
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  switch (err?.code) {
    case "23505": return res.status(409).json({ error: "A duplicate record already exists" });
    case "23503": return res.status(400).json({ error: "A referenced record does not exist" });
    case "23502": case "23514": case "22P02": case "22007": case "22008": case "22003":
      return res.status(400).json({ error: "Invalid input" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

/* -------------------------------------------------------------------- start */

await migrate();
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();
app.listen(env.port, () => console.log(`HR Pulse API listening on ${env.apiUrl} (port ${env.port})`));
