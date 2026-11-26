"use client";

import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, Badge, Button, Card, Modal } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm";
import { useSession } from "@/hooks/useSession";
import { messageOf } from "@/lib/errors";
import { AVATAR_ACCEPT, squareAvatar } from "@/lib/image";
import { withYouLabel } from "@/lib/utils";
import { services } from "@/services";

const ROLE_LABEL = { employee: "Employee", admin: "Admin", superadmin: "Super Admin" } as const;

/** Settings → profile: shows the person's picture and lets them upload, replace or remove it. */
export function ProfilePhotoCard() {
  const { user, refresh } = useSession();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ blob: Blob; preview: string }>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [dragging, setDragging] = useState(false);

  // Free the preview's object URL when it is replaced or the card unmounts.
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.preview); }, [pending]);

  if (!user) return null;

  async function pick(file?: File | null) {
    if (!file) return;
    setErr(undefined);
    try {
      const blob = await squareAvatar(file);
      setPending({ blob, preview: URL.createObjectURL(blob) });
    } catch (e) {
      setErr(messageOf(e, "Could not read that image."));
    } finally {
      if (input.current) input.current.value = ""; // allow choosing the same file again
    }
  }

  async function save() {
    if (!pending) return;
    setBusy(true);
    setErr(undefined);
    try {
      await services.profile.uploadAvatar(pending.blob);
      await refresh(); // sidebar, header and lists pick up the new picture
      setPending(undefined);
    } catch (e) {
      setErr(messageOf(e, "Upload failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setErr(undefined);
    const ok = await confirm({
      title: "Remove your profile picture?",
      message: "Your initials will be shown instead. You can upload a new picture at any time.",
      confirmLabel: "Remove picture",
      tone: "danger",
      icon: "delete",
      action: () => services.profile.removeAvatar(),
    });
    if (ok) await refresh();
  }

  return (
    <Card>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
          aria-label={user.avatarUrl ? "Change profile picture" : "Upload profile picture"}
          className={`group relative shrink-0 rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500 ${dragging ? "ring-2 ring-brand-500" : ""}`}
        >
          <Avatar name={user.name} src={user.avatarUrl} size={88} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/50 !text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera size={22} />
          </span>
        </button>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <p className="text-lg font-semibold text-slate-900">{withYouLabel(user.name, true)}</p>
            <Badge tone="violet">{ROLE_LABEL[user.role]}</Badge>
          </div>
          <p className="text-sm text-slate-500">{user.email}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button size="sm" onClick={() => input.current?.click()}>
              <Upload size={14} /> {user.avatarUrl ? "Change picture" : "Upload picture"}
            </Button>
            {user.avatarUrl && (
              <Button size="sm" variant="ghost" onClick={remove}>
                <Trash2 size={14} /> Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">JPG, PNG or WebP. Click or drag a photo onto the picture. It is cropped to a square.</p>
          {err && <p role="alert" className="mt-2 text-sm text-rose-600">{err}</p>}
        </div>
      </div>

      <input ref={input} type="file" accept={AVATAR_ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      <Modal open={!!pending} onClose={() => !busy && setPending(undefined)} title="New profile picture" size="sm" dismissible={!busy}>
        {pending && (
          <div className="space-y-5">
            <div className="flex items-center justify-center gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={pending.preview} alt="Preview" className="h-40 w-40 rounded-full object-cover shadow-md ring-4 ring-white" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending.preview} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200" />
            </div>
            <p className="text-center text-sm text-slate-500">This is how you&apos;ll appear across HR Pulse.</p>
            {err && <p role="alert" className="text-center text-sm text-rose-600">{err}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => input.current?.click()}>
                Choose another
              </Button>
              <Button className="flex-1" disabled={busy} onClick={save} data-autofocus>
                {busy && <Loader2 size={16} className="animate-spin" />} Save picture
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
