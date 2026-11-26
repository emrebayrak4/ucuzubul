"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import type { AdminLogoResponse } from "@pricora/contracts";
import { Badge, Button, FieldMessage } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { relative } from "@/lib/format";
import { ConfirmDialog } from "./confirm-dialog";

const MAX_BYTES = 512 * 1024;
const ACCEPT = ["image/png", "image/svg+xml", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"];
const ACCEPT_EXT = /\.(png|svg|webp|ico)$/i;

const SOURCE_LABEL: Record<NonNullable<AdminLogoResponse["logoSource"]>, string> = {
  official_site: "From official site",
  admin_upload: "Uploaded",
  logo_provider: "From logo provider",
};

interface LogoUploaderProps {
  entity: "retailer" | "brand";
  id: string;
  name: string;
  logoUrl: string | null;
  logoSource: AdminLogoResponse["logoSource"];
  logoUpdatedAt: string | null;
  canEdit: boolean;
  /** Query keys to refresh after a change. */
  invalidate: readonly (readonly unknown[])[];
}

/** Logo preview + replace + remove (confirm). Multipart field `file`, ≤ 512 KB, PNG / SVG / WebP / ICO. */
export function LogoUploader({ entity, id, name, logoUrl, logoSource, logoUpdatedAt, canEdit, invalidate }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [current, setCurrent] = useState<AdminLogoResponse>({ logoUrl, logoSource, logoUpdatedAt });

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const keys = invalidate.map((k) => [...k]);
  const upload = useApiMutation(
    (f: File) => {
      const form = new FormData();
      form.set("file", f);
      return entity === "retailer"
        ? getApi().request("admin.retailers.logo.upload", { params: { id }, body: form })
        : getApi().request("admin.brands.logo.upload", { params: { id }, body: form });
    },
    {
      success: `${name} logo updated`,
      invalidate: keys,
      onSuccess: (r) => {
        setCurrent(r);
        reset();
      },
    },
  );
  const remove = useApiMutation(
    () => (entity === "retailer" ? getApi().request("admin.retailers.logo.delete", { params: { id } }) : getApi().request("admin.brands.logo.delete", { params: { id } })),
    { success: `${name} logo removed`, invalidate: keys, onSuccess: (r) => setCurrent(r) },
  );

  function reset() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function pick(f: File | null) {
    setError(null);
    if (!f) return reset();
    if (!(ACCEPT.includes(f.type) || ACCEPT_EXT.test(f.name))) {
      setError("Use a PNG, SVG, WebP or ICO file.");
      return reset();
    }
    if (f.size > MAX_BYTES) {
      setError(`File is ${Math.ceil(f.size / 1024)} KB; the limit is 512 KB.`);
      return reset();
    }
    setFile(f);
  }

  const shown = preview ?? current.logoUrl;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Logo</span>
      <div className="flex items-start gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-white p-1.5">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote API-hosted logos / local blob preview
            <img src={shown} alt={`${name} logo${preview ? " (preview)" : ""}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-2xs text-text-muted">No logo</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {preview ? (
              <Badge variant="warning" size="sm">Preview — not saved</Badge>
            ) : current.logoSource ? (
              <Badge variant="neutral" size="sm">{SOURCE_LABEL[current.logoSource]}</Badge>
            ) : (
              <Badge variant="neutral" size="sm">Text monogram fallback</Badge>
            )}
            {!preview && current.logoUpdatedAt ? <span className="text-2xs text-text-muted">updated {relative(current.logoUpdatedAt)}</span> : null}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                ref={inputRef}
                id={`logo-${entity}-${id}`}
                type="file"
                accept=".png,.svg,.webp,.ico,image/png,image/svg+xml,image/webp,image/x-icon"
                className="sr-only"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <>
                  <Button type="button" size="sm" loading={upload.isPending} onClick={() => upload.mutate(file)}>
                    Upload
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={upload.isPending}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
                  <ImageUp className="size-4" aria-hidden /> {current.logoUrl ? "Replace" : "Upload logo"}
                </Button>
              )}
              {current.logoUrl && !file ? (
                <Button type="button" size="sm" variant="ghost" className="text-error" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="size-4" aria-hidden /> Remove
                </Button>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <FieldMessage tone="error" role="alert">
              {error}
            </FieldMessage>
          ) : (
            <FieldMessage>PNG, SVG, WebP or ICO · max 512 KB. Logos are trademarks of their owners.</FieldMessage>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        destructive
        title={`Remove the ${name} logo?`}
        description="The site falls back to the text monogram on the brand color until a new logo is uploaded."
        confirmLabel="Remove logo"
        onConfirm={() => remove.mutateAsync(undefined)}
      />
    </div>
  );
}
