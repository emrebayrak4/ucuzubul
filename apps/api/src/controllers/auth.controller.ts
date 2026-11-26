import { Body, Controller, Get, HttpCode, Inject, Logger, Param, Post, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { hash, verify } from "@node-rs/argon2";
import type { ServerEnv } from "@pricora/config/env";
import type { AuthSessionResponse, ForgotPasswordResponse, MeResponse, OkResponse } from "@pricora/contracts";
import type { Response } from "express";
import { Auth, type AuthedRequest, randomToken, SessionService, sha256, toPublicUser } from "../common/auth";
import { ApiException, conflict, pendingConfiguration } from "../common/errors";
import { ENV, INTEGRATIONS, PRISMA, type PrismaClient } from "../common/infra";
import type { IntegrationConfig } from "../core/integration-config";
import { loadEnv } from "../common/env";
import { LoginLockoutService } from "../common/lockout";
import { input } from "../common/validate";

const AUTH_LIMIT = { default: { limit: loadEnv().AUTH_RATE_LIMIT_PER_MIN, ttl: 60_000 } };
const RESET_TTL_MS = 60 * 60_000;
/** Used to keep login timing similar for unknown emails. */
const DUMMY_HASH_PROMISE = hash("pricora-timing-equalizer");

/** Native apps (no cookie jar) opt in to receiving the bearer session token. */
function nativeToken(req: AuthedRequest, sessionToken: string): { sessionToken?: string } {
  return req.headers["x-pricora-client"] === "native" ? { sessionToken } : {};
}

@Controller("auth")
export class AuthController {
  private readonly log = new Logger("Auth");

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: ServerEnv,
    @Inject(LoginLockoutService) private readonly lockout: LoginLockoutService,
    @Inject(INTEGRATIONS) private readonly integrations: IntegrationConfig,
  ) {}

  private async zipFor(userId: string): Promise<string | null> {
    const pref = await this.prisma.userPreference.findUnique({ where: { userId }, select: { zip: true } });
    return pref?.zip ?? null;
  }

  @Post("register")
  @Throttle(AUTH_LIMIT)
  async register(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<AuthSessionResponse> {
    const data = input("auth.register", "body", body);
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    // Hash before branching so both paths take the same time (SEC-L2). The message stays generic;
    // full enumeration resistance needs email verification (TODO).
    const passwordHash = await hash(data.password);
    if (existing) {
      throw conflict("We couldn't create an account with these details. If you already have an account, sign in or reset your password.");
    }
    const user = await this.prisma.user.create({
      data: { email: data.email, name: data.name, passwordHash, preference: { create: {} } },
    });
    const { csrfToken, sessionToken } = await this.sessions.create(user.id, req, res);
    res.status(201);
    return { user: toPublicUser(user, null), csrfToken, ...nativeToken(req, sessionToken) };
  }

  @Post("login")
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  async login(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<AuthSessionResponse> {
    const data = input("auth.login", "body", body);
    const locked = await this.lockout.lockedFor(data.email);
    if (locked > 0) {
      res.setHeader("Retry-After", String(locked));
      throw new ApiException(429, "rate_limited", "Too many failed sign-in attempts. Try again in " + locked + " seconds.", { retryAfterSeconds: locked });
    }
    const user = await this.prisma.user.findUnique({ where: { email: data.email } });
    const ok = user?.passwordHash ? await verify(user.passwordHash, data.password) : (await verify(await DUMMY_HASH_PROMISE, data.password), false);
    if (!user || !ok) {
      await this.lockout.recordFailure(data.email);
      throw new ApiException(401, "unauthorized", "Incorrect email or password");
    }
    await this.lockout.clear(data.email);
    if (user.status !== "active") throw new ApiException(403, "forbidden", "This account is not active");
    const { csrfToken, sessionToken } = await this.sessions.create(user.id, req, res);
    return { user: toPublicUser(user, await this.zipFor(user.id)), csrfToken, ...nativeToken(req, sessionToken) };
  }

  @Post("logout")
  @HttpCode(200)
  @Auth("user")
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<OkResponse> {
    await this.sessions.revoke(req.sessionId, res);
    return { ok: true };
  }

  @Get("me")
  @Auth("optional")
  async me(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<MeResponse> {
    const csrfToken = this.sessions.issueCsrf(req, res);
    return { user: req.user ? toPublicUser(req.user, await this.zipFor(req.user.id)) : null, csrfToken };
  }

  @Post("forgot-password")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgot(@Body() body: unknown): Promise<ForgotPasswordResponse> {
    const { email } = input("auth.forgotPassword", "body", body);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.status === "active") {
      const token = randomToken(32);
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      const link = `${this.env.WEB_ORIGIN}/reset-password?token=${token}`;
      if (await this.integrations.get("SMTP_HOST")) {
        // TODO(wave 3): send via SMTP transport. Until then the link is only logged outside production.
        this.log.warn("SMTP configured but mailer not implemented yet; reset email not sent");
      }
      if (this.env.NODE_ENV !== "production") this.log.log(`Password reset link for ${email}: ${link}`);
    }
    return { ok: true, message: "If an account exists for that email, we've sent a password reset link." };
  }

  @Post("reset-password")
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  async reset(@Body() body: unknown): Promise<OkResponse> {
    const { token, password } = input("auth.resetPassword", "body", body);
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.usedAt || row.expiresAt <= new Date()) {
      throw new ApiException(400, "bad_request", "This reset link is invalid or has expired");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hash(password) } }),
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.userSession.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  @Get("oauth/:provider")
  async oauth(@Param() params: unknown, @Query() query: unknown): Promise<never> {
    const { provider } = input("auth.oauthStart", "params", params);
    input("auth.oauthStart", "query", query);
    const configured =
      provider === "google"
        ? Boolean((await this.integrations.get("GOOGLE_OAUTH_CLIENT_ID")) && (await this.integrations.get("GOOGLE_OAUTH_CLIENT_SECRET")))
        : Boolean(
            (await this.integrations.get("APPLE_CLIENT_ID")) &&
              (await this.integrations.get("APPLE_TEAM_ID")) &&
              (await this.integrations.get("APPLE_KEY_ID")) &&
              (await this.integrations.get("APPLE_PRIVATE_KEY")),
          );
    if (!configured) {
      throw pendingConfiguration(`${provider === "google" ? "Google" : "Apple"} sign-in is not configured yet`, {
        provider,
        status: "pending_configuration",
      });
    }
    throw new ApiException(503, "service_unavailable", "OAuth sign-in flow is not implemented yet", { provider });
  }
}
