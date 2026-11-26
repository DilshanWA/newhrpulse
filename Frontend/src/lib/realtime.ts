"use client";

/**
 * Live updates from the server.
 * - api mode: one shared EventSource on `${API_BASE}/events` (Server-Sent Events, session cookie).
 * - mock mode: a BroadcastChannel, so demo actions in one tab show up in the others.
 * Pages subscribe with `useRealtime` (hooks/useRealtime.ts).
 */
import { API_BASE, USE_MOCK } from "@/lib/http";

export type RealtimeEvent =
  /** Payload: the new Notice. */
  | "notification"
  /** Leave requests changed; re-fetch. */
  | "leave"
  /** Local only: notifications were marked read in this tab. */
  | "notifications-read";

type Handler = (data: unknown) => void;

const handlers = new Map<RealtimeEvent, Set<Handler>>();
const SERVER_EVENTS: RealtimeEvent[] = ["notification", "leave"];
let source: EventSource | null = null;
let channel: BroadcastChannel | null = null;

function dispatch(event: RealtimeEvent, data: unknown) {
  handlers.get(event)?.forEach((h) => {
    try {
      h(data);
    } catch (e) {
      console.error(`Realtime "${event}" handler failed`, e);
    }
  });
}

function connect() {
  if (typeof window === "undefined") return;
  if (USE_MOCK) {
    if (!channel && "BroadcastChannel" in window) {
      channel = new BroadcastChannel("hrpulse-realtime");
      channel.onmessage = (m) => dispatch(m.data.event, m.data.data);
    }
    return;
  }
  if (source) return;
  source = new EventSource(`${API_BASE}/events`, { withCredentials: true });
  for (const ev of SERVER_EVENTS) {
    source.addEventListener(ev, (m) => {
      let data: unknown = null;
      try {
        data = JSON.parse((m as MessageEvent).data);
      } catch {}
      dispatch(ev, data);
    });
  }
  // EventSource retries by itself. A 401/403 closes it for good, so try again later
  // (the session check in AppShell takes care of real sign-outs).
  source.onerror = () => {
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      setTimeout(() => handlers.size && connect(), 15_000);
    }
  };
}

function disconnect() {
  source?.close();
  source = null;
  channel?.close();
  channel = null;
}

export function subscribe(event: RealtimeEvent, h: Handler) {
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(h);
  connect();
  return () => {
    set!.delete(h);
    if (!set!.size) handlers.delete(event);
    if (!handlers.size) disconnect();
  };
}

/** Fire an event in this tab (and, in mock mode, in the other open tabs). */
export function emit(event: RealtimeEvent, data: unknown = {}, { localTab = true } = {}) {
  if (localTab) dispatch(event, data);
  if (USE_MOCK && event !== "notifications-read" && typeof window !== "undefined" && "BroadcastChannel" in window) {
    const c = new BroadcastChannel("hrpulse-realtime");
    c.postMessage({ event, data });
    c.close();
  }
}
