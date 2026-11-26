import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import type { AuthenticatedUser } from "../types.js";

/** SQL for a users row aliased `u`: its profile picture path (API-relative), or null. */
export const AVATAR_URL_SQL =
  "case when u.avatar_file is null then null else '/avatars/' || u.id || '?v=' || floor(extract(epoch from u.avatar_updated_at))::bigint end";

export type ResolveResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; code: "hr_account_not_found" | "account_disabled"; message: string };

/**
 * Maps a verified Microsoft email to an HR Pulse account.
 * - An existing `users` row wins (its role is the source of truth).
 * - Otherwise, an active employee with that email gets an `employee` account
 *   automatically, so HR only has to add the person on the Employees page.
 * - People whose employee record is terminated are refused.
 */
export async function resolveAppUser(rawEmail: string): Promise<ResolveResult> {
  const email = rawEmail.trim().toLowerCase();
  const loadUser = () => pool.query(
    `select u.id, u.name, u.email, u.role, u.employee_id, u.is_active, e.status as employee_status,
            ${AVATAR_URL_SQL} as avatar_url
       from users u left join employees e on e.id = u.employee_id
      where lower(u.email) = $1`,
    [email],
  );

  let r = await loadUser();

  if (!r.rowCount) {
    const emp = await pool.query(
      "select id, name, email from employees where lower(email) = $1 and status <> 'terminated'",
      [email],
    );
    if (!emp.rowCount) {
      return { ok: false, code: "hr_account_not_found", message: "No HR Pulse account exists for this Microsoft account. Ask HR to add you." };
    }
    const e = emp.rows[0];
    await pool.query(
      `insert into users (id, name, email, role, employee_id) values ($1, $2, $3, 'employee', $4)
       on conflict (email) do nothing`,
      [randomUUID(), e.name, e.email.toLowerCase(), e.id],
    );
    r = await loadUser();
  }

  let row = r.rows[0];
  if (!row) {
    return { ok: false, code: "hr_account_not_found", message: "No HR Pulse account exists for this Microsoft account. Ask HR to add you." };
  }
  if (!row.is_active) {
    return { ok: false, code: "account_disabled", message: "This HR Pulse account has been disabled." };
  }
  if (row.employee_status === "terminated") {
    return { ok: false, code: "account_disabled", message: "This HR Pulse account has been disabled." };
  }

  if (!row.employee_status) {
    const employee = await pool.query<{ id: string; status: string }>(
      "select id,status from employees where lower(email)=$1",
      [email],
    );
    if (employee.rows[0]?.status === "terminated") {
      return { ok: false, code: "account_disabled", message: "This HR Pulse account has been disabled." };
    }
    if (employee.rows[0]) {
      await pool.query("update users set employee_id=$1 where id=$2", [employee.rows[0].id, row.id]);
      r = await loadUser();
      row = r.rows[0];
    } else if (row.employee_id) {
      await pool.query("update users set employee_id=null where id=$1", [row.id]);
      row.employee_id = null;
    }
  }

  if ((row.role === "admin" || row.role === "superadmin") && !row.employee_id) {
    const employeeId = randomUUID();
    await pool.query(
      `insert into employees (id,code,name,email,department,position,type,status,joined_on,base_salary)
       values ($1,$2,$3,$4,'Administration',$5,'staff','active',CURRENT_DATE,0)
       on conflict (email) do nothing`,
      [
        employeeId,
        `EMP-${employeeId.slice(0, 8).toUpperCase()}`,
        row.name || row.email.split("@")[0],
        email,
        row.role === "superadmin" ? "Super Admin" : "Admin",
      ],
    );
    const employee = await pool.query<{ id: string; status: string }>(
      "select id,status from employees where lower(email)=$1",
      [email],
    );
    if (employee.rows[0]?.status === "terminated") {
      return { ok: false, code: "account_disabled", message: "This HR Pulse account has been disabled." };
    }
    if (employee.rows[0]) {
      await pool.query(
        "update users set employee_id=$1 where id=$2 and employee_id is null",
        [employee.rows[0].id, row.id],
      );
      r = await loadUser();
      row = r.rows[0];
    }
  }

  return {
    ok: true,
    user: {
      id: row.id, name: row.name, email: row.email, role: row.role,
      employeeId: row.employee_id ?? undefined, avatarUrl: row.avatar_url ?? null,
    },
  };
}
