"use client";

import { CheckCircle2, Mail, MailCheck, Send, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm";
import type { Employee, SalaryLine, TeacherPayLine } from "@/domain/types";
import { fmtDate, fmtDateTime, fmtMonth, money } from "@/lib/utils";
import { services } from "@/services";
import type { EmailMonthResult, PayKind } from "@/services/types";

type Line = SalaryLine | TeacherPayLine;

/** Whether the backend can send email. `undefined` while checking. */
export function useMailReady() {
  const [ready, setReady] = useState<boolean>();
  useEffect(() => {
    services.payroll.mailStatus().then((s) => setReady(s.configured)).catch(() => setReady(false));
  }, []);
  return ready;
}

const NOT_CONFIGURED = "Email isn't set up on the server yet. Add the SMTP settings to the backend .env.";

/** Small "Emailed 25 Nov" line shown under a payslip's status. */
export function EmailedTag({ at }: { at?: string | null }) {
  if (!at) return null;
  return (
    <span className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700" title={fmtDateTime(at)}>
      <MailCheck size={12} /> Emailed {fmtDate(at)}
    </span>
  );
}

/** Per-row button: confirms recipient and amount, then emails that one payslip. */
export function EmailSlipButton({
  kind, line, employee, net, mailReady, onSent,
}: {
  kind: PayKind;
  line: Line;
  employee?: Employee;
  net: number;
  mailReady?: boolean;
  onSent: (line: Line) => void;
}) {
  const confirm = useConfirm();
  const draft = line.status === "draft";
  const noEmail = !employee?.email;
  const disabled = draft || noEmail || mailReady === false;
  const why = mailReady === false ? NOT_CONFIGURED
    : draft ? "Approve this payslip before emailing it"
    : noEmail ? "This employee has no email address"
    : line.emailedAt ? "Email this payslip again" : "Email this payslip to the employee";

  async function send() {
    let saved: Line | undefined;
    const ok = await confirm({
      title: line.emailedAt ? `Send ${employee!.name}'s payslip again?` : `Email payslip to ${employee!.name}?`,
      message: (
        <>
          The {fmtMonth(line.month)} payslip (net <b className="text-slate-700">{money(net)}</b>) will be sent to{" "}
          <b className="break-all text-slate-700">{employee!.email}</b>.
          {line.emailedAt && <span className="mt-2 block">It was already emailed on {fmtDate(line.emailedAt)}.</span>}
        </>
      ),
      confirmLabel: line.emailedAt ? "Send again" : "Send payslip",
      action: async () => {
        saved = kind === "salary" ? await services.payroll.emailSalarySlip(line.id) : await services.payroll.emailTeacherSlip(line.id);
      },
    });
    if (ok && saved) onSent(saved);
  }

  return (
    <Button size="sm" variant={line.emailedAt ? "ghost" : "secondary"} disabled={disabled} title={why} aria-label={why} onClick={send}>
      {line.emailedAt ? <MailCheck size={14} /> : <Mail size={14} />}
      <span className="hidden xl:inline">{line.emailedAt ? "Resend" : "Email"}</span>
    </Button>
  );
}

/** Header button: emails every approved/paid payslip for the month that hasn't been sent yet. */
export function EmailMonthButton({
  kind, month, lines, mailReady, onDone,
}: {
  kind: PayKind;
  month: string;
  lines: Line[];
  mailReady?: boolean;
  onDone: () => void;
}) {
  const confirm = useConfirm();
  const [result, setResult] = useState<EmailMonthResult>();
  const ready = lines.filter((l) => l.status !== "draft" && !l.emailedAt).length;
  const drafts = lines.filter((l) => l.status === "draft").length;
  const sent = lines.filter((l) => l.status !== "draft" && l.emailedAt).length;

  async function run() {
    let r: EmailMonthResult | undefined;
    const ok = await confirm({
      title: `Email ${ready} payslip${ready === 1 ? "" : "s"} for ${fmtMonth(month)}?`,
      message: (
        <>
          Each employee gets their own payslip at the email address on their employee record.
          <span className="mt-2 block text-xs">
            {sent > 0 && <>{sent} already emailed will be skipped. </>}
            {drafts > 0 && <>{drafts} draft{drafts === 1 ? "" : "s"} will be skipped until approved.</>}
          </span>
        </>
      ),
      confirmLabel: `Send ${ready} payslip${ready === 1 ? "" : "s"}`,
      action: async () => {
        r = await services.payroll.emailMonth(kind, month, true);
      },
    });
    if (ok && r) {
      setResult(r);
      onDone();
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        disabled={!ready || mailReady === false}
        title={mailReady === false ? NOT_CONFIGURED : !ready ? "No approved payslips waiting to be emailed" : undefined}
        onClick={run}
      >
        <Send size={15} /> Email payslips{ready ? ` (${ready})` : ""}
      </Button>

      <Modal open={!!result} onClose={() => setResult(undefined)} title="Payslips emailed" size="sm">
        {result && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <CheckCircle2 size={18} className="text-emerald-600" />
              {result.sent} payslip{result.sent === 1 ? "" : "s"} sent.
            </p>
            {result.failed.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-rose-700">
                  <XCircle size={16} /> {result.failed.length} could not be sent
                </p>
                <ul className="space-y-1 text-xs text-rose-700">
                  {result.failed.map((f, i) => <li key={i}><b>{f.name}</b>: {f.error}</li>)}
                </ul>
              </div>
            )}
            {(result.skippedDrafts > 0 || result.skippedAlreadySent > 0) && (
              <p className="text-xs text-slate-500">
                Skipped: {result.skippedAlreadySent} already emailed, {result.skippedDrafts} draft{result.skippedDrafts === 1 ? "" : "s"}.
              </p>
            )}
            <Button className="w-full" onClick={() => setResult(undefined)} data-autofocus>Done</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
