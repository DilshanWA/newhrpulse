/**
 * Tiny localStorage-backed store used ONLY by the mock data source.
 * Delete this file (and src/services/mock/*) once a real backend is connected.
 */
export function createStore<T>(key: string, seed: () => T[]) {
  const k = `hrpulse:${key}`;
  const read = (): T[] => {
    if (typeof window === "undefined") return seed();
    try {
      const raw = window.localStorage.getItem(k);
      if (raw) return JSON.parse(raw) as T[];
    } catch {}
    const s = seed();
    try {
      window.localStorage.setItem(k, JSON.stringify(s));
    } catch {}
    return s;
  };
  const write = (rows: T[]) => {
    try {
      window.localStorage.setItem(k, JSON.stringify(rows));
    } catch {}
  };
  return { read, write };
}
