# HR Pulse API

Express + TypeScript + PostgreSQL backend for the HR Pulse frontend.

## Setup

1. Create a PostgreSQL database (for example, a Neon project) and copy its connection string.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to that connection string. Keep `.env` private.
3. Generate a high-entropy `BETTER_AUTH_SECRET` with at least 32 characters (for example, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`).
4. Create a Microsoft OAuth web application for Better Auth.
5. Configure a redirect URI:
   `http://localhost:4000/api/auth/callback/microsoft`
6. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and the organization's tenant GUID in `MICROSOFT_TENANT_ID`.
7. To send payslip emails, add the Microsoft Graph **Mail.Send** application permission to the Entra app and grant tenant admin consent. Set `MAIL_FROM_ADDRESS` to the sender mailbox's exact Entra UPN in that tenant (not an email alias).
8. To show readable attendance locations, enable the Google Geocoding API and set `GOOGLE_MAPS_API_KEY` in `Backend/.env`. Restrict this key to the Geocoding API and your backend's IP address.

```bash
npm install
npm run migrate
npm run dev
```

The API runs at `http://localhost:4000`. PostgreSQL is hosted by your configured database provider.
The server also applies the app and Better Auth migrations at startup, so they are never missing.

Payslip email uses Microsoft Graph with the app's client credentials and `MAIL_FROM_ADDRESS` (or the legacy `MAIL_FROM` address); SMTP is not used. The sender display name comes from the configured Microsoft 365 mailbox. If Graph returns `ErrorInvalidUser`, verify that this setting is the mailbox's exact Entra UPN and that it is in the app's tenant.

To load demo users and data into a development database, run:

```bash
npm run seed
```

Do not run the seed command against a production database.

## Who can sign in

1. The Microsoft account must be on an allowed domain (see `src/config/env.ts`).
2. It must match a row in `users` **or** an active (non-terminated) employee's email.
   Employees get an `employee` login automatically on first sign-in, so HR only
   needs to add them on the Employees page.
3. Terminated employees are refused. Roles are changed by a superadmin on Admin → Roles.

To bootstrap the first production administrator without adding demo records, build
the API and run this once using the production database:

```bash
npm run build
npm run bootstrap:admin -- "you@studyingermany.lk" "Your Full Name"
```

Use an address on an allowed company domain. This creates only the Super Admin
account; it does not seed demo employees, payroll, or attendance. On first sign-in,
the API automatically creates and links an active Employer profile for admin and
superadmin accounts so they can clock in. The profile starts with zero salary and
basic Administration details; update its employee/payroll information before
generating payroll.

After a failed sign-in (wrong domain, no HR account, cancelled consent) the user is
sent back to `FRONTEND_URL/login` with the reason shown.
Each Microsoft sign-in requests reauthentication, so an existing Microsoft browser
session cannot silently sign the user back into HR Pulse after logout. Signing out
of HR Pulse does not sign the user out of Microsoft in other apps.

## Frontend

In `Frontend/.env.local`:

```bash
NEXT_PUBLIC_DATA_SOURCE=api
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

Then run `npm run dev` in `Frontend`.

The API allows localhost ports 3000 and 3001 during development. In production,
set `NODE_ENV=production`, `FRONTEND_URL` to the exact HTTPS frontend origin, and
`API_URL` to the exact HTTPS API origin (both without a path or trailing slash).
Production startup fails if these origins are missing or not HTTPS.

When the frontend is deployed to Vercel using the same-origin `/api` proxy documented
in `Frontend/docs/DOCUMENTATION.md`, set both `FRONTEND_URL` and `API_URL` to the
exact Vercel frontend origin. Register
`<FRONTEND_URL>/api/auth/callback/microsoft` as the production Microsoft redirect
URI. The API itself must run on a persistent Node.js host: it starts a long-lived
Express listener and stores contract uploads on disk.

## Security

- Better Auth manages Microsoft OAuth sign-in and database-backed, httpOnly sessions. Sessions persist across browser restarts and refresh while in use; inactive sessions expire after 30 days. No Azure SDK or Azure-hosted authentication service is used; Microsoft app credentials are required for OAuth.
- Attendance stores device GPS coordinates, reported accuracy, and Google's exempt place ID. The readable address is returned for the immediate clock action and is not stored; if lookup fails, the record is still saved with coordinates.
- The backend maps the authenticated Microsoft email to an existing HR Pulse user and loads its role from PostgreSQL.
- Microsoft sign-in requests only the OpenID Connect scopes needed for sign-in. Payslip email separately uses app-only Microsoft Graph access with the `Mail.Send` application permission.
- API routes enforce roles and employee ownership server-side.
- Recruitment endpoints are limited to admins and superadmins. Open roles accept candidates, and role, candidate-stage and interview changes are recorded in the audit log.
- Contract uploads are limited to 10 MB and approved file extensions.
- Only Microsoft accounts ending in `studyingermany.lk`, `german.lk`, or `germanexams.lk` are accepted.
- Private contract files are stored outside the public frontend directory.
- Set `UPLOAD_DIR` to a persistent disk mount for production contract uploads; the default local `uploads` folder is not durable on ephemeral hosts.
- Leave limits, overlap checks, early clock-out reasons and payroll role checks are enforced by the API.

For production, use HTTPS, a strong stable `BETTER_AUTH_SECRET`, restricted CORS, database secrets,
and a production Microsoft OAuth redirect URI ending in `/api/auth/callback/microsoft`.
