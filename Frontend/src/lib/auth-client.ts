import { createAuthClient } from "better-auth/react";
import { API_BASE } from "@/lib/http";

export const authClient = createAuthClient({
  baseURL: new URL(API_BASE, typeof window === "undefined" ? "http://localhost" : window.location.origin).origin,
  basePath: "/api/auth",
});

/**
 * Starts Microsoft sign-in. The OAuth callback is handled by the API server, so
 * the URLs it redirects back to must be absolute frontend URLs: a relative
 * "/dashboard" would land on the API's origin.
 */
export async function startMicrosoftSignIn(next = "/dashboard") {
  const origin = window.location.origin;
  const { error } = await authClient.signIn.social({
    provider: "microsoft",
    callbackURL: `${origin}${next}`,
    errorCallbackURL: `${origin}/login`,
    additionalParams: { prompt: "login" },
  });
  if (error) throw new Error(error.message || "Could not start Microsoft sign-in.");
}
