"use client";

import { useState, type ReactNode } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@pricora/ui";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Require typing this text to enable the confirm button (for high-impact actions). */
  typeToConfirm?: string;
  onConfirm: () => Promise<unknown> | void;
}

/** Every destructive admin action goes through this dialog. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, typeToConfirm, onConfirm }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const blocked = typeToConfirm !== undefined && typed.trim() !== typeToConfirm;

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setTyped("");
    } catch {
      // The failing mutation already surfaced a toast; keep the dialog open so the user can retry or cancel.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          onOpenChange(o);
          if (!o) setTyped("");
        }
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-text-muted">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {typeToConfirm !== undefined ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span>
              Type <code className="font-mono font-medium">{typeToConfirm}</code> to confirm
            </span>
            <input
              className="h-9 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} loading={busy} disabled={blocked} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
