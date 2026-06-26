import type { NotificationChannel, NotificationStatus } from "../constants/enums";
import type { UUID, ISODateTime } from "./common";

export type NotificationEventType =
  | "schedule.published"
  | "schedule.changed"
  | "shift.assigned"
  | "shift.cancelled"
  | "shift.reminder"
  | "shift.swap.requested"
  | "shift.swap.approved"
  | "shift.swap.rejected"
  | "leave.applied"
  | "leave.approved"
  | "leave.rejected"
  | "leave.reminder"
  | "transfer.requested"
  | "transfer.approved"
  | "overtime.requested"
  | "overtime.approved"
  | "attendance.late"
  | "attendance.absent"
  | "document.expiry"
  | "birthday";

export interface NotificationTemplate {
  id: UUID;
  tenantId: UUID;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  language: string;
  subject?: string;
  bodyTemplate: string;
  isActive: boolean;
}

export interface NotificationLog {
  id: UUID;
  tenantId: UUID;
  recipientId: UUID;
  recipientPhone?: string;
  recipientEmail?: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  subject?: string;
  body: string;
  status: NotificationStatus;
  providerMessageId?: string;
  sentAt?: ISODateTime;
  deliveredAt?: ISODateTime;
  failureReason?: string;
  createdAt: ISODateTime;
}

export interface SendNotificationDto {
  recipientIds: UUID[];
  eventType: NotificationEventType;
  channels: NotificationChannel[];
  variables: Record<string, string>;
  scheduledAt?: ISODateTime;
}

export interface NotificationPreference {
  staffId: UUID;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  enabled: boolean;
}
