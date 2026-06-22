"use client";

import { Button } from "@/components/ui/Button";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Confirm action</p>
        <h2 id="confirm-modal-title" className="mt-2 text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
