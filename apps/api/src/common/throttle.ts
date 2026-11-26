import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { type ExecutionContext, Inject, Injectable, Logger } from "@nestjs/common";
import type { ServerEnv } from "@pricora/config/env";
import type { Request } from "express";
import { type AuthedRequest, hasSessionCredential, SessionService } from "./auth";
import { ENV } from "./infra";
import { Reflector } from "@nestjs/core";
import { getOptionsToken, getStorageToken, ThrottlerGuard, type ThrottlerModuleOptions, type ThrottlerStorage } from "@nestjs/throttler";
import type { Redis } from "ioredis";

interface Record_ {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Redis-backed fixed-window throttler storage (shared across API instances).
 * Falls back to an in-memory window if Redis is unavailable, so rate limiting never takes the API down.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly log = new Logger("Throttler");
  private readonly memory = new Map<string, { hits: number; expiresAt: number; blockedUntil: number }>();

  constructor(private readonly redis: Redis) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<Record_> {
    const k = `throttle:${throttlerName}:${key}`;
    try {
      const blockKey = `${k}:blocked`;
      const blockTtl = await this.redis.pttl(blockKey);
      if (blockTtl > 0) {
        return { totalHits: limit + 1, timeToExpire: Math.ceil(blockTtl / 1000), isBlocked: true, timeToBlockExpire: Math.ceil(blockTtl / 1000) };
      }
      const res = await this.redis.multi().incr(k).pttl(k).exec();
      const hits = Number(res?.[0]?.[1] ?? 1);
      let pttl = Number(res?.[1]?.[1] ?? -1);
      if (pttl < 0) {
        await this.redis.pexpire(k, ttl);
        pttl = ttl;
      }
      const blocked = hits > limit;
      if (blocked && blockDuration > 0) await this.redis.set(blockKey, "1", "PX", blockDuration);
      return {
        totalHits: hits,
        timeToExpire: Math.ceil(pttl / 1000),
        isBlocked: blocked,
        timeToBlockExpire: blocked ? Math.ceil(blockDuration / 1000) : 0,
      };
    } catch (err) {
      this.log.warn(`Redis unavailable, using memory window: ${err instanceof Error ? err.message : String(err)}`);
      return this.memoryIncrement(k, ttl, limit, blockDuration);
    }
  }

  private memoryIncrement(k: string, ttl: number, limit: number, blockDuration: number): Record_ {
    const now = Date.now();
    let e = this.memory.get(k);
    if (!e || e.expiresAt <= now) e = { hits: 0, expiresAt: now + ttl, blockedUntil: 0 };
    e.hits++;
    if (e.hits > limit && blockDuration > 0) e.blockedUntil = now + blockDuration;
    this.memory.set(k, e);
    const blocked = e.blockedUntil > now || e.hits > limit;
    return {
      totalHits: e.hits,
      timeToExpire: Math.ceil((e.expiresAt - now) / 1000),
      isBlocked: blocked,
      timeToBlockExpire: blocked ? Math.ceil((Math.max(e.blockedUntil, e.expiresAt) - now) / 1000) : 0,
    };
  }
}

/** Header names for trusted server-to-server calls (web/admin SSR → API). */
export const INTERNAL_KEY_HEADER = "x-internal-api-key";
export const CLIENT_IP_HEADER = "x-pricora-client-ip";

/** True when the request carries the valid INTERNAL_API_KEY (constant-time compare). */
export function isTrustedServer(req: Request, env: ServerEnv): boolean {
  const expected = env.INTERNAL_API_KEY;
  const got = req.headers[INTERNAL_KEY_HEADER];
  if (!expected || typeof got !== "string") return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rate-limit identity:
 *  1. valid signed-in session (cookie or bearer) → "user:<id>" (also when forwarded by a trusted SSR server)
 *  2. trusted SSR server with x-pricora-client-ip → "ip:<forwarded client ip>"
 *  3. otherwise → "ip:<req.ip>" (socket address unless TRUST_PROXY is configured)
 * Trusted server calls without a client IP (build-time / background fetches) are not throttled.
 *
 * Uses explicit injection tokens: under tsx the CJS throttler package can see a different @nestjs/core
 * module instance, so its emitted design:paramtypes Reflector would not resolve.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storage: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
    @Inject(ENV) private readonly env: ServerEnv,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {
    super(options, storage, reflector);
  }

  private forwardedIp(req: Request): string | null {
    if (!isTrustedServer(req, this.env)) return null;
    const v = req.headers[CLIENT_IP_HEADER];
    return typeof v === "string" && isIP(v.trim()) ? v.trim() : null;
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(context)) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    return isTrustedServer(req, this.env) && !this.forwardedIp(req) && !hasSessionCredential(req);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as AuthedRequest;
    if (hasSessionCredential(r)) {
      await this.sessions.resolve(r);
      if (r.user) return `user:${r.user.id}`;
    }
    return `ip:${this.forwardedIp(r) ?? r.ip ?? r.socket.remoteAddress ?? "unknown"}`;
  }
}
