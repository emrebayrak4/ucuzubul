import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "./infra";

const FREE_ATTEMPTS = 5;
const WINDOW_S = 15 * 60;
const BASE_LOCK_S = 30;
const MAX_LOCK_S = 15 * 60;

/**
 * Per-account login backoff (SEC-M1), independent of client IP. Applies to unknown emails too, so it
 * does not reveal whether an account exists. After 5 failures in 15 min every further failure locks the
 * account for 30 s, 60 s, 120 s … up to 15 min. A successful login clears the counter.
 * If Redis is down the check is skipped (IP throttling still applies).
 */
@Injectable()
export class LoginLockoutService {
  private readonly log = new Logger("LoginLockout");

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(email: string): string {
    return `login:fail:${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32)}`;
  }

  /** Seconds remaining on the lock, or 0 when login may be attempted. */
  async lockedFor(email: string): Promise<number> {
    try {
      const ttl = await this.redis.pttl(`${this.key(email)}:lock`);
      return ttl > 0 ? Math.ceil(ttl / 1000) : 0;
    } catch {
      return 0;
    }
  }

  async recordFailure(email: string): Promise<void> {
    try {
      const k = this.key(email);
      const fails = await this.redis.incr(k);
      if (fails === 1) await this.redis.expire(k, WINDOW_S);
      if (fails > FREE_ATTEMPTS) {
        const lock = Math.min(MAX_LOCK_S, BASE_LOCK_S * 2 ** (fails - FREE_ATTEMPTS - 1));
        await this.redis.set(`${k}:lock`, "1", "EX", lock);
        await this.redis.expire(k, Math.max(WINDOW_S, lock));
      }
    } catch (err) {
      this.log.warn(`lockout unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async clear(email: string): Promise<void> {
    try {
      const k = this.key(email);
      await this.redis.del(k, `${k}:lock`);
    } catch {
      /* ignore */
    }
  }
}
