"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@/domain/types";
import { clearClientSession, readClientSession, writeClientSession } from "@/lib/session";
import { services } from "@/services";
import { mockAvatar } from "@/services/mock";
import { ApiError, http, USE_MOCK } from "@/lib/http";

interface Ctx {
  user: User | null;
  ready: boolean;
  /** Why the current Microsoft session was refused (e.g. no HR Pulse account). */
  authError?: string;
  signIn: (demoUserId?: string) => Promise<User>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string>();

  const refresh = useCallback(async () => {
    if (USE_MOCK) {
      const u = readClientSession();
      setUser(u && { ...u, avatarUrl: mockAvatar(u.id) });
      setReady(true);
      return;
    }
    try {
      setUser(await http.get<User>("/auth/me"));
      setAuthError(undefined);
    } catch (e) {
      setUser(null);
      if (e instanceof ApiError && e.status === 403) {
        // Signed in with Microsoft, but not allowed into HR Pulse. End that session
        // so the next attempt can use a different account, and explain why.
        setAuthError(e.message);
        try {
          await services.auth.signOut();
        } catch {
          setAuthError(`${e.message} Sign-out failed; please try again.`);
        }
      } else if (e instanceof ApiError && e.status !== 401) {
        setAuthError(e.message);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (demoUserId?: string) => {
    setAuthError(undefined);
    const u = await services.auth.signInWithMicrosoft(demoUserId);
    if (USE_MOCK) {
      writeClientSession(u);
      setUser({ ...u, avatarUrl: mockAvatar(u.id) });
    }
    return u;
  }, []);

  const signOut = useCallback(async () => {
    await services.auth.signOut();
    if (USE_MOCK) clearClientSession();
    setUser(null);
    setAuthError(undefined);
  }, []);

  const value = useMemo(() => ({ user, ready, authError, signIn, signOut, refresh }), [user, ready, authError, signIn, signOut, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error("useSession must be used inside <SessionProvider>");
  return c;
}
