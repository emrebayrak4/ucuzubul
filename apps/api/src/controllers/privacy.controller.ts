import { Body, Controller, Get, HttpCode, Inject, Post, Put, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { ConsentResponse, ConsentState, GeoZipResolveResponse, GeoZipResponse, PrivacyRequestResponse } from "@pricora/contracts";
import { ConsentState as ConsentSchema } from "@pricora/contracts";
import type { PrivacyRequest, User } from "@pricora/database";
import { parseEdgeZip } from "@pricora/utils";
import type { Request } from "express";
import { Auth, CurrentUser, randomToken, sha256 } from "../common/auth";
import { ENV, PRISMA, type PrismaClient } from "../common/infra";
import type { ServerEnv } from "@pricora/config/env";
import { ApiException } from "../common/errors";
import { input } from "../common/validate";
import { boundingBox, haversineKm, MAX_DISTANCE_KM, pickZip, SEARCH_RADII_KM, type ZipCandidate } from "../core/geo-zip";

/** CCPA: respond within 45 days of receipt. */
const DSAR_DUE_MS = 45 * 86_400_000;
const VERIFY_TTL_MS = 72 * 3_600_000;

function dsarOut(r: PrivacyRequest, message: string): PrivacyRequestResponse {
  return { id: r.id, status: r.status, verification: r.emailSent ? "sent" : "not_configured", dueAt: r.dueAt.toISOString(), message };
}

/**
 * Geo (US ZIP from coordinates / edge headers) and privacy (consent, data subject requests).
 * Coordinates are never logged or stored: they are used for one indexed query and dropped.
 */
@Controller()
export class PrivacyController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  // ───────── geo ─────────
  @Get("geo/zip")
  @Auth("public")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async nearestZip(@Query() query: unknown): Promise<GeoZipResponse> {
    const { lat, lng } = input("geo.zip.nearest", "query", query);
    for (const radius of SEARCH_RADII_KM) {
      // Weighted pick may prefer a large ZCTA whose point is up to ~15 km farther than the nearest one → pad the box.
      const b = boundingBox(lat, lng, radius + 15);
      const rows = await this.prisma.zipCode.findMany({
        where: { lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } },
        select: { zip: true, lat: true, lng: true, state: true, city: true, landAreaKm2: true },
        take: 2000,
      });
      const candidates: ZipCandidate[] = rows;
      const nearest = Math.min(...candidates.map((c) => haversineKm(lat, lng, c.lat, c.lng)));
      if (!Number.isFinite(nearest) || nearest > radius) continue;
      const pick = pickZip(lat, lng, candidates, MAX_DISTANCE_KM);
      if (pick) {
        return { zip: pick.candidate.zip, city: pick.candidate.city, state: pick.candidate.state, distanceKm: pick.distanceKm, confidence: pick.confidence, source: "census_zcta" };
      }
    }
    return { zip: null, city: null, state: null, distanceKm: null, confidence: null, source: "census_zcta" };
  }

  @Get("geo/zip/resolve")
  @Auth("public")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  resolveZip(@Req() req: Request): GeoZipResolveResponse {
    // Edge geo headers are client-forgeable unless the API sits behind that edge (TRUST_PROXY configured).
    if (!this.env.TRUST_PROXY) return { zip: null, state: null, source: "none", confidence: null };
    const g = parseEdgeZip(req.headers);
    return { zip: g.zip, state: g.state, source: g.source, confidence: g.zip ? "low" : null };
  }

  // ───────── consent (account copy; the first-party cookie is the primary store) ─────────
  @Get("me/consent")
  @Auth("user")
  async consent(@CurrentUser() user: User): Promise<ConsentResponse> {
    const p = await this.prisma.userPreference.findUnique({ where: { userId: user.id }, select: { consent: true } });
    const parsed = ConsentSchema.safeParse(p?.consent);
    return { consent: parsed.success ? parsed.data : null };
  }

  @Put("me/consent")
  @Auth("user")
  async updateConsent(@CurrentUser() user: User, @Body() body: unknown): Promise<ConsentResponse> {
    const b = input("privacy.consent.update", "body", body);
    const consent: ConsentState = {
      v: 1,
      functional: b.functional,
      analytics: b.analytics,
      // Global Privacy Control = opt-out of sale/sharing → advertising & affiliate measurement stays off.
      advertising: b.gpc ? false : b.advertising,
      gpc: b.gpc,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.userPreference.upsert({ where: { userId: user.id }, update: { consent }, create: { userId: user.id, consent } });
    return { consent };
  }

  // ───────── data subject requests (no session) ─────────
  @Post("privacy/requests")
  @HttpCode(201)
  @Auth("public")
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  async createRequest(@Body() body: unknown): Promise<PrivacyRequestResponse> {
    const b = input("privacy.requests.create", "body", body);
    const open = await this.prisma.privacyRequest.count({ where: { email: b.email, status: "awaiting_verification", createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (open >= 3) throw new ApiException(429, "rate_limited", "Too many pending requests for this email. Please verify an earlier request or try again tomorrow.");
    const token = randomToken(32);
    // No mailer is implemented yet (see auth forgot-password); never claim an email went out.
    const emailSent = false;
    const row = await this.prisma.privacyRequest.create({
      data: {
        type: b.type,
        email: b.email,
        state: b.state ?? null,
        details: b.details ?? null,
        verifyTokenHash: sha256(token),
        verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        emailSent,
        dueAt: new Date(Date.now() + DSAR_DUE_MS),
      },
    });
    return dsarOut(
      row,
      emailSent
        ? "We sent a verification link to your email. Your request is processed after you confirm it."
        : `Request recorded (reference ${row.id}). Email delivery is not configured in this environment, so no verification email was sent; our privacy team will verify your identity by replying from the privacy contact address.`,
    );
  }

  @Get("privacy/requests/verify")
  @Auth("public")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyRequest(@Query() query: unknown): Promise<PrivacyRequestResponse> {
    const { token } = input("privacy.requests.verify", "query", query);
    const row = await this.prisma.privacyRequest.findUnique({ where: { verifyTokenHash: sha256(token) } });
    if (!row || row.status !== "awaiting_verification" || !row.verifyExpiresAt || row.verifyExpiresAt <= new Date()) {
      throw new ApiException(400, "bad_request", "This verification link is invalid or has expired");
    }
    const updated = await this.prisma.privacyRequest.update({ where: { id: row.id }, data: { status: "verified", verifiedAt: new Date(), verifyTokenHash: null } });
    return dsarOut(updated, "Thanks — your request is verified. We respond within 45 days.");
  }
}
