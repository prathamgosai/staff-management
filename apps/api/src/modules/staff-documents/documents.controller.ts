import {
  Controller, Get, Post, Param, Query, Res, Ip, Headers,
  UseGuards, ParseUUIDPipe,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { StaffDocumentsService, AuditCtx } from "./staff-documents.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Document-centric endpoints (not staff-scoped in the path). Authorization happens inside the
 * service (owner-or-permission / documents:reveal / documents:status) so that even DENIED
 * attempts (e.g. an unauthorized reveal) are audit-logged rather than rejected at the guard.
 * `:id/file` is intentionally UNGUARDED — it is reached only with a short-lived signed HMAC
 * token, which is the authorization for that route.
 */
@ApiTags("Documents")
@Controller("documents")
export class DocumentsController {
  constructor(private readonly service: StaffDocumentsService) {}
  private ctx(ip?: string, ua?: string): AuditCtx {
    return { ip, userAgent: ua };
  }

  @Get("expiring")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Documents expiring within N days (documents:status, outlet-scoped)" })
  @ApiQuery({ name: "days", required: false, example: 30 })
  expiring(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
    const n = Math.min(Math.max(Number(days) || 30, 1), 365);
    return this.service.expiring(user, n);
  }

  @Get("missing")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Active staff missing a mandatory (or specified) document type" })
  @ApiQuery({ name: "type", required: false, example: "aadhaar" })
  @ApiQuery({ name: "search", required: false, description: "Partial staff-name match (case-insensitive)" })
  @ApiQuery({ name: "brandId", required: false, description: "Restaurant (brand) filter" })
  @ApiQuery({ name: "outletId", required: false })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({ name: "limit", required: false, example: 20 })
  missing(
    @CurrentUser() user: AuthUser,
    @Query("type") type?: string,
    @Query("search") search?: string,
    @Query("brandId") brandId?: string,
    @Query("outletId") outletId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.missing(user, {
      typeKey: type,
      search,
      brandId,
      outletId,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  @Get("widgets")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Dashboard widgets: expiring-30, missing-mandatory count, recently uploaded" })
  widgets(@CurrentUser() user: AuthUser) {
    return this.service.widgets(user);
  }

  @Get(":id/versions")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Version history for a document" })
  versions(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.listVersions(user, id);
  }

  @Get(":id/download")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "Issue a short-lived signed download URL (rate-limited, audited)" })
  download(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Ip() ip: string,
    @Headers("user-agent") ua: string,
  ) {
    return this.service.issueDownloadUrl(user, id, this.ctx(ip, ua));
  }

  @Post(":id/reveal-number")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Reveal a full document number (documents:reveal; audited, incl. denials)" })
  reveal(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Ip() ip: string,
    @Headers("user-agent") ua: string,
  ) {
    return this.service.revealNumber(user, id, this.ctx(ip, ua));
  }

  @Get(":id/file")
  @Public() // signed HMAC token is the auth (see class doc) — exempt from the global JwtAuthGuard
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Token-gated file stream (no JWT — validated by the signed URL token)" })
  async file(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("token") token: string,
    @Res() res: Response,
  ) {
    const { mimeType, fileName, buffer } = await this.service.getContentByToken(id, token ?? "");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  }
}
