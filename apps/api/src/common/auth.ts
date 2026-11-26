import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { brand } from "@pricora/config/brand";
import type { ServerEnv } from "@pricora/config/env";
import type { AuthLevel, PublicUser } from "@pricora/contracts";
import type { User } from "@pricora/database";
import type { CookieOptions, Request, Response } from "express";
import { ApiException, forbidden, unauthorized } from "./errors";
import { ENV, PRISMA, type PrismaClient } from "./infra";

export const SESSION_TTL_MS = 30 * 86_400_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;

export interface AuthedRequest extends Request {
  user?: User;
  sessionId?: string;
}

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

const AUTH_KEY = "pricora:auth";
/** Declares who may call a route. Default (no decorator) = public. */
export const Auth = (level: AuthLevel) => SetMetadata(AUTH_KEY, level);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

/** Roles allowed per auth level. `staff` covers read access; writes additionally call `requireEditor`. */
const LEVEL_ROLES: Record<Exclude<AuthLevel, "public" | "optional" | "user">, User["role"][]> = {
  merchant: ["MERCHANT", "ADMIN"],
  staff: ["ADMIN", "EDITOR", "ANALYST"],
  admin: ["ADMIN"],
};

export function requireEditor(user: User | undefined): void {
  if (!user || (user.role !== "ADMIN" && user.role !== "EDITOR")) throw forbidden("Editor or admin role required");
}

export function toPublicUser(u: User, zip: string | null = null): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    emailVerified: u.emailVerifiedAt !== null,
    avatarUrl: u.avatarUrl,
    zip,
    createdAt: u.createdAt.toISOString(),
  };
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  private cookieBase(): CookieOptions {
    return { sameSite: "lax", secure: this.env.NODE_ENV === "production", path: "/" };
  }

  /** Starts a session; returns the CSRF token and the raw session token (only exposed to native clients). */
  async create(userId: string, req: Request, res: Response): Promise<{ csrfToken: string; sessionToken: string }> {
    const token = randomToken(32);
    await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash: sha256(token),
        ip: req.ip ?? null,
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    res.cookie(brand.sessionCookieName, token, { ...this.cookieBase(), httpOnly: true, maxAge: SESSION_TTL_MS });
    return { csrfToken: this.issueCsrf(req, res, true), sessionToken: token };
  }

  async resolve(req: AuthedRequest): Promise<void> {
    if (req.user) return; // already resolved earlier in this request (throttler)
    const auth = req.headers.authorization;
    const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
    const token = (req.cookies as Record<string, string> | undefined)?.[brand.sessionCookieName] ?? bearer;
    if (!token) return;
    const session = await this.prisma.userSession.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "active") return;
    req.user = session.user;
    req.sessionId = session.id;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
  }

  async revoke(sessionId: string | undefined, res: Response): Promise<void> {
    if (sessionId) {
      await this.prisma.userSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => undefined);
    }
    res.clearCookie(brand.sessionCookieName, { ...this.cookieBase(), httpOnly: true });
    res.clearCookie(brand.csrfCookieName, this.cookieBase());
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Double-submit CSRF token: readable cookie + echoed in `x-csrf-token` header on mutations. */
  issueCsrf(req: Request, res: Response, rotate = false): string {
    const existing = (req.cookies as Record<string, string> | undefined)?.[brand.csrfCookieName];
    const token = !rotate && existing && /^[A-Za-z0-9_-]{32,64}$/.test(existing) ? existing : randomToken(24);
    res.cookie(brand.csrfCookieName, token, { ...this.cookieBase(), httpOnly: false, maxAge: SESSION_TTL_MS });
    return token;
  }
}

/** Request carries a session cookie or bearer token (not yet validated). */
export function hasSessionCredential(req: Request): boolean {
  const cookies = (req.cookies ?? {}) as Record<string, string>;
  const auth = req.headers.authorization;
  return Boolean(cookies[brand.sessionCookieName]) || (typeof auth === "string" && auth.startsWith("Bearer "));
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global guard: resolves the session, enforces CSRF on cookie-authenticated mutations, then checks the
 * route's @Auth level.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const level = this.reflector.getAllAndOverride<AuthLevel | undefined>(AUTH_KEY, [context.getHandler(), context.getClass()]) ?? "public";

    const cookies = (req.cookies ?? {}) as Record<string, string>;
    if (!SAFE_METHODS.has(req.method) && cookies[brand.sessionCookieName]) {
      const header = req.headers[brand.csrfHeaderName];
      const cookie = cookies[brand.csrfCookieName];
      if (typeof header !== "string" || !cookie || !safeEqual(header, cookie)) {
        throw new ApiException(403, "csrf_invalid", "Missing or invalid CSRF token");
      }
    }

    if (level !== "public") await this.sessions.resolve(req);
    if (level === "public" || level === "optional") return true;
    if (!req.user) throw unauthorized();
    if (level === "user") return true;
    if (!LEVEL_ROLES[level].includes(req.user.role)) throw forbidden();
    return true;
  }
}
