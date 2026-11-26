export const ZIP_COOKIE = "pc_zip";
export const ZIP_RE = /^\d{5}$/;

export function setZipCookie(zip: string | null) {
  if (typeof document === "undefined") return;
  if (zip) {
    document.cookie = `${ZIP_COOKIE}=${zip}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } else {
    document.cookie = `${ZIP_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

export function readZipCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)pc_zip=(\d{5})/);
  return m?.[1] ?? null;
}
