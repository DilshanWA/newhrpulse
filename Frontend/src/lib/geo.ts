import type { GeoPoint } from "@/domain/types";

/** Stop early once the fix is this good (metres). */
const GOOD_ACCURACY_M = 30;
/** Longest we keep listening for a better fix. */
const MAX_WAIT_MS = 5_000;

/**
 * The device's real current position. The first GPS reading is often rough
 * (Wi-Fi or cell based), so we keep listening for a few seconds and use the
 * most accurate reading, never a cached one.
 */
export function getLocation(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }
    let best: GeolocationPosition | undefined;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve({ lat: best.coords.latitude, lng: best.coords.longitude, accuracy: Math.round(best.coords.accuracy) });
      else reject(new Error("Could not determine your location. Turn on GPS / location services and try again."));
    };

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
        if (p.coords.accuracy <= GOOD_ACCURACY_M) finish();
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          done = true;
          navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          reject(new Error("Location permission denied. Allow location access to clock in/out."));
        } else if (e.code !== e.TIMEOUT) finish();
      },
      { enableHighAccuracy: true, timeout: MAX_WAIT_MS, maximumAge: 0 },
    );
    const timer = setTimeout(finish, MAX_WAIT_MS);
  });
}

/** Opens Google Maps with a pin on the exact GPS point that was recorded. */
export const mapLink = (p?: GeoPoint) => (p ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : undefined);

export const coordsLabel = (p: GeoPoint) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

export const locationLabel = (p: GeoPoint) => p.name?.trim() || coordsLabel(p);
