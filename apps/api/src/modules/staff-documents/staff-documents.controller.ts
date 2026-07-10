import {
  Controller, Get, Post, Delete, Body, Param, Res, Ip, Headers,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import type { Response } from "express";
import { StaffDocumentsService, AuditCtx } from "./staff-documents.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Staff-scoped document endpoints. Reads have NO @RequirePermission so the guard passes them
 * through and the service authorizes (staff:documents OR the caller's own record); writes are
 * gated by staff:documents (admin/hr; super_admin via '*'). All access is audit-logged.
 */
@ApiTags("Staff Documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("staff/:staffId/documents")
export class StaffDocumentsController {
  constructor(private readonly service: StaffDocumentsService) {}

  private ctx(ip?: string, ua?: string): AuditCtx {
    return { ip, userAgent: ua };
  }

  @Get()
  @ApiOperation({ summary: "List a staff member's documents (metadata only, no file content)" })
  list(@CurrentUser() user: AuthUser, @Param("staffId", ParseUUIDPipe) staffId: string) {
    return this.service.list(user, staffId);
  }

  @Get(":docId/content")
  @ApiOperation({ summary: "Preview/download a document's file in-app (on-demand, decrypted)" })
  async content(
    @CurrentUser() user: AuthUser,
    @Param("staffId", ParseUUIDPipe) staffId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @Ip() ip: string,
    @Headers("user-agent") ua: string,
    @Res() res: Response,
  ) {
    const { mimeType, fileName, buffer } = await this.service.getContent(user, staffId, docId, this.ctx(ip, ua));
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  }

  @Post()
  @RequirePermission("staff:documents")
  @ApiOperation({ summary: "Upload a document (admin/hr). Re-uploading a type archives the prior file as a version." })
  create(
    @CurrentUser() user: AuthUser,
    @Param("staffId", ParseUUIDPipe) staffId: string,
    @Body() dto: CreateDocumentDto,
    @Ip() ip: string,
    @Headers("user-agent") ua: string,
  ) {
    return this.service.create(user, staffId, dto, this.ctx(ip, ua));
  }

  @Delete(":docId")
  @RequirePermission("staff:documents")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft-delete a document (admin/hr)" })
  remove(
    @CurrentUser() user: AuthUser,
    @Param("staffId", ParseUUIDPipe) staffId: string,
    @Param("docId", ParseUUIDPipe) docId: string,
    @Ip() ip: string,
    @Headers("user-agent") ua: string,
  ) {
    return this.service.remove(user, staffId, docId, this.ctx(ip, ua));
  }
}
