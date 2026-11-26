import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Clock, FetchInitLike, FetchLike, FetchResponseLike } from "../src/index";

const FIXTURES = fileURLToPath(new URL("../__fixtures__/", import.meta.url));

/** Load the `response` payload of a TEST-ONLY recorded-shape fixture. */
export function fixture(name: string): unknown {
  return (JSON.parse(readFileSync(`${FIXTURES}${name}`, "utf8")) as { response: unknown }).response;
}

export function fixtureText(name: string): string {
  return readFileSync(`${FIXTURES}${name}`, "utf8");
}

export interface RecordedCall {
  url: string;
  init: FetchInitLike;
}

export type Route = { match: string | RegExp; status?: number; body: unknown; headers?: Record<string, string> };

/** Fake fetch: first matching route wins; records every call. Unmatched URLs -> 404. */
export function mockFetch(routes: Route[]): FetchLike & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn = (async (url: string, init: FetchInitLike): Promise<FetchResponseLike> => {
    calls.push({ url, init });
    const r = routes.find((x) => (typeof x.match === "string" ? url.includes(x.match) : x.match.test(url)));
    const status = r ? (r.status ?? 200) : 404;
    const text = r ? (typeof r.body === "string" ? r.body : JSON.stringify(r.body)) : "not found";
    const headers = new Map(Object.entries(r?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    return { status, ok: status >= 200 && status < 300, headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null }, text: async () => text };
  }) as FetchLike & { calls: RecordedCall[] };
  fn.calls = calls;
  return fn;
}

/** Manual clock: sleep advances time instantly. */
export function fakeClock(start = Date.parse("2026-11-26T12:00:00Z")): Clock & { advance(ms: number): void; slept: number[] } {
  let now = start;
  const slept: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      slept.push(ms);
      now += ms;
    },
    advance(ms: number) {
      now += ms;
    },
    slept,
  };
}
