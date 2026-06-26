import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { WhatsAppProvider } from "./providers/whatsapp.provider";
import { EmailProvider } from "./providers/email.provider";
import { NotificationProcessor } from "./notification.processor";

@Module({
  imports: [
    BullModule.registerQueue({ name: "notifications" }),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, WhatsAppProvider, EmailProvider, NotificationProcessor],
  exports: [NotificationService],
})
export class NotificationModule {}
