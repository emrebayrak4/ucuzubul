/**
 * ECB euro foreign exchange reference rates (free, no key, published ~16:00 CET on TARGET days).
 * Used ONLY for "≈" hints across markets — offers are never converted (CLAUDE.md money rules).
 * Source: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/
 */
import { CURRENCIES, currencyDigits, type CurrencyCode } from "@pricora/config";
import type { PrismaClient } from "@pricora/database";

export const FX_QUEUE = "fx-rates";
export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_90D_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

export interface EcbDay {
  date: string;
  /** Units of currency per 1 EUR. */
  rates: Record<string, string>;
}

/** Parses ECB eurofxref XML (daily or historical) into days. No XML dependency: the format is fixed. */
export function parseEcbXml(xml: string): EcbDay[] {
  const days: EcbDay[] = [];
  const dayRe = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;
  let m: RegExpExecArray | null;
  while ((m = dayRe.exec(xml))) {
    const rates: Record<string, string> = {};
    const rateRe = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g;
    let r: RegExpExecArray | null;
    while ((r = rateRe.exec(m[2] ?? ""))) rates[r[1] as string] = r[2] as string;
    days.push({ date: m[1] as string, rates });
  }
  return days;
}

/** Fetches ECB rates (daily, or last 90 days with `history`) and upserts our currencies. Returns rows written. */
export async function refreshFxRates(
  prisma: PrismaClient,
  opts: { history?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<{ days: number; rows: number; latest: string | null }> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(opts.history ? ECB_90D_URL : ECB_DAILY_URL, { headers: { accept: "application/xml" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`ECB responded ${res.status}`);
  const days = parseEcbXml(await res.text());
  const wanted = CURRENCIES.filter((c) => c !== "EUR");
  let rows = 0;
  for (const d of days) {
    const date = new Date(d.date + "T00:00:00Z");
    for (const quote of wanted) {
      const rate = d.rates[quote];
      if (!rate) continue;
      await prisma.fxRate.upsert({
        where: { base_quote_date: { base: "EUR", quote, date } },
        update: { rate, fetchedAt: new Date() },
        create: { base: "EUR", quote, date, rate, source: "ecb" },
      });
      rows++;
    }
  }
  return { days: days.length, rows, latest: days.map((d) => d.date).sort().at(-1) ?? null };
}

export interface FxSnapshot {
  date: string;
  /** Units per 1 EUR, as decimal strings (EUR itself = "1"). */
  perEur: Partial<Record<CurrencyCode, string>>;
  source: "ecb";
}

/** Latest ECB rates for our currencies (null when the table is empty, e.g. worker never ran). */
export async function latestFxSnapshot(prisma: PrismaClient): Promise<FxSnapshot | null> {
  const newest = await prisma.fxRate.findFirst({ where: { base: "EUR" }, orderBy: { date: "desc" }, select: { date: true } });
  if (!newest) return null;
  const rows = await prisma.fxRate.findMany({ where: { base: "EUR", date: newest.date } });
  const perEur: Partial<Record<CurrencyCode, string>> = { EUR: "1" };
  for (const r of rows) perEur[r.quote as CurrencyCode] = r.rate.toString();
  return { date: newest.date.toISOString().slice(0, 10), perEur, source: "ecb" };
}

/**
 * Approximate conversion of minor units between currencies via EUR cross rates.
 * Returns null when a rate is missing. Integer in → integer out (rounded half away from zero).
 */
export function approxConvertMinor(minor: number, from: string, to: string, snap: FxSnapshot): number | null {
  if (!Number.isSafeInteger(minor)) throw new TypeError("minor must be an integer");
  if (from === to) return minor;
  const rf = snap.perEur[from as CurrencyCode];
  const rt = snap.perEur[to as CurrencyCode];
  if (!rf || !rt) return null;
  const major = minor / 10 ** currencyDigits(from);
  const converted = (major / Number(rf)) * Number(rt);
  return Math.round(converted * 10 ** currencyDigits(to));
}
