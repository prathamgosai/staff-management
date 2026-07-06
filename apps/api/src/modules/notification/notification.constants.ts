/**
 * Notification module constants: the Bull queue/job names, retry policy, and the
 * WhatsApp Utility template names. The templates are created by hand in the Meta
 * WhatsApp Manager (see the manual steps in the task) — if the approved names
 * differ, override them via env without touching code.
 */

export const NOTIFICATIONS_QUEUE = "notifications";

/** External-channel fan-out job (WhatsApp -> email fallback) — one per recipient. */
export const DISPATCH_JOB = "dispatch";

/** Retry external sends with exponential backoff; never block the request path. */
export const DISPATCH_JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: true,
  removeOnFail: 200,
};

/** WhatsApp template names (env-overridable). Defaults match the task's manual step. */
export const WA_TEMPLATES = {
  rosterPublished: process.env.WA_TEMPLATE_ROSTER_PUBLISHED || "roster_published",
  shiftUpdate: process.env.WA_TEMPLATE_SHIFT_UPDATE || "shift_update",
  leaveStatus: process.env.WA_TEMPLATE_LEAVE_STATUS || "leave_status",
  leaveRequested: process.env.WA_TEMPLATE_LEAVE_REQUESTED || "leave_requested",
  shiftReminder: process.env.WA_TEMPLATE_SHIFT_REMINDER || "shift_reminder",
} as const;

/** BCP-47 language code the WhatsApp templates were approved in. */
export const WA_TEMPLATE_LANG = process.env.WA_TEMPLATE_LANG || "en";

// ── Nightly shift-reminder cron (Bull repeatable) ─────────────────────────────
/** Job name the repeatable fires; the processor handles it. */
export const REMINDER_CRON_JOB = "shift-reminder-cron";
/** Stable id so restarts re-register the SAME repeatable instead of stacking copies. */
export const REMINDER_JOB_ID = "shift-reminder-nightly";
/** 20:00 every day. tz pins it to Asia/Kolkata regardless of the server's TZ (Render=UTC). */
export const REMINDER_CRON = process.env.SHIFT_REMINDER_CRON || "0 20 * * *";
export const REMINDER_TZ = process.env.SHIFT_REMINDER_TZ || "Asia/Kolkata";
