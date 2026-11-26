import { env } from "../config/env.js";

/**
 * Turns GPS coordinates into a readable place name.
 * - Google Geocoding API when GOOGLE_MAPS_API_KEY is set (also returns a Google place id).
 * - Otherwise OpenStreetMap Nominatim (free, no key; max 1 request/second per its usage policy).
 * Coordinates are always saved by the caller, whatever happens here.
 */

export type ReverseGeocodeResult = {
  name?: string;
  placeId?: string;
  warning?: string;
  warningCode?: string;
};

const TIMEOUT_MS = 6000;
// ~11 m grid: clock-ins from the same office share one lookup.
const cache = new Map<string, ReverseGeocodeResult>();
const cacheKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = env.googleMapsApiKey ? await google(lat, lng) : await nominatim(lat, lng);
  if (result.name) {
    if (cache.size > 5000) cache.clear();
    cache.set(key, result);
  }
  return result;
}

async function getJson<T>(url: URL, headers?: Record<string, string>): Promise<{ ok: true; body: T } | { ok: false; code: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) return { ok: false, code: `http_${res.status}` };
    return { ok: true, body: (await res.json()) as T };
  } catch {
    return { ok: false, code: "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

const failed = (code: string): ReverseGeocodeResult => ({
  warning: code === "zero_results" || code === "empty_result"
    ? "No place name was found. GPS coordinates were saved."
    : `Place-name lookup failed (${code}). GPS coordinates were saved.`,
  warningCode: code,
});

/* ------------------------------------------------------------------ Google */

type GoogleResponse = { status?: string; results?: { formatted_address?: string; place_id?: string; types?: string[] }[] };

async function google(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", env.googleMapsApiKey);
  url.searchParams.set("language", "en");
  const r = await getJson<GoogleResponse>(url);
  if (!r.ok) return failed(r.code);
  if (r.body.status === "ZERO_RESULTS") return failed("zero_results");
  if (r.body.status !== "OK") return failed(r.body.status ?? "unknown");
  // The first result is sometimes a bare plus code; prefer a real address.
  const results = r.body.results ?? [];
  const best = results.find((x) => !x.types?.includes("plus_code")) ?? results[0];
  const name = best?.formatted_address?.trim();
  return name ? { name, placeId: best?.place_id } : failed("empty_result");
}

/* --------------------------------------------------------------- Nominatim */

type NominatimResponse = {
  error?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
};

let nextSlot = 0; // serialises requests to respect the 1 request/second limit

async function nominatim(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const wait = Math.max(0, nextSlot - Date.now());
  nextSlot = Math.max(Date.now(), nextSlot) + 1100;
  if (wait) await new Promise((r) => setTimeout(r, wait));

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  if (env.geocoderContactEmail) url.searchParams.set("email", env.geocoderContactEmail);
  const r = await getJson<NominatimResponse>(url, {
    "User-Agent": "HR-Pulse-Attendance/1.0",
    "Accept-Language": "en",
  });
  if (!r.ok) return failed(r.code);
  if (r.body.error) return failed("zero_results");
  const name = shortName(r.body);
  return name ? { name } : failed("empty_result");
}

/** "Lotus Tower, Lotus Road, Colombo 01, Colombo" rather than the full province/postcode/country chain. */
function shortName(b: NominatimResponse) {
  const a = b.address ?? {};
  const parts = [
    b.name,
    [a.house_number, a.road].filter(Boolean).join(" "),
    a.suburb ?? a.neighbourhood ?? a.quarter,
    a.city ?? a.town ?? a.village ?? a.county,
  ]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(", ") : b.display_name?.split(",").slice(0, 4).join(",").trim();
}
