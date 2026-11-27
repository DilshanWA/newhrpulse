"use client";

import { CheckCircle2, Clock3, Loader2, LogIn, LogOut, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { WORK_POLICY, isEarlyClockOut } from "@/domain/policy";
import type { AttendanceRecord } from "@/domain/types";
import { useSession } from "@/hooks/useSession";
import { getLocation, locationLabel } from "@/lib/geo";
import { cn, fmtClock, fmtHm, fmtTime, TIME_ZONE } from "@/lib/utils";
import { services } from "@/services";

const QUICK_REASONS = ["Medical appointment", "Personal emergency", "Approved by manager", "Not feeling well", "Family matter"];
const MIN_REASON = 5;

export function ClockWidget({ onChange }: { onChange?: () => void }) {
  const { user, refresh } = useSession();
  const [rec, setRec] = useState<AttendanceRecord | undefined>();
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState<string>();
  const [reloadToday, setReloadToday] = useState(0);
  const [locationWarning, setLocationWarning] = useState<string>();
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState("");
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const userAgent = navigator.userAgent;
    const isIPad = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
    setIsMobileDevice(isIPad || /Android|iPhone|iPad|iPod|Tablet|Silk|Kindle|Windows Phone/i.test(userAgent));
  }, []);
  useEffect(() => {
    let active = true;
    setRec(undefined);
    setTodayError(undefined);
    if (!user?.employeeId) {
      setTodayLoading(false);
      return () => { active = false; };
    }

    setTodayLoading(true);
    services.attendance.today(user.employeeId)
      .then((record) => { if (active) setRec(record); })
      .catch((error: unknown) => {
        if (active) setTodayError(error instanceof Error ? error.message : "Could not load today's attendance.");
      })
      .finally(() => { if (active) setTodayLoading(false); });
    return () => { active = false; };
  }, [user?.employeeId, reloadToday]);

  if (!user) return null;
  if (!user.employeeId) {
    if (user.role !== "employee") {
      return (
        <Card>
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-brand-600" />
            <h3 className="font-semibold text-slate-900">Preparing clock-in</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your Employer profile is created automatically when you sign in. Refresh your profile to load clock-in.
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => void refresh()}>
            Refresh profile
          </Button>
        </Card>
      );
    }
    return (
      <Card>
        <h3 className="font-semibold text-slate-900">Attendance profile needed</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Ask HR to add an Employer profile with this Microsoft email before using clock-in.
        </p>
      </Card>
    );
  }
  const empId = user.employeeId;
  const state = !rec?.clockIn ? "out" : !rec.clockOut ? "in" : "done";

  async function act(earlyReason?: string) {
    setBusy(true);
    setErr(undefined);
    setLocationWarning(undefined);
    try {
      const where = await getLocation();
      const saved = state === "out"
        ? await services.attendance.clockIn(empId, where)
        : await services.attendance.clockOut(empId, where, earlyReason);
      setRec(saved);
      setLocationWarning(saved.locationWarning);
      setReason("");
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function onPress() {
    if (state === "in" && isEarlyClockOut(new Date())) setAskReason(true);
    else act();
  }

  function confirmEarly() {
    if (reason.trim().length < MIN_REASON) return;
    setAskReason(false);
    act(reason.trim());
  }

  return (
    <>
      <Card className="relative min-h-full overflow-hidden p-6 sm:p-8">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl sm:h-56 sm:w-56" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                <span className="h-2 w-2 rounded-full bg-brand-500" />
                Today
              </p>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE })}
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 sm:h-14 sm:w-14">
              <Clock3 size={24} />
            </div>
          </div>

          <p className="mt-4 break-words font-mono text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl xl:text-6xl">{fmtClock(now)}</p>

          <div className="mt-6 grid grid-cols-3 gap-2 text-sm sm:gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4">
              <p className="text-xs font-medium text-slate-500">Clock in</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{fmtTime(rec?.clockIn)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4">
              <p className="text-xs font-medium text-slate-500">Clock out</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{fmtTime(rec?.clockOut)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4">
              <p className="text-xs font-medium text-slate-500">Shift ends</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 sm:text-base">{fmtHm(WORK_POLICY.shiftEnd)}</p>
            </div>
          </div>

          {state !== "done" ? (
            <Button onClick={onPress} disabled={isMobileDevice || busy || todayLoading || !!todayError} variant={state === "out" ? "primary" : "danger"} className="mt-6 min-h-12 w-full text-base">
              {busy || todayLoading ? <Loader2 size={16} className="animate-spin" /> : state === "out" ? <LogIn size={16} /> : <LogOut size={16} />}
              {busy ? "Getting location…" : todayLoading ? "Loading attendance…" : state === "out" ? "Clock in" : "Clock out"}
            </Button>
          ) : (
            <p className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={20} className="shrink-0" />
              You&apos;re done for today. Great work!
            </p>
          )}
          {isMobileDevice && (
            <p role="status" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Clock in and clock out are disabled on mobile phones and tablets. Use a desktop browser for attendance.</p>
          )}

          {todayError && (
            <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <p>Could not load today&apos;s attendance: {todayError}</p>
              <button type="button" className="mt-1 font-semibold underline" onClick={() => setReloadToday((n) => n + 1)}>
                Retry
              </button>
            </div>
          )}
          {(rec?.inLocation || rec?.outLocation) && (
            <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
              {rec.inLocation && <p className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-brand-600" /> In: {locationLabel(rec.inLocation)}</p>}
              {rec.outLocation && <p className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-brand-600" /> Out: {locationLabel(rec.outLocation)}</p>}
            </div>
          )}
          {err && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p>}
          {rec?.earlyReason && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Early clock-out reason: {rec.earlyReason}</p>}
          {locationWarning && <p role="status" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{locationWarning}</p>}
          <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">Your location is captured at clock in/out for attendance verification.</p>
        </div>
      </Card>

      {/* Outside the card: the card's blur/overflow would otherwise trap the fixed overlay. */}
      <Modal open={askReason} onClose={() => setAskReason(false)} title="Clocking out early?">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            It is {fmtTime(now)} and your shift ends at {fmtHm(WORK_POLICY.shiftEnd)}. Please tell us why you are leaving early.
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  reason === r ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Field label="Reason (required)">
            <textarea className="input" rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Type the reason…" />
          </Field>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setAskReason(false)}>Stay clocked in</Button>
            <Button variant="danger" className="flex-1" disabled={reason.trim().length < MIN_REASON} onClick={confirmEarly}>
              <LogOut size={16} /> Clock out
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
