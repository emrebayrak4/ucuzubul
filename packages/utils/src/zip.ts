const ZIP_RE = /^(\d{5})(?:[-\s]?(\d{4}))?$/;

/** Valid US ZIP or ZIP+4 ("94107", "94107-1234", "941071234"). Rejects "00000". */
export function isValidZip(input: string): boolean {
  const m = ZIP_RE.exec(input.trim());
  if (!m) return false;
  return m[1] !== "00000";
}

/** Normalizes to "94107" or "94107-1234"; returns null if invalid. */
export function normalizeZip(input: string): string | null {
  const m = ZIP_RE.exec(input.trim());
  if (!m || m[1] === "00000") return null;
  return m[2] ? m[1] + "-" + m[2] : (m[1] ?? null);
}

/** 5-digit prefix used for tax/shipping lookups. */
export function zip5(input: string): string | null {
  const n = normalizeZip(input);
  return n ? n.slice(0, 5) : null;
}
