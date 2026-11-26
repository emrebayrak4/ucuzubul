import type { ReactNode } from "react";
import { FieldMessage, Label } from "@pricora/ui";

/** Label + control + optional hint/error, wired with aria-describedby by id convention. */
export function Field({ id, label, hint, error, required, children }: { id: string; label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <FieldMessage id={`${id}-error`} tone="error">
          {error}
        </FieldMessage>
      ) : hint ? (
        <FieldMessage id={`${id}-hint`}>{hint}</FieldMessage>
      ) : null}
    </div>
  );
}

/** Maps Zod issues (flattened by first path segment) to a field → message record. */
export function issuesToFieldErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
