"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { assetUrl } from "@/lib/http";
import { cn } from "@/lib/utils";

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "primary", size = "md", className, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const v: Record<Variant, string> = {
    primary: "bg-brand-500 !text-white hover:bg-brand-600 font-semibold shadow-sm",
    secondary: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200",
  };
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5" : "px-4 py-2.5",
        v[variant],
        className,
      )}
    />
  );
}

/* ---------- Badge ---------- */
type Tone = "green" | "amber" | "red" | "blue" | "violet" | "slate";
const tones: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  blue: "bg-brand-50 text-brand-700 border-brand-200",
  violet: "bg-brand-50 text-brand-700 border-brand-200",
  slate: "bg-slate-50 text-slate-600 border-slate-200",
};
export const Badge = ({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) => (
  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", tones[tone])}>
    {children}
  </span>
);

export const statusTone = (s: string): Tone =>
  ({ active: "green", approved: "green", paid: "green", pending: "amber", draft: "amber", on_leave: "blue", rejected: "red", terminated: "red" } as Record<string, Tone>)[s] ?? "slate";

/** "Admin" / "Super Admin" chip for people who have elevated HR Pulse access; nothing for employees. */
export const RoleBadge = ({ role }: { role?: string | null }) =>
  role === "superadmin" ? <Badge tone="violet">Super Admin</Badge> : role === "admin" ? <Badge tone="blue">Admin</Badge> : null;

/* ---------- Card / Stat / PageHeader ---------- */
export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("card p-5", className)}>{children}</div>
);

export function Stat({ label, value, hint, icon, tone = "brand" }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: "brand" | "violet" | "amber" | "rose" }) {
  const t = { brand: "from-brand-100 text-brand-700", violet: "from-brand-100 text-brand-700", amber: "from-amber-100 text-amber-700", rose: "from-rose-100 text-rose-700" }[tone];
  return (
    <div className="card relative overflow-hidden p-5">
      <div className={cn("absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br to-transparent blur-xl", t.split(" ")[0])} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {icon &&         <div className={cn("rounded-xl bg-slate-50 p-2.5", t.split(" ")[1])}>{icon}</div>}
      </div>
    </div>
  );
}

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/* ---------- Table ---------- */
export const TableWrap = ({ children }: { children: ReactNode }) => (
  <div className="card overflow-x-auto p-0">
    <table className="w-full min-w-[640px] border-collapse">{children}</table>
  </div>
);
export const THead = ({ cols }: { cols: (string | ReactNode)[] }) => (
  <thead>
    <tr className="border-b border-slate-200">
      {cols.map((c, i) => (
        <th key={i} className="th">{c}</th>
      ))}
    </tr>
  </thead>
);
export const Empty = ({ text }: { text: string }) => (
  <div className="py-12 text-center text-sm text-slate-400">{text}</div>
);

/* ---------- Field ---------- */
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
  </label>
);

/* ---------- Modal ---------- */
/**
 * Dialog overlay. Closes on Escape and backdrop click (unless `dismissible` is false),
 * locks page scroll, keeps Tab focus inside, and returns focus to where it was on close.
 */
export function Modal({
  open, onClose, title, children, size = "md", dismissible = true, hideHeader = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
  /** Keep the title for screen readers but draw your own header (used by ConfirmDialog). */
  hideHeader?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const canDismiss = useRef(dismissible);
  canDismiss.current = dismissible;

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ) ?? []);
    // Respect an explicit autoFocus inside; otherwise focus the first control.
    requestAnimationFrame(() => {
      if (!panel.current?.contains(document.activeElement)) (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canDismiss.current) {
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={() => dismissible && onClose()} />
      <div ref={panel} className={cn("card relative max-h-[calc(100vh-2rem)] w-full overflow-y-auto bg-white p-6 shadow-2xl animate-pop-in", width)}>
        {!hideHeader && (
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {dismissible && (
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn("rounded-lg px-4 py-1.5 text-sm transition", value === t.id ? "bg-brand-500 font-semibold !text-white" : "text-slate-500 hover:text-slate-900")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Profile picture, or the person's initials when there is none (or it fails to load). */
export function Avatar({ name, size = 36, src }: { name: string; size?: number; src?: string | null }) {
  const url = assetUrl(src);
  const [failed, setFailed] = useState<string>();
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  if (url && failed !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served by the API with the session cookie
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setFailed(url)}
        className="shrink-0 rounded-full bg-slate-100 object-cover ring-1 ring-slate-200"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.34)) }}
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700"
      aria-label={name}
    >
      {initials}
    </div>
  );
}

export const Spinner = () => (
  <div className="flex justify-center py-16">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
  </div>
);
