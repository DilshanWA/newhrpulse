import { betterAuth } from "better-auth";
import { env, isAllowedLoginEmail, trustedFrontendOrigins } from "./config/env.js";
import { pool } from "./db.js";
import { resolveAppUser } from "./services/user.service.js";

const missing = [
  !env.betterAuthSecret && "BETTER_AUTH_SECRET",
  !env.microsoftClientId && "MICROSOFT_CLIENT_ID",
  !env.microsoftClientSecret && "MICROSOFT_CLIENT_SECRET",
  !env.microsoftTenantId && "MICROSOFT_TENANT_ID",
  process.env.NODE_ENV === "production" && !process.env.FRONTEND_URL && "FRONTEND_URL",
  process.env.NODE_ENV === "production" && !process.env.API_URL && "API_URL",
].filter((value): value is string => Boolean(value));

if (missing.length) {
  throw new Error(`Missing required authentication configuration: ${missing.join(", ")}`);
}

if (env.betterAuthSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long");
}

if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(env.microsoftTenantId)) {
  throw new Error("MICROSOFT_TENANT_ID must be a valid Microsoft Entra tenant GUID");
}

if (process.env.NODE_ENV === "production") {
  for (const [name, value] of [["FRONTEND_URL", env.frontendUrl], ["API_URL", env.apiUrl]]) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${name} must be an absolute HTTPS origin in production`);
    }
    if (url.protocol !== "https:" || url.origin !== value) {
      throw new Error(`${name} must be an HTTPS origin without a path or trailing slash in production`);
    }
  }
}

export const auth = betterAuth({
  appName: "HR Pulse",
  baseURL: env.apiUrl,
  basePath: "/api/auth",
  secret: env.betterAuthSecret,
  trustedOrigins: trustedFrontendOrigins,
  database: pool,
  // OAuth failures (wrong domain, no HR account, cancelled consent) go back to the
  // frontend login page with ?error=...&error_description=... instead of the API.
  onAPIError: { errorURL: `${env.frontendUrl}/login` },
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  user: {
    validateUserInfo: async ({ user, source }) => {
      if (source.oauth?.providerId !== "microsoft") return;

      const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
      if (!isAllowedLoginEmail(email)) {
        return {
          error: "email_not_allowed",
          errorDescription: "Use an authorised company Microsoft account.",
        };
      }

      const account = await resolveAppUser(email);
      if (!account.ok) return { error: account.code, errorDescription: account.message };
    },
  },
  socialProviders: {
    microsoft: {
      clientId: env.microsoftClientId,
      clientSecret: env.microsoftClientSecret,
      tenantId: env.microsoftTenantId,
      disableDefaultScope: true,
      scope: ["openid", "profile", "email"],
      disableProfilePhoto: true,
      mapProfileToUser: (profile) => {
        const email = profile.email ?? profile.preferred_username ?? profile.upn;
        return {
          email,
          name: profile.name ?? email ?? "Microsoft user",
        };
      },
    },
  },
});
