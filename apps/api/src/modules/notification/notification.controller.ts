import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { NotificationService } from "./notification.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "@workforceiq/shared";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post("send")
  send(
    @CurrentUser() user: AuthUser,
    @Body() body: { recipientIds: string[]; eventType: string; channels: string[]; variables: Record<string, string> },
  ) {
    return this.notificationService.send({ tenantId: user.tenantId, ...body });
  }

  @Get("logs")
  getLogs(@CurrentUser() user: AuthUser, @Query("recipientId") recipientId?: string) {
    return this.notificationService.getLogs(user.tenantId, recipientId);
  }

  @Get("preferences")
  getPreferences(@Query("staffId") staffId: string) {
    return this.notificationService.getPreferences(staffId);
  }

  @Post("preferences")
  upsertPreference(
    @Body() body: { staffId: string; channel: string; eventType: string; enabled: boolean },
  ) {
    return this.notificationService.upsertPreference(body.staffId, body.channel, body.eventType, body.enabled);
  }
}
