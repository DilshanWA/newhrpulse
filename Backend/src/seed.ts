import "dotenv/config";
import { randomUUID } from "node:crypto";
import { migrate, pool } from "./db.js";
import { isAllowedLoginEmail } from "./config/env.js";

await migrate();

const employees = [
  ["EMP-001", "Super Admin", "superadmin@studyingermany.lk", "+94 77 100 0001", "Management", "Director", "staff", "active", "2019-02-01", 450000, null],
  ["EMP-002", "Admin User", "admin@german.lk", "+94 77 100 0002", "Human Resources", "HR Manager", "staff", "active", "2020-06-15", 260000, null],
  ["EMP-003", "Employee User", "employee@germanexams.lk", "+94 77 100 0003", "Sales", "Sales Executive", "staff", "active", "2022-01-10", 150000, null],
  ["TCH-001", "Teacher User", "teacher@studyingermany.lk", "+94 77 200 0001", "Academics", "English Teacher", "teacher", "active", "2022-05-02", 0, 2500],
];

for (let i = 0; i < employees.length; i++) {
  const e = employees[i];
  const id = `e${i + 1}`;
  await pool.query(
    `insert into employees (id,code,name,email,phone,department,position,type,status,joined_on,base_salary,hourly_rate)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (id) do update set name=excluded.name,email=excluded.email`,
    [id, ...e],
  );
}

await pool.query(`insert into users (id,name,email,role,employee_id) values
  ($1,$2,$3,'superadmin',$4),
  ($5,$6,$7,'admin',$8),
  ($9,$10,$11,'employee',$12)
  on conflict (email) do update set name=excluded.name, role=excluded.role, employee_id=excluded.employee_id`,
  [
    randomUUID(), "Super Admin", "superadmin@studyingermany.lk", "e1",
    randomUUID(), "Admin User", "admin@german.lk", "e2",
    randomUUID(), "Employee User", "employee@germanexams.lk", "e3",
  ],
);

// Fixed ids so re-running the seed does not duplicate notices.
await pool.query(`insert into notices (id,title,body) values ($1,$2,$3),($4,$5,$6) on conflict (id) do nothing`,
  ["seed-notice-welcome", "Welcome to HR Pulse", "Your HR workspace is ready.",
   "seed-notice-db", "Database connected", "Production payroll data is managed through this API."],
);

// Bootstrap a real superadmin so someone can sign in with Microsoft and manage roles.
const bootstrap = process.env.SEED_SUPERADMIN_EMAIL?.trim().toLowerCase();
if (bootstrap) {
  if (!isAllowedLoginEmail(bootstrap)) {
    console.warn(`SEED_SUPERADMIN_EMAIL ${bootstrap} is not on an allowed login domain; skipped.`);
  } else {
    const emp = await pool.query("select id,name from employees where lower(email)=$1", [bootstrap]);
    await pool.query(
      `insert into users (id,name,email,role,employee_id) values ($1,$2,$3,'superadmin',$4)
       on conflict (email) do update set role='superadmin'`,
      [randomUUID(), emp.rows[0]?.name ?? bootstrap.split("@")[0], bootstrap, emp.rows[0]?.id ?? null],
    );
    console.log(`Superadmin access granted to ${bootstrap}.`);
  }
}

await pool.end();
console.log("Database seeded.");
