import "dotenv/config";
import { randomUUID } from "node:crypto";
import { isAllowedLoginEmail } from "./config/env.js";
import { migrate, pool } from "./db.js";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const name = process.argv[3]?.trim();
  if (!email || !name) {
    throw new Error('Usage: npm run bootstrap:admin -- "company@email" "Full Name"');
  }
  if (!isAllowedLoginEmail(email)) {
    throw new Error("Use an email from an authorized company domain.");
  }

  await migrate();
  const employee = await pool.query<{ id: string; status: string }>(
    "select id,status from employees where lower(email)=$1",
    [email],
  );
  if (employee.rows[0]?.status === "terminated") {
    throw new Error("This employee is terminated; refusing to create an administrator account.");
  }

  await pool.query(
    `insert into users(id,name,email,role,employee_id) values($1,$2,$3,'superadmin',$4)
     on conflict (email) do update set
       name=excluded.name,
       role='superadmin',
       employee_id=coalesce(users.employee_id,excluded.employee_id)`,
    [randomUUID(), name, email, employee.rows[0]?.id ?? null],
  );
  console.log("Super Admin account is ready. Sign in with this Microsoft email.");
  if (!employee.rows[0]) {
    console.log("To enable clock-in, add an Employer profile with the same email in HR Pulse.");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
