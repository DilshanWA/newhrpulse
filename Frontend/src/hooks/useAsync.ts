"use client";

import { useCallback, useEffect, useState } from "react";
import { messageOf, reportError } from "@/lib/errors";

/**
 * Minimal data hook: runs a service call, exposes data/loading/reload.
 * `refresh` re-fetches without showing the loading state (for live updates).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const run = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await fn());
      setError(undefined);
    } catch (e) {
      setError(messageOf(e));
      reportError(e); // pages don't render `error`; surface it in the app-wide banner
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  const reload = useCallback(() => run(), [run]);
  const refresh = useCallback(() => run(true), [run]);

  return { data, setData, loading, error, reload, refresh };
}
