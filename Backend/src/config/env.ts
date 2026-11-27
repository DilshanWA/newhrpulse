export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  apiUrl: process.env.API_URL ?? "http://localhost:4000",
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "",
  /** Sent to OpenStreetMap's geocoder (used when there is no Google key) so they can contact you about heavy use. */
  geocoderContactEmail: process.env.GEOCODER_CONTACT_EMAIL?.trim() ?? "",
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID?.trim() || process.env.AZURE_AD_TENANT_ID?.trim() || "",
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID?.trim() || process.env.AZURE_AD_CLIENT_ID?.trim() || "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET?.trim() || process.env.AZURE_AD_CLIENT_SECRET?.trim() || "",
};

export const trustedFrontendOrigins = [
  env.frontendUrl,
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]),
];

export const ALLOWED_LOGIN_DOMAINS = [
  "studyingermany.lk",
  "german.lk",
  "germanexams.lk",
] as const;

export function isAllowedLoginEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  const domain = normalized.slice(at + 1);
  return (ALLOWED_LOGIN_DOMAINS as readonly string[]).includes(domain);
}
