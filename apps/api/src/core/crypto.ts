/**
 * AES-256-GCM envelope for integration credentials. Format: "v1:" + base64(iv[12] | tag[16] | ciphertext).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1:";

export function parseKey(base64Key: string | undefined): Buffer | null {
  if (!base64Key) return null;
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptJson(value: Record<string, string>, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return VERSION + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptJson(payload: string, key: Buffer): Record<string, string> {
  if (!payload.startsWith(VERSION)) throw new Error("Unsupported credential payload version");
  const raw = Buffer.from(payload.slice(VERSION.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid credential payload");
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

/** "••••1234" for secrets long enough to show 4 chars without revealing much; "••••" otherwise. */
export function maskSecret(value: string): string {
  return value.length >= 12 ? `••••${value.slice(-4)}` : "••••";
}
