import "dotenv/config";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
}

// node-pg turns DATE into a JS Date (shifted by the server timezone) and NUMERIC/BIGINT
// into strings. The API contract uses "YYYY-MM-DD" strings and plain numbers.
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v: string) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Today's date in the company's timezone (the DB server usually runs in UTC). */
export const TODAY_SQL = "(now() at time zone 'Asia/Colombo')::date";

export async function migrate() {
  await pool.query(`
    create table if not exists users (
      id text primary key,
      name text not null,
      email text unique not null,
      role text not null check (role in ('superadmin','admin','employee')),
      employee_id text,
      created_at timestamptz not null default now()
    );
    create table if not exists employees (
      id text primary key,
      code text unique not null,
      name text not null,
      email text unique not null,
      phone text not null default '',
      department text not null default '',
      position text not null default '',
      type text not null check (type in ('staff','teacher')),
      status text not null check (status in ('active','on_leave','terminated')),
      joined_on date not null,
      base_salary numeric(12,2) not null default 0,
      hourly_rate numeric(12,2)
    );
    create table if not exists contracts (
      id text primary key,
      employee_id text not null references employees(id) on delete cascade,
      kind text not null,
      file_name text not null,
      file_size integer not null,
      stored_name text not null,
      uploaded_at timestamptz not null default now(),
      uploaded_by text not null,
      valid_from date,
      valid_to date
    );
    create table if not exists attendance (
      id text primary key,
      employee_id text not null references employees(id) on delete cascade,
      date date not null,
      clock_in timestamptz,
      clock_out timestamptz,
      in_lat double precision,
      in_lng double precision,
      in_accuracy double precision,
      in_place_id text,
      out_lat double precision,
      out_lng double precision,
      out_accuracy double precision,
      out_place_id text,
      early_reason text,
      unique(employee_id, date)
    );
    alter table attendance add column if not exists in_place_id text;
    alter table attendance add column if not exists out_place_id text;
    alter table attendance add column if not exists in_place_name text;
    alter table attendance add column if not exists out_place_name text;
    create table if not exists leave_requests (
      id text primary key,
      employee_id text not null references employees(id) on delete cascade,
      type text not null,
      from_date date not null,
      to_date date not null,
      reason text not null default '',
      status text not null check (status in ('pending','approved','rejected'))
    );
    create table if not exists performance (
      id text primary key,
      employee_id text not null references employees(id) on delete cascade,
      period text not null,
      score integer not null,
      goals_done integer not null,
      goals_total integer not null,
      note text not null default ''
    );
    create table if not exists salary_lines (
      id text primary key,
      month text not null,
      employee_id text not null references employees(id) on delete cascade,
      basic numeric(12,2) not null,
      allowance numeric(12,2) not null default 0,
      commission numeric(12,2) not null default 0,
      deduction numeric(12,2) not null default 0,
      note text,
      status text not null check (status in ('draft','approved','paid')),
      unique(month, employee_id)
    );
    create table if not exists teacher_pay_lines (
      id text primary key,
      month text not null,
      employee_id text not null references employees(id) on delete cascade,
      sessions integer not null default 0,
      hours numeric(10,2) not null default 0,
      rate numeric(12,2) not null default 0,
      allowance numeric(12,2) not null default 0,
      deduction numeric(12,2) not null default 0,
      status text not null check (status in ('draft','approved','paid')),
      unique(month, employee_id)
    );
    create table if not exists commissions (
      id text primary key,
      customer text not null,
      employee_id text not null references employees(id) on delete cascade,
      kind text not null,
      amount numeric(12,2) not null,
      deal_date date not null,
      paid_date date,
      status text not null check (status in ('pending','paid')),
      note text
    );
    create table if not exists audit_entries (
      id text primary key,
      at timestamptz not null default now(),
      actor text not null,
      action text not null,
      target text not null
    );
    create table if not exists recruitment_jobs (
      id text primary key,
      title text not null,
      department text not null,
      location text not null,
      employment_type text not null check (employment_type in ('full_time','part_time','contract','internship')),
      description text not null default '',
      requirements text not null default '',
      status text not null check (status in ('draft','open','closed')),
      created_by text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists recruitment_candidates (
      id text primary key,
      job_id text not null references recruitment_jobs(id),
      name text not null,
      email text not null,
      phone text not null default '',
      source text not null default '',
      stage text not null check (stage in ('applied','screening','interview','offer','hired','rejected')),
      notes text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists recruitment_interviews (
      id text primary key,
      candidate_id text not null references recruitment_candidates(id) on delete cascade,
      interviewer text not null,
      scheduled_at timestamptz not null,
      meeting_type text not null check (meeting_type in ('video','phone','onsite')),
      status text not null check (status in ('scheduled','completed','cancelled')),
      notes text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index if not exists recruitment_candidate_job_email_idx on recruitment_candidates(job_id, lower(email));
    create index if not exists recruitment_jobs_status_idx on recruitment_jobs(status, created_at desc);
    create index if not exists recruitment_candidates_job_idx on recruitment_candidates(job_id, created_at desc);
    create index if not exists recruitment_interviews_scheduled_idx on recruitment_interviews(scheduled_at);
    create index if not exists attendance_employee_idx on attendance(employee_id, date);
    create index if not exists leave_employee_idx on leave_requests(employee_id);
    create index if not exists users_email_lower_idx on users(lower(email));
    create index if not exists employees_email_lower_idx on employees(lower(email));
    create table if not exists notices (
      id text primary key,
      title text not null,
      body text not null,
      at timestamptz not null default now(),
      read boolean not null default false
    );
    -- When the payslip was last emailed to the employee.
    alter table salary_lines add column if not exists emailed_at timestamptz;
    alter table teacher_pay_lines add column if not exists emailed_at timestamptz;
    -- Profile picture: file in UPLOAD_DIR/avatars, version = upload time (busts browser caches).
    alter table users add column if not exists avatar_file text;
    alter table users add column if not exists avatar_type text;
    alter table users add column if not exists avatar_updated_at timestamptz;
    alter table users add column if not exists is_active boolean not null default true;
    -- user_id null = shown to everyone; otherwise only to that login.
    alter table notices add column if not exists user_id text references users(id) on delete cascade;
    alter table notices add column if not exists link text;
    create index if not exists notices_user_idx on notices(user_id, at desc);
  `);
}
