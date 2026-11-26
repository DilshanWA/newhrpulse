"use client";

import { useEffect, useRef } from "react";
import { subscribe, type RealtimeEvent } from "@/lib/realtime";

/** Calls `handler` whenever the server pushes `event`. The latest handler is always used. */
export function useRealtime(event: RealtimeEvent, handler: (data: unknown) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return subscribe(event, (d) => ref.current(d));
  }, [event, enabled]);
}
