"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DEMO_USERS } from "@/data/seed";
import { startMicrosoftSignIn } from "@/lib/auth-client";
import { safeNext } from "@/lib/access";
import { useSession } from "@/hooks/useSession";
import { USE_MOCK } from "@/lib/http";
import { cn } from "@/lib/utils";

const MsLogo = () => (
  <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden>
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

/** Friendly text for errors Better Auth appends to /login after a failed OAuth round trip. */
const OAUTH_ERRORS: Record<string, string> = {
  email_not_allowed: "Use your company Microsoft account (studyingermany.lk, german.lk or germanexams.lk).",
  hr_account_not_found: "No HR Pulse account exists for this Microsoft account. Ask HR to add you.",
  account_disabled: "This HR Pulse account has been disabled.",
  access_denied: "Microsoft sign-in was cancelled.",
  state_mismatch: "Your sign-in session expired. Please try again.",
  state_not_found: "Your sign-in session expired. Please try again.",
};

function LoginForm() {
  const { user, ready, authError, signIn } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [oauthError, setOauthError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [demoId, setDemoId] = useState(DEMO_USERS[0]?.id ?? "");
  const [localError, setError] = useState<string>();
  const error = localError ?? authError ?? oauthError;

  useEffect(() => {
    const oauthCode = params.get("error");
    if (!oauthCode) return;

    setOauthError(
      OAUTH_ERRORS[oauthCode] ?? params.get("error_description") ?? "Microsoft sign-in failed. Please try again.",
    );
    const cleanParams = new URLSearchParams(params.toString());
    cleanParams.delete("error");
    cleanParams.delete("error_description");
    const query = cleanParams.toString();
    router.replace(query ? `/login?${query}` : "/login", { scroll: false });
  }, [params, router]);

  // Already signed in (e.g. back button after login): go straight in.
  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  async function go() {
    setBusy("ms");
    setError(undefined);
    setOauthError(undefined);

    if (!USE_MOCK) {
      try {
        await startMicrosoftSignIn(next); // navigates away to Microsoft on success
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed.");
        setBusy(null);
      }
      return;
    }

    try {
      await signIn(demoId);
      router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setBusy(null);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-100/60 blur-[100px]" />
      </div>
      <div className="card relative w-full max-w-md p-8 shadow-xl animate-fade-up">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/logo-deep-royal-blue.svg" alt="" width={40} height={40} priority />
          <span className="text-lg font-semibold text-white">HR Pulse</span>
        </div>

        <h2 className="text-2xl font-semibold text-white">Sign in</h2>
        <p className="mt-1 text-sm text-slate-400">Use your company Microsoft account to continue.</p>

        <button
          onClick={go}
          disabled={busy !== null}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-70"
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-slate-900" /> : <MsLogo />}
          {busy ? "Signing in…" : "Sign in with Microsoft"}
        </button>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {USE_MOCK && (
          <div className="mt-8 rounded-xl border border-dashed border-brand-500/30 bg-brand-500/[0.05] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">Demo mode · choose an account</p>
            <div className="mt-3 space-y-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setDemoId(u.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition",
                    demoId === u.id ? "border-brand-500/60 bg-brand-500/10 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span>
                    <span className="block font-medium">{u.title}</span>
                    <span className="block text-xs text-slate-400">{u.email}</span>
                  </span>
                  <span className={cn("h-3.5 w-3.5 rounded-full border-2", demoId === u.id ? "border-brand-400 bg-brand-400" : "border-slate-500")} />
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Access is limited to authorised company accounts. Activity is logged.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
