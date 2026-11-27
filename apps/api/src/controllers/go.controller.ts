import { createHash } from "node:crypto";
import { Controller, Get, Inject, Param, Query, Req, Res } from "@nestjs/common";
import type { ServerEnv } from "@pricora/config/env";
import { applySubId } from "@pricora/retailer-adapters";
import type { Response } from "express";
import { Auth, type AuthedRequest, randomToken } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { ENV, PRISMA, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";

/** Only https URLs whose host is the retailer domain or explicitly allow-listed (anti open-redirect / SSRF). */
export function isAllowedRedirect(target: string, domain: string, allowedHosts: string[]): URL | null {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const allowed = new Set([domain, `www.${domain}`, ...allowedHosts].map((h) => h.toLowerCase()));
  return allowed.has(host) ? url : null;
}

@Controller()
export class GoController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  private ipHash(req: AuthedRequest): string | null {
    if (!req.ip) return null;
    const day = new Date().toISOString().slice(0, 10);
    return createHash("sha256").update(`${req.ip}|${day}|${this.env.SESSION_SECRET}`).digest("hex");
  }

  @Get("go/:offerId")
  @Auth("optional")
  async go(@Param() params: unknown, @Query() query: unknown, @Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const { offerId } = input("go.offer", "params", params);
    const { placement } = input("go.offer", "query", query);
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: { retailer: true } });
    if (!offer || !offer.isActive) throw notFound("Offer");
    const url = isAllowedRedirect(offer.affiliateUrl ?? offer.url, offer.retailer.domain, offer.retailer.allowedRedirectHosts);
    if (!url) throw new ApiException(400, "bad_request", "Outbound link is not on the retailer allow-list");
    // Our click id goes into the network's sub-ID parameter (CJ sid, Impact subId1, Rakuten u1, Awin clickref, EPN customid, Amazon ascsubtag…).
    const subId = randomToken(12);
    await this.prisma.affiliateClick.create({
      data: {
        kind: "product",
        subId,
        offerId: offer.id,
        productId: offer.productId,
        retailerId: offer.retailerId,
        userId: req.user?.id ?? null,
        placement: placement ?? null,
        targetHost: url.hostname,
        ipHash: this.ipHash(req),
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
        referrer: (typeof req.headers.referer === "string" ? req.headers.referer : "").slice(0, 500) || null,
      },
    });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
    res.redirect(302, applySubId(url.toString(), subId));
  }

  @Get("travel/go/:type/:id")
  @Auth("optional")
  async travelGo(@Param() params: unknown, @Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const { type, id } = input("travel.go", "params", params);
    let deepLink: string | null = null;
    if (type === "hotel") {
      const rate = await this.prisma.hotelRate.findUnique({ where: { id } });
      if (!rate) throw notFound("Hotel rate");
      if (rate.source === "demo") throw new ApiException(409, "conflict", "Demo rate — no booking link is available");
      deepLink = rate.deepLink;
    } else {
      const fare = await this.prisma.flightOffer.findUnique({ where: { id } });
      if (!fare) throw notFound("Flight offer");
      if (fare.source === "demo") throw new ApiException(409, "conflict", "Demo fare — no booking link is available");
      deepLink = fare.deepLink;
    }
    if (!deepLink) throw notFound("Booking link");
    let url: URL;
    try {
      url = new URL(deepLink);
    } catch {
      throw new ApiException(400, "bad_request", "Invalid booking link");
    }
    if (url.protocol !== "https:") throw new ApiException(400, "bad_request", "Invalid booking link");
    const subId = randomToken(12);
    await this.prisma.affiliateClick.create({
      data: {
        kind: type,
        subId,
        travelRefId: id,
        userId: req.user?.id ?? null,
        targetHost: url.hostname,
        ipHash: this.ipHash(req),
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
      },
    });
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, applySubId(url.toString(), subId));
  }
}
