/** Minimal subset of chrome.storage.StorageArea used by the cache (injectable for tests). */
export interface KeyValueArea {
  /** `null` returns every key (chrome.storage semantics). */
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

export const TTL = {
  config: 24 * 60 * 60 * 1000,
  coupons: 60 * 60 * 1000,
  product: 15 * 60 * 1000,
  /** After a failed fetch, wait before hitting the API again for the same key. */
  failureBackoff: 5 * 60 * 1000,
} as const;

export const CACHE_PREFIX = "cache:";

export class TtlCache {
  /** Concurrent loads for the same key share one request (e.g. badge + content script on page load). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly area: KeyValueArea,
    private readonly now: () => number = Date.now,
  ) {}

  async read<T>(key: string): Promise<CacheEntry<T> | null> {
    const k = CACHE_PREFIX + key;
    const got = await this.area.get(k);
    const v = got[k] as CacheEntry<T> | undefined;
    return v && typeof v.fetchedAt === "number" ? v : null;
  }

  async write<T>(key: string, data: T): Promise<void> {
    await this.area.set({ [CACHE_PREFIX + key]: { fetchedAt: this.now(), data } satisfies CacheEntry<T> });
  }

  isFresh(entry: CacheEntry<unknown> | null, ttlMs: number): boolean {
    return !!entry && this.now() - entry.fetchedAt < ttlMs && entry.fetchedAt <= this.now();
  }

  /**
   * Returns fresh cached data, otherwise calls `load`. If `load` fails and a stale entry exists, the stale data is
   * returned (stale-if-error); without any entry the error propagates.
   */
  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ data: T; stale: boolean }> {
    const entry = await this.read<T>(key);
    if (entry && this.isFresh(entry, ttlMs)) return { data: entry.data, stale: false };
    try {
      let pending = this.inflight.get(key) as Promise<T> | undefined;
      if (!pending) {
        pending = load().then(async (data) => {
          await this.write(key, data);
          return data;
        });
        this.inflight.set(key, pending);
        void pending.then(
          () => this.inflight.delete(key),
          () => this.inflight.delete(key),
        );
      }
      const data = await pending;
      return { data, stale: false };
    } catch (err) {
      if (entry) return { data: entry.data, stale: true };
      throw err;
    }
  }

  async clearAll(): Promise<void> {
    const all = await this.area.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length) await this.area.remove(keys);
  }
}
