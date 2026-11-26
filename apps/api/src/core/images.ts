/**
 * Logo image validation: only PNG, WebP, ICO and SVG, detected by content (not by extension/MIME claims).
 * SVGs are sanitised (scripts, event handlers, foreignObject, external references removed) and are also
 * served with a sandboxing CSP.
 */
export type LogoType = "png" | "webp" | "ico" | "svg";

export const LOGO_MAX_BYTES = 512 * 1024;

export const LOGO_CONTENT_TYPES: Record<LogoType, string> = {
  png: "image/png",
  webp: "image/webp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

export function detectLogoType(buf: Buffer): LogoType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 6 && buf[0] === 0 && buf[1] === 0 && (buf[2] === 1 || buf[2] === 2) && buf[3] === 0 && (buf[4] ?? 0) > 0) return "ico";
  const head = buf.subarray(0, 2048).toString("utf8").replace(/^﻿/, "").trimStart().toLowerCase();
  if ((head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!--")) && head.includes("<svg")) return "svg";
  return null;
}

/** Removes active content from an SVG. Returns null if the result is not a plausible SVG. */
export function sanitizeSvg(input: string): string | null {
  let s = input.replace(/^﻿/, "");
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  s = s.replace(/<!ENTITY[\s\S]*?>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/<script[^>]*\/>/gi, "");
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
  s = s.replace(/<(iframe|embed|object|audio|video|handler|listener)[\s\S]*?(<\/\1\s*>|\/>)/gi, "");
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // href / xlink:href only to in-document fragments or embedded raster data.
  s = s.replace(/\s+(xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _x, _q, d1: string | undefined, d2: string | undefined) => {
    const v = (d1 ?? d2 ?? "").trim().toLowerCase();
    return v.startsWith("#") || /^data:image\/(png|jpeg|gif|webp);base64,/.test(v) ? m : "";
  });
  s = s.replace(/javascript:/gi, "").replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, "none");
  if (!/<svg[\s>]/i.test(s) || /<script|<foreignobject|javascript:/i.test(s)) return null;
  return s;
}

export interface ValidLogo {
  type: LogoType;
  body: Buffer;
  contentType: string;
}

export function validateLogo(buf: Buffer): ValidLogo | { error: string } {
  if (buf.length === 0) return { error: "Empty file" };
  if (buf.length > LOGO_MAX_BYTES) return { error: `Logo must be ≤ ${LOGO_MAX_BYTES / 1024} KB` };
  const type = detectLogoType(buf);
  if (!type) return { error: "Only PNG, WebP, ICO or SVG images are accepted" };
  if (type === "svg") {
    const clean = sanitizeSvg(buf.toString("utf8"));
    if (!clean) return { error: "SVG could not be sanitised safely" };
    return { type, body: Buffer.from(clean, "utf8"), contentType: LOGO_CONTENT_TYPES.svg };
  }
  return { type, body: buf, contentType: LOGO_CONTENT_TYPES[type] };
}
