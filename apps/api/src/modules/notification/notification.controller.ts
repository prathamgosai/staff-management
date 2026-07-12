import { Controller, Get, Patch, Post, Put, Body, Param, Query, UseGuards, ParseUUIDPipe, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { NotificationService } from "./notification.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";
import { UpdatePreferencesDto } from "./dto/notification.dto";

/**
 * The in-app notification centre + per-user channel preferences. Auth-only (any
 * valid JWT), NO special permission — every handler scopes strictly to
 * req.user.id inside the service. Nothing here trusts a client-supplied id.
 */
@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: "List my notifications (paginated, newest first)" })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({ name: "limit", required: false, example: 20 })
  list(@CurrentUser() user: AuthUser, @Query("page") page?: string, @Query("limit") limit?: string) {
    return this.notificationService.listOwn(user, Number(page) || 1, Number(limit) || 20);
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Count of my unread notifications (for the bell badge)" })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationService.unreadCount(user);
  }

  @Get("preferences")
  @ApiOperation({ summary: "My per-channel notification preferences" })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notificationService.getPreferences(user);
  }

  @Put("preferences")
  @ApiOperation({ summary: "Update my per-channel notification preferences" })
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdatePreferencesDto,
  ) {
    return this.notificationService.updatePreferences(user, body);
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark one of my notifications as read" })
  markRead(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.notificationService.markRead(user, id);
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark all my notifications as read" })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationService.markAllRead(user);
  }
}
