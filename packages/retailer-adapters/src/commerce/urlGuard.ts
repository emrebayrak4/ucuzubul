/**
 * SSRF guard for merchant-supplied URLs (feed URLs, WooCommerce store URLs).
 *  - https only, no credentials in the URL
 *  - rejects localhost / *.localhost / *.local / *.internal / single-label hostnames
 *  - rejects IP literals in private, loopback, link-local, CGNAT, multicast and reserved ranges
 *  - optional DNS check: every resolved address must be public
 * Residual risk: DNS rebinding between the check and the fetch (mitigate at the network layer).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type HostResolver = (hostname: string) => Promise<string[]>;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const V4_BLOCKED: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function inV4Range(ip: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base) as number;
  const size = 2 ** (32 - bits);
  return ip >= b && ip < b + size;
}

/** True for any address that must not be fetched from the server (private/loopback/reserved). */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return n === null || V4_BLOCKED.some(([base, bits]) => inV4Range(n, base, bits));
  }
  if (kind === 6) {
    if (ip === "::" || ip === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isPrivateAddress(mapped[1] as string);
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1] as string, 16);
      const lo = parseInt(hexMapped[2] as string, 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    const first = parseInt(ip.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (ip.startsWith("64:ff9b:") || ip.startsWith("2001:db8:")) return true; // NAT64 / documentation
    return false;
  }
  return true; // not an IP at all -> treat as unsafe
}

/** Synchronous URL check (scheme, hostname, IP literal). Returns the parsed URL or throws UnsafeUrlError. */
export function assertSafeHttpsUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("invalid URL");
  }
  if (u.protocol !== "https:") throw new UnsafeUrlError("only https:// URLs are allowed");
  if (u.username || u.password) throw new UnsafeUrlError("credentials in URL are not allowed");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new UnsafeUrlError("missing hostname");
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (isPrivateAddress(bare)) throw new UnsafeUrlError("private or loopback addresses are not allowed");
    return u;
  }
  if (host === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(host) || !host.includes(".")) {
    throw new UnsafeUrlError("local hostnames are not allowed");
  }
  return u;
}

export const defaultResolver: HostResolver = async (hostname) => {
  const res = await lookup(hostname, { all: true, verbatim: true });
  return res.map((r) => r.address);
};

/** Full check: syntax + every DNS answer must be a public address. */
export async function assertPublicHttpsUrl(raw: string, resolve: HostResolver = defaultResolver): Promise<URL> {
  const u = assertSafeHttpsUrl(raw);
  const bare = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) return u;
  let addrs: string[];
  try {
    addrs = await resolve(bare);
  } catch {
    throw new UnsafeUrlError(`could not resolve ${bare}`);
  }
  if (addrs.length === 0) throw new UnsafeUrlError(`could not resolve ${bare}`);
  if (addrs.some(isPrivateAddress)) throw new UnsafeUrlError(`${bare} resolves to a private address`);
  return u;
}
