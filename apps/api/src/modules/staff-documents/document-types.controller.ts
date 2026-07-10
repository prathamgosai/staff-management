import {
  Controller, Get, Post, Put, Delete, Body, Param,
  UseGuards, ParseUUIDPipe, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { StaffDocumentsService } from "./staff-documents.service";
import { UpsertDocumentTypeDto } from "./dto/document-type.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

/**
 * Document-type lookup management (HR). GET is auth-only (the upload UI needs the list);
 * writes are authorized in-service by staff:documents.
 */
@ApiTags("Document Types")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("settings/document-types")
export class DocumentTypesController {
  constructor(private readonly service: StaffDocumentsService) {}

  @Get()
  @ApiOperation({ summary: "List document types (lookup)" })
  list(@CurrentUser() user: AuthUser) {
    return this.service.listTypes(user);
  }

  @Post()
  @ApiOperation({ summary: "Add a document type (staff:documents)" })
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertDocumentTypeDto) {
    return this.service.createType(user, dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a document type (staff:documents)" })
  update(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpsertDocumentTypeDto) {
    return this.service.updateType(user, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Deactivate/soft-delete a document type (staff:documents)" })
  remove(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.deleteType(user, id);
  }
}
