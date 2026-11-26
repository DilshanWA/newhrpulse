"use client";

import { Download, FileText, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, Empty, Field } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm";
import { can, type ContractDoc, type ContractKind } from "@/domain/types";
import { useAsync } from "@/hooks/useAsync";
import { useSession } from "@/hooks/useSession";
import { messageOf } from "@/lib/errors";
import { fmtDate, fmtDateTime, formatBytes } from "@/lib/utils";
import { services } from "@/services";

const MAX = 10 * 1024 * 1024;
const ALLOWED = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];

/**
 * An employee's contracts and documents.
 * Admins and super admins can upload, download and delete for every employee (including other
 * admins, super admins and themselves); employees only ever see and download their own.
 */
export function ContractsPanel({ employeeId, employeeName }: { employeeId: string; employeeName?: string }) {
  const { user } = useSession();
  const canManage = !!user && can.manageEmployees(user.role);
  const [downloading, setDownloading] = useState<string>();
  const confirm = useConfirm();
  const { data, loading, reload } = useAsync(() => services.employees.listContracts(employeeId), [employeeId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ContractKind>("Employment Contract");
  const [validFrom, setFrom] = useState("");
  const [validTo, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  async function upload(file?: File) {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED.includes(ext)) return setErr(`Allowed types: ${ALLOWED.join(", ")}`);
    if (file.size > MAX) return setErr("File is larger than 10 MB.");
    if (validFrom && validTo && validTo < validFrom) return setErr("'Valid to' is before 'Valid from'.");
    setErr(undefined);
    setBusy(true);
    try {
      await services.employees.uploadContract(employeeId, file, { kind, validFrom: validFrom || undefined, validTo: validTo || undefined }, user?.name ?? "unknown");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function download(d: ContractDoc) {
    setErr(undefined);
    setDownloading(d.id);
    try {
      await services.employees.downloadContract(d);
    } catch (e) {
      setErr(messageOf(e, "Download failed."));
    } finally {
      setDownloading(undefined);
    }
  }

  async function remove(d: ContractDoc) {
    setErr(undefined);
    const ok = await confirm({
      title: "Delete this document?",
      message: <><span className="font-medium text-slate-700">{d.fileName}</span> will be permanently removed. This cannot be undone.</>,
      confirmLabel: "Delete document",
      tone: "danger",
      icon: "delete",
      action: () => services.employees.deleteContract(d.id),
    });
    if (ok) reload();
  }

  return (
    <Card>
      <h3 className="mb-1 font-semibold text-white">Contracts &amp; documents</h3>
      <p className="mb-2 text-sm text-slate-400">
        {canManage ? `Upload signed contracts${employeeName ? ` for ${employeeName}` : ""} so they are always one click away.` : "Your contract and documents on file."}
      </p>
      <p className="mb-5 inline-flex items-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck size={13} /> Private: only {employeeName ?? "the employee"}, admins and super admins can see these files.
      </p>

      {canManage && <div className="mb-6 grid gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
        <Field label="Type">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ContractKind)}>
            {["Employment Contract", "Amendment", "NDA", "Other"].map((k) => <option key={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Valid from"><input type="date" className="input" value={validFrom} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Valid to"><input type="date" className="input" value={validTo} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex items-end">
          <input ref={fileRef} type="file" hidden accept={ALLOWED.join(",")} onChange={(e) => upload(e.target.files?.[0])} />
          <Button className="w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> {busy ? "Uploading…" : "Upload file"}
          </Button>
        </div>
      </div>}
      {err && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}

      {loading ? null : !data?.length ? (
        <Empty text="No documents uploaded yet." />
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {data.map((d: ContractDoc) => (
            <li key={d.id} className="flex items-center gap-4 py-3">
              <div className="rounded-xl bg-brand-500/10 p-2.5 text-brand-400"><FileText size={18} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{d.fileName}</p>
                <p className="text-xs text-slate-400">
                  {d.kind} · {formatBytes(d.fileSize)} · uploaded {fmtDateTime(d.uploadedAt)} by {d.uploadedBy}
                  {d.validTo ? ` · valid until ${fmtDate(d.validTo)}` : ""}
                </p>
              </div>
              <Button variant="secondary" size="sm" disabled={downloading === d.id} aria-label={`Download ${d.fileName}`} onClick={() => download(d)}>
                {downloading === d.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span className="hidden sm:inline">Download</span>
              </Button>
              {canManage && (
                <Button variant="ghost" size="sm" aria-label={`Delete ${d.fileName}`} onClick={() => remove(d)}>
                  <Trash2 size={15} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
