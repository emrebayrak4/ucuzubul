import type { Clock } from "./http";

export interface IssuedToken {
  accessToken: string;
  /** Lifetime in seconds as reported by the provider. */
  expiresInSec: number;
}

/** Caches an OAuth2 client-credentials token and refreshes it 60s before expiry. Coalesces concurrent refreshes. */
export class TokenCache {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(private readonly clock: Clock) {}

  async get(issue: () => Promise<IssuedToken>): Promise<string> {
    if (this.token && this.clock.now() < this.expiresAt - 60_000) return this.token;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const t = await issue();
        this.token = t.accessToken;
        this.expiresAt = this.clock.now() + Math.max(60, t.expiresInSec) * 1000;
        return t.accessToken;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }
}
