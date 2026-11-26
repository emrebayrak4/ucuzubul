"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldMessage,
  Input,
  Label,
  toast,
} from "@pricora/ui";
import { api } from "@/lib/api-browser";
import { useSession } from "@/lib/session";
import { ZIP_RE, readZipCookie, setZipCookie } from "@/lib/zip";

interface ZipValue {
  zip: string | null;
  openZipDialog: () => void;
  setZip: (zip: string | null) => Promise<void>;
}

const ZipContext = React.createContext<ZipValue | null>(null);

export function ZipProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useSession();
  const [zip, setZipState] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    // Cookie is the source of truth (SSR reads it for tax estimates); sync once on mount.
    setZipState(readZipCookie());
  }, []);

  const setZip = React.useCallback(
    async (next: string | null) => {
      setZipCookie(next);
      setZipState(next);
      if (user && next) {
        // Best effort: keep the account preference in sync; cookie already drives tax estimates.
        api.me.updatePreferences({ zip: next }).catch(() => undefined);
      }
      router.refresh();
    },
    [router, user],
  );

  const value = React.useMemo(() => ({ zip, setZip, openZipDialog: () => setOpen(true) }), [zip, setZip]);

  return (
    <ZipContext.Provider value={value}>
      {children}
      <ZipDialog open={open} onOpenChange={setOpen} current={zip} onSave={setZip} />
    </ZipContext.Provider>
  );
}

export function useZip(): ZipValue {
  const ctx = React.useContext(ZipContext);
  if (!ctx) throw new Error("useZip must be used inside <ZipProvider>");
  return ctx;
}

function ZipDialog({
  open,
  onOpenChange,
  current,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: string | null;
  onSave: (zip: string | null) => Promise<void>;
}) {
  const [value, setValue] = React.useState(current ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (open) {
      setValue(current ?? "");
      setError(null);
    }
  }, [open, current]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim().slice(0, 5);
    if (!ZIP_RE.test(v)) {
      setError("Enter a 5-digit US ZIP code.");
      return;
    }
    await onSave(v);
    toast.success(`ZIP set to ${v}`, { description: "Tax and totals are now estimated for this area." });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin aria-hidden className="size-4 text-primary" /> Set your ZIP code
            </DialogTitle>
            <DialogDescription>
              Used only to estimate sales tax and shipping on offers. Stored in a cookie on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor={id}>ZIP code</Label>
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={value}
              invalid={Boolean(error)}
              aria-describedby={error ? id + "-err" : undefined}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 10001"
              data-testid="zip-input"
            />
            {error ? (
              <FieldMessage id={id + "-err"} tone="error">
                {error}
              </FieldMessage>
            ) : null}
          </div>
          <DialogFooter className="mt-5">
            {current ? (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  await onSave(null);
                  onOpenChange(false);
                }}
              >
                Clear ZIP
              </Button>
            ) : null}
            <Button type="submit">Save ZIP</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Inline "Set ZIP" trigger used in offer tables and totals. */
export function SetZipButton({ label = "Set ZIP", className }: { label?: string; className?: string }) {
  const { openZipDialog } = useZip();
  return (
    <button
      type="button"
      onClick={openZipDialog}
      className={"rounded-xs text-xs font-medium text-primary underline-offset-2 hover:underline " + (className ?? "")}
    >
      {label}
    </button>
  );
}
