import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { WhatsAppProvider } from "./providers/whatsapp.provider";
import { EmailProvider } from "./providers/email.provider";
import { NotificationProcessor } from "./notification.processor";
import { ReminderScheduler } from "./notification.reminder";
import { PublicModule } from "../public/public.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: "notifications" }),
    PublicModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, WhatsAppProvider, EmailProvider, NotificationProcessor, ReminderScheduler],
  exports: [NotificationService],
})
export class NotificationModule {}
