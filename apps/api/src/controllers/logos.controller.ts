import { Controller, Delete, Inject, Param, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AdminLogoResponse } from "@pricora/contracts";
import type { User } from "@pricora/database";
import { Auth, type AuthedRequest, CurrentUser, requireEditor } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { PRISMA, STORAGE, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";
import { LOGO_MAX_BYTES, validateLogo } from "../core/images";
import { removeLogo, saveLogo, type LogoOwner } from "../core/logos";
import type { ObjectStorage } from "../core/storage";
import { MetricsService } from "../services/catalog.service";

interface UploadedLogo {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_MIME = new Set(["image/png", "image/webp", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", "application/octet-stream"]);

@Controller("admin")
@Auth("staff")
export class LogosController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  private async upload(owner: LogoOwner, id: string, file: UploadedLogo | undefined, req: AuthedRequest): Promise<AdminLogoResponse> {
    if (!file) throw new ApiException(422, "validation_failed", "Attach the logo as multipart field `file`");
    if (!ALLOWED_MIME.has(file.mimetype.toLowerCase())) throw new ApiException(415, "unsupported_media_type", "Only PNG, WebP, ICO or SVG images are accepted");
    const exists = owner === "retailer" ? await this.prisma.retailer.findUnique({ where: { id } }) : await this.prisma.brand.findUnique({ where: { id } });
    if (!exists) throw notFound(owner === "retailer" ? "Retailer" : "Brand");
    const v = validateLogo(file.buffer);
    if ("error" in v) throw new ApiException(v.error.includes("KB") ? 413 : 415, v.error.includes("KB") ? "payload_too_large" : "unsupported_media_type", v.error);
    const saved = await saveLogo(this.prisma, this.storage, owner, id, v, "admin_upload");
    await this.audit(req, `${owner}.logo.upload`, owner, id, { type: v.type, bytes: v.body.length, logoUrl: saved.logoUrl });
    this.metrics.invalidate();
    return { logoUrl: saved.logoUrl, logoSource: saved.logoSource, logoUpdatedAt: saved.logoUpdatedAt.toISOString() };
  }

  private async remove(owner: LogoOwner, id: string, req: AuthedRequest): Promise<AdminLogoResponse> {
    if (!(await removeLogo(this.prisma, this.storage, owner, id))) throw notFound(owner === "retailer" ? "Retailer" : "Brand");
    await this.audit(req, `${owner}.logo.delete`, owner, id, {});
    return { logoUrl: null, logoSource: null, logoUpdatedAt: null };
  }

  private async audit(req: AuthedRequest, action: string, owner: LogoOwner, id: string, diff: Record<string, unknown>): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        action,
        entityType: owner === "retailer" ? "Retailer" : "Brand",
        entityId: id,
        diff: diff as object,
        ip: req.ip ?? null,
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
      },
    });
  }

  @Post("retailers/:id/logo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LOGO_MAX_BYTES, files: 1 } }))
  uploadRetailer(@Param() params: unknown, @UploadedFile() file: UploadedLogo | undefined, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminLogoResponse> {
    requireEditor(user);
    return this.upload("retailer", input("admin.retailers.logo.upload", "params", params).id, file, req);
  }

  @Delete("retailers/:id/logo")
  deleteRetailer(@Param() params: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminLogoResponse> {
    requireEditor(user);
    return this.remove("retailer", input("admin.retailers.logo.delete", "params", params).id, req);
  }

  @Post("brands/:id/logo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LOGO_MAX_BYTES, files: 1 } }))
  uploadBrand(@Param() params: unknown, @UploadedFile() file: UploadedLogo | undefined, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminLogoResponse> {
    requireEditor(user);
    return this.upload("brand", input("admin.brands.logo.upload", "params", params).id, file, req);
  }

  @Delete("brands/:id/logo")
  deleteBrand(@Param() params: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminLogoResponse> {
    requireEditor(user);
    return this.remove("brand", input("admin.brands.logo.delete", "params", params).id, req);
  }
}
