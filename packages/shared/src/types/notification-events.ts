import type { NotificationChannel } from "../constants/enums";
import type { UUID, ISODateTime, DateString, TimeString } from "./common";

/**
 * Event catalogue for the automatic, role-based notification system.
 *
 * This is deliberately separate from the legacy string-union `NotificationEventType`
 * (types/notification.ts), which the older template-driven scaffold still uses.
 * The new system is user-centric: `notificationService.emit(event, payload)` resolves
 * recipients from the event payload + server-side outlet scope, writes one in-app
 * `notifications` row per recipient, and enqueues external-channel jobs.
 *
 * Recipient matrix (super_admin receives ONLY SYSTEM_ALERT + ACCOUNT_PENDING_APPROVAL):
 *   ROSTER_PUBLISHED         → each rostered staff (own week summary) + outlet head
 *   SHIFT_CHANGED            → affected staff + outlet head           (published weeks only)
 *   SHIFT_REMINDER           → the staff member
 *   LEAVE_REQUESTED          → requester (confirmation) + approver head + hr/admin
 *   LEAVE_DECIDED            → requester (decision) + outlet head
 *   ACCOUNT_PENDING_APPROVAL → hr/admin/super_admin
 *   SYSTEM_ALERT             → hr/admin/super_admin
 */
export enum NotificationEvent {
  ROSTER_PUBLISHED = "roster_published",
  SHIFT_CHANGED = "shift_changed",
  SHIFT_REMINDER = "shift_reminder",
  LEAVE_REQUESTED = "leave_requested",
  LEAVE_DECIDED = "leave_decided",
  ACCOUNT_PENDING_APPROVAL = "account_pending_approval",
  SYSTEM_ALERT = "system_alert",
}

// Delivery channels use the canonical `NotificationChannel` enum from
// constants/enums (WHATSAPP | EMAIL | IN_APP | SMS), already exported at the
// package root. IN_APP is always written; WHATSAPP/EMAIL are best-effort fan-out.

// ── Per-event payloads ────────────────────────────────────────────────────────
// A payload describes WHAT happened (domain facts). The notification service
// derives the recipient set from it — the caller never supplies recipient ids.
// `weekKey` is the local-Monday week key (YYYY-MM-DD) shared by frontend/backend.

export interface RosterPublishedPayload {
  tenantId: UUID;
  outletId: UUID;
  weekKey: DateString;
  scheduleId?: UUID;
  publishedBy: UUID; // user id
}

export interface ShiftChangedPayload {
  tenantId: UUID;
  outletId: UUID;
  staffId: UUID; // the affected staff member
  weekKey: DateString;
  shiftDate: DateString;
  startTime: TimeString;
  endTime: TimeString;
  shiftName?: string;
  changedBy?: UUID; // user id
  // Set on a bulk template-retime that touches many staff, so the outlet head is
  // notified per-staff only for single moves — not spammed once per affected staff.
  suppressHead?: boolean;
}

export interface ShiftReminderPayload {
  tenantId: UUID;
  outletId: UUID;
  staffId: UUID;
  shiftId: UUID; // used to make the nightly reminder idempotent (user+shift)
  shiftDate: DateString;
  startTime: TimeString;
  endTime: TimeString;
  shiftName?: string;
}

export interface LeaveRequestedPayload {
  tenantId: UUID;
  outletId: UUID;
  leaveRequestId: UUID;
  staffId: UUID; // requester's staff record
  requesterName: string;
  startDate: DateString;
  endDate: DateString;
  leaveTypeName?: string;
}

export interface LeaveDecidedPayload {
  tenantId: UUID;
  outletId: UUID;
  leaveRequestId: UUID;
  staffId: UUID; // requester's staff record
  decision: "approved" | "rejected";
  startDate: DateString;
  endDate: DateString;
  decidedBy?: UUID; // user id of the reviewer
}

export interface AccountPendingApprovalPayload {
  tenantId: UUID;
  pendingUserId: UUID;
  name: string;
  email: string;
  ticketNumber?: string;
}

export interface SystemAlertPayload {
  tenantId: UUID;
  title: string;
  message: string;
  outletId?: UUID;
}

/** Maps each event to its payload type, enabling a type-safe `emit(event, payload)`. */
export interface NotificationPayloadMap {
  [NotificationEvent.ROSTER_PUBLISHED]: RosterPublishedPayload;
  [NotificationEvent.SHIFT_CHANGED]: ShiftChangedPayload;
  [NotificationEvent.SHIFT_REMINDER]: ShiftReminderPayload;
  [NotificationEvent.LEAVE_REQUESTED]: LeaveRequestedPayload;
  [NotificationEvent.LEAVE_DECIDED]: LeaveDecidedPayload;
  [NotificationEvent.ACCOUNT_PENDING_APPROVAL]: AccountPendingApprovalPayload;
  [NotificationEvent.SYSTEM_ALERT]: SystemAlertPayload;
}

export type NotificationPayload = NotificationPayloadMap[NotificationEvent];

// ── Stored / API shapes ───────────────────────────────────────────────────────

/** One row of the in-app `notifications` table (migration 012), camelCased. */
export interface NotificationRecord {
  id: UUID;
  tenantId: UUID;
  userId: UUID;
  type: NotificationEvent;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelsSent: NotificationChannel[];
  readAt: ISODateTime | null;
  createdAt: ISODateTime;
}

/** Per-user channel toggles (migration 012 `notification_preferences`, user_id PK). */
export interface NotificationChannelPrefs {
  userId: UUID;
  inAppEnabled: boolean;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
}

export interface UnreadCountResponse {
  count: number;
}
