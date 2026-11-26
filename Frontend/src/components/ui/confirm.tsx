"use client";

import { AlertTriangle, Info, Loader2, LogOut, Trash2, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, Modal } from "./index";

type Tone = "danger" | "warning" | "info";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  icon?: "logout" | "delete";
  /**
   * Optional work to run while the dialog stays open with a spinner.
   * If it throws, the error is shown in the dialog and the user can retry or cancel.
   */
  action?: () => Promise<unknown>;
}

type Confirm = (o: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

const TONE: Record<Tone, { icon: LucideIcon; ring: string; button: "danger" | "primary" }> = {
  danger: { icon: AlertTriangle, ring: "bg-rose-50 text-rose-600 ring-rose-100", button: "danger" },
  warning: { icon: AlertTriangle, ring: "bg-amber-50 text-amber-600 ring-amber-100", button: "primary" },
  info: { icon: Info, ring: "bg-brand-50 text-brand-600 ring-brand-100", button: "primary" },
};
const ICONS: Record<NonNullable<ConfirmOptions["icon"]>, LucideIcon> = { logout: LogOut, delete: Trash2 };

/**
 * Usage:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete this?", tone: "danger" }))) return;
 */
export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const resolver = useRef<((ok: boolean) => void) | undefined>(undefined);

  const confirm = useCallback<Confirm>((o) => {
    resolver.current?.(false); // a new prompt cancels any open one
    setError(undefined);
    setBusy(false);
    setOpts(o);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = undefined;
    setOpts(null);
    setBusy(false);
  };

  async function onConfirm() {
    if (!opts?.action) return finish(true);
    setBusy(true);
    setError(undefined);
    try {
      await opts.action();
      finish(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const tone = TONE[opts?.tone ?? "info"];
  const Icon = opts?.icon ? ICONS[opts.icon] : tone.icon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onClose={() => !busy && finish(false)} title={opts?.title ?? ""} size="sm" dismissible={!busy} hideHeader>
        {opts && (
          <div>
            <div className="flex items-start gap-4">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset", tone.ring)}>
                <Icon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">{opts.title}</h2>
                {opts.message && <div className="mt-1.5 text-sm leading-6 text-slate-500">{opts.message}</div>}
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => finish(false)} disabled={busy}>
                {opts.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={tone.button}
                onClick={onConfirm}
                disabled={busy}
                data-autofocus
                className={cn("min-w-24", tone.button === "danger" && "border-rose-600 bg-rose-600 font-semibold !text-white hover:bg-rose-700")}
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {error ? "Try again" : opts.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
