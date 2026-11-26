# HR Pulse: Project Documentation

Next.js 15 · React 19 · TypeScript · Tailwind CSS. A front-end-complete HR system that runs on demo data and is built so a real backend can be connected without touching the UI.

---

## 1. Quick start

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

On the login page, choose a demo account and press **Sign in with Microsoft**:

| Role | Demo email | What it can do |
|---|---|---|
| Super Admin | superadmin@hrpulse.demo | Everything, plus roles and audit log |
| Admin | admin@hrpulse.demo | Employees, payroll, teacher pay, commissions, leave approval, users |
| Employee | dilshan@hrpulse.demo | Own dashboard, clock in/out, own attendance, own leave, own performance |

Demo data is stored in the browser's `localStorage`. To reset it, clear site data for localhost.

---

## 2. Features mapped to the requests

| Request | Where it lives |
|---|---|
| Upload employee **contracts** under employee details | `/employees/[id]`, `components/features/ContractsPanel.tsx` (type, validity dates, 10 MB limit, pdf/doc/docx/png/jpg) |
| Monthly **salary sheet**: salary, commission, allowance, deduction, auto-generated each month | `/payroll`. "Generate month" creates draft lines for all staff (basic salary from the profile, allowance and deduction carried from last month, commission pulled from **paid** SIG commissions in that month). Every figure is editable until the line is marked paid. Approve → Mark paid. CSV export. |
| **Teacher** pay sheet (replaces Excel) | `/teachers`: sessions, hours, rate, allowance, deduction, auto gross/net, monthly generation, CSV export |
| **SIG commissions**: 1st sale, 2nd sale, operation, per customer, with paid date | `/commissions`: one entry per customer and commission type, with deal date, **paid date**, pending/paid status, filter tabs, totals, CSV export |
| **My Payroll** tab for every employee | `/my-payroll`: latest net pay, year-to-date, base salary or hourly rate, commission paid/pending, month-by-month pay history, a payslip view per month, own SIG commissions, own contract documents, CSV download. Teachers see sessions/hours/rate. Drafts are hidden until an admin approves the month |
| **Leave policy**: 18 days per year, max 2 per month | `domain/policy.ts` (`LEAVE_POLICY`). Enforced on request in `/leave` with a live preview; balance cards for the employee, balance table for admins. See section 3a |
| **Early clock-out reason** | `ClockWidget.tsx` asks for a reason (min 5 chars) when clocking out before 17:00; saved on the record and shown in `/attendance`. See section 3a |
| **Attendance search** for admins | `/attendance`: search by name, code, department or email, plus date filter and "early clock-outs only" |
| Clock in / clock out with **location** | `components/features/ClockWidget.tsx` (browser Geolocation API). Coordinates saved on each record and shown as a map link in `/attendance` |
| Roles: **superadmin, admin, employee** | `domain/types.ts` (`can.*` rules), `middleware.ts` (server-side route gates), sidebar filtering |
| **Admin panel** in the same project | `/admin` (users), `/admin/roles` and `/admin/audit` (Super Admin only) |
| **Microsoft-only** login | `/login`; see section 6 for wiring real Microsoft Entra ID |
| Sidebar from your screenshot | `components/layout/Sidebar.tsx`, same sections (Overview, People, Finance, System), Leave badge, user footer with sign-out |

---

## 3. Architecture

Clean/hexagonal layering. Dependencies point inward only.

```
src/
├─ domain/            Pure types + business rules (salaryNet, teacherNet, can.*). No React, no I/O.
├─ services/          Ports and adapters
│   ├─ types.ts       Interfaces the UI depends on (EmployeeService, PayrollService, …)
│   ├─ mock.ts        Demo adapter (localStorage)
│   ├─ api.ts         REST adapter (fetch) ← connect your backend here
│   └─ index.ts       One switch: NEXT_PUBLIC_DATA_SOURCE=mock|api
├─ data/seed.ts       Dummy data (used only by mock.ts)
├─ lib/               http client, session cookie helpers, geo, formatting, store
├─ hooks/             useSession (auth context), useAsync (data loading)
├─ components/
│   ├─ ui/            Design-system primitives (Button, Card, Badge, Modal, Tabs, Table, Stat…)
│   ├─ layout/        AppShell, Sidebar, nav config (role-aware)
│   └─ features/      ClockWidget, ContractsPanel
├─ app/               Next.js routes (App Router)
│   ├─ login/         Public
│   ├─ (app)/         dashboard, employees, attendance, leave, performance, payroll, teachers, commissions, reports, notifications, settings
│   └─ admin/         users, roles, audit
└─ middleware.ts      Auth + role gate before any page renders
```

**Rule:** pages import `services` and `domain` only, never `mock.ts` or `fetch` directly. That is what makes the backend swap a one-file job.

---

## 3a. Business rules you can change

All in `src/domain/policy.ts`. Change a number there and the whole UI follows.

**Leave** (`LEAVE_POLICY`)
- 18 leave days per calendar year; no more than 2 days in any one month.
- Days are counted on **working days (Mon-Fri)**. A request spanning a month end is split per month, so Fri 30 Jan to Mon 2 Feb counts 1 day in January and 1 in February.
- **Annual, Sick and Casual** all use the same 18-day balance. **Unpaid** does not use it. Edit `countedTypes` if sick leave should be separate.
- **Pending and approved** requests use the balance; rejecting a request gives the days back.
- Overlapping requests are refused.
- Assumption to confirm: "18 annual and 2 per month" is read as a yearly total of 18 with a cap of 2 per month (so the cap is stricter than 18/12). If you meant 18 annual leave **plus** 2 extra days every month, change `monthlyLimit` and the check in `validateLeave`.

**Early clock-out** (`WORK_POLICY.shiftEnd = "17:00"`)
- Clocking out before the shift end opens a dialog asking for a reason (quick-pick chips or free text, at least 5 characters). Clock-out is blocked until a reason is given.
- The reason is stored in `earlyReason` on the attendance record and appears in the admin attendance table with an "Early" tag.
- The check uses the **browser's local time**. Your backend should repeat it using the company time zone and reject an early clock-out with no reason (the mock service already does).

**Backend must enforce both rules.** The UI check is for fast feedback only; a user can bypass it. Reuse the same logic from `policy.ts` on the server if it is a Node/TypeScript backend.

---

## 4. Connecting your backend

1. In `.env.local` set:
   ```
   NEXT_PUBLIC_DATA_SOURCE=api
   NEXT_PUBLIC_API_URL=https://your-backend/api
   ```
2. `src/services/api.ts` already maps every service method to an endpoint. Adjust paths or payloads to match your backend.

| Area | Endpoints expected by `api.ts` |
|---|---|
| Auth | Better Auth handles `/auth/*`; `GET /auth/me` returns the HR Pulse user |
| Employees | `GET/POST /employees`, `GET/PATCH /employees/:id` |
| Contracts | `GET/POST /employees/:id/contracts` (multipart), `DELETE /contracts/:id` |
| Attendance | `GET /attendance?employeeId=`, `GET /attendance/today?employeeId=`, `POST /attendance/clock-in`, `POST /attendance/clock-out` (body: employeeId, lat, lng, accuracy, earlyReason) |
| Leave | `GET/POST /leave`, `PATCH /leave/:id` (status) |
| Performance | `GET /performance` |
| My pay (self-service) | `GET /payroll/me/salary`, `GET /payroll/me/teachers`, `GET /commissions/me`. The backend **must take the employee from the session**, never from a request parameter, and return only approved/paid months |
| Salary | `GET /payroll/salary?month=YYYY-MM`, `POST /payroll/salary/generate`, `PUT /payroll/salary/:id` |
| Teacher pay | `GET /payroll/teachers?month=`, `POST /payroll/teachers/generate`, `PUT /payroll/teachers/:id` |
| Commissions | `GET/POST /commissions`, `PATCH /commissions/:id/paid`, `DELETE /commissions/:id` |
| Admin | `GET /admin/users`, `PATCH /admin/users/:id/role`, `GET /admin/audit` |
| Notifications | `GET /notifications`, `POST /notifications/read-all` |

Request/response shapes are the TypeScript interfaces in `src/domain/types.ts`. The HTTP client sends cookies (`credentials: "include"`), so use an httpOnly session cookie from your backend.

**Salary generation** is implemented in `mock.ts` (`generateSalary`) as a reference for the rule your backend should apply. It should be idempotent: running it twice must not duplicate lines.

When finished, delete `src/data/seed.ts`, `src/services/mock.ts`, `src/lib/store.ts`.

---

## 5. Security: what is real and what is demo

Be clear about this before going live.

| Item | Status |
|---|---|
| Route protection and role gates | Demo mode uses the frontend middleware and demo cookie; API mode enforces authentication and roles on the backend |
| Session cookie (`hrp_session`) | **Demo only.** It is unsigned JSON set from the browser, so anyone could forge it. API mode uses Better Auth's httpOnly session cookie (section 6) |
| Microsoft login | Mock mode picks a demo user; API mode uses Better Auth with Microsoft Entra ID (section 6) |
| Security headers (`next.config.mjs`) | Real: frame denial, nosniff, referrer policy, geolocation permissions |
| Data access control | **Must be enforced on the backend.** UI hiding is convenience, not security. Every API endpoint must check the caller's role (for example employees may only read their own records) |
| Contract files | Mock stores metadata only. In production store files in private object storage and serve short-lived signed URLs, with server-side file type and size validation and virus scanning |
| Audit log | Mock writes entries for a few actions. Backend should log all payroll, role and contract changes |
| Location tracking | Uses browser permission and is captured only at clock in/out. Check local privacy rules and tell employees what is collected |

---

## 6. Microsoft sign-in with Better Auth

The Express backend hosts Better Auth at `/api/auth/*`. Better Auth handles the Microsoft Entra OAuth flow and database-backed session; the backend maps the authenticated email to an existing HR Pulse user and loads that user's role from PostgreSQL.

1. Create a Microsoft OAuth web application and add this **Web** redirect URI:
   `http://localhost:4000/api/auth/callback/microsoft`
2. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and the organization's `MICROSOFT_TENANT_ID` in `Backend/.env`.
3. Generate a high-entropy `BETTER_AUTH_SECRET` of at least 32 characters and set it in `Backend/.env`.
4. Run `npm run migrate` in `Backend` to create the HR Pulse and Better Auth tables.
5. Set `NEXT_PUBLIC_DATA_SOURCE=api` and `NEXT_PUBLIC_API_URL=http://localhost:4000/api` in `Frontend/.env.local`.
6. Start the backend and frontend. Sign in from `/login` with an allowed Microsoft account that already exists in the HR Pulse `users` table.

The provider requests only `openid`, `profile`, and `email`; Graph profile-photo access is disabled. Your tenant's consent policy may still require an administrator to approve the app.

---

## 7. Design system and UI

- Dark navy theme with a teal brand colour (matches your sidebar screenshot) and a violet accent. Tokens are in `tailwind.config.ts` (`ink`, `brand`, `accent`).
- Login page: split layout with animated gradient orbs, grid texture, feature highlights and a Microsoft button.
- Responsive: sidebar collapses to a drawer below `lg`.
- Accessible basics: labels on inputs, `aria-label` on icon buttons, dialog role on modals, visible focus rings.

### Astryx (astryx.atmeta.com): not integrated yet
Astryx is an open-source Meta design system (React 19+, StyleX, 190+ components, beta). **This project does not use it.** The environment that generated this project could not install packages or run a build, and Astryx's public component pages do not show their props or import paths. Rewriting every screen against guessed APIs risked a project that does not compile, so the UI uses its own Tailwind components in `src/components/ui/`.

What the Astryx docs say you need (from https://astryx.atmeta.com/docs/getting-started):
1. `npm install @astryxdesign/core @stylexjs/stylex @astryxdesign/theme-neutral @astryxdesign/cli`
2. Add `@import '@astryxdesign/core/reset.css'; @import '@astryxdesign/core/astryx.css';` to global CSS.
3. `npx @astryxdesign/cli theme add neutral` to generate `astryx-themes`, then wrap the app root in `<Theme theme={themes[defaultThemeSlug]}>`.
4. StyleX needs its own Next.js/Babel setup (see the StyleX docs and Astryx's `example-nextjs-stylex` and `example-nextjs-tailwind` examples).
5. **Tailwind coexistence needs cascade-layer ordering.** Astryx styles load in layers (`reset`, `astryx-base`), and unlayered or later-layer styles beat them. Run `npx @astryxdesign/cli docs migration/migration-setup` and follow it before building screens.
6. Component usage example from the docs: `import {Button} from '@astryxdesign/core/Button'` with `<Button label="..." onClick={...} />`. Check each component's page (Dialog, Table, Tab, Badge, Avatar) for its API.

Suggested path: do steps 1-5 on a branch, then replace components in `src/components/ui/index.tsx` one at a time (Button, Badge, Avatar, Spinner, Modal first). Pages import only from `@/components/ui`, so they stay unchanged as long as the wrapper keeps its props. The Astryx CLI also installs agent docs (`npx @astryxdesign/cli init`), which let an AI assistant do this migration reliably on your machine.

---

## 8. Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

---

## 9. Known limitations and next steps

- **Not compiled or run in the generation environment** (no network for `npm install`). Only `src/domain/policy.ts` was executed and tested (leave caps, month splits, overlap, early clock-out). Run `npm install && npm run typecheck && npm run build` first; small type fixes are possible.
- Performance reviews are read-only demo data; there is no review form yet.
- No pagination, server-side search or tests yet. Add them when real data volume is known.
- Payslip PDF generation, bank payment files, tax/EPF/ETF calculations and email notifications are not included.
- Teacher pay uses sessions × hours × rate. If your Excel sheet has other columns, add them to `TeacherPayLine` in `domain/types.ts` and to `teachers/page.tsx`.
- Commission rules (percentages, who earns what) are entered manually per entry. If you want auto-calculation from deal value, add a rule table to the domain layer.
- Currency is LKR; change in `lib/utils.ts` (`money`).
