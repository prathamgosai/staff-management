import { WA_TEMPLATES } from "./notification.constants";

/**
 * Per-recipient message variants. The same event renders differently for the
 * staff member vs. their outlet head (e.g. ROSTER_PUBLISHED = "your week is ready"
 * for staff, "published to N staff" for the head).
 */
export type RecipientKind =
  | "roster_self"
  | "roster_head"
  | "shift_self"
  | "shift_head"
  | "reminder_self"
  | "leave_confirm"
  | "leave_approver"
  | "leave_decided_self"
  | "leave_coverage"
  | "account_pending"
  | "system_alert";

export interface RenderedMessage {
  title: string;
  body: string;
  /** WhatsApp Utility template name, or null when this recipient gets in-app/email only. */
  waTemplate: string | null;
  /** Template body variables in order, EXCLUDING the leading {{1}} recipient name
   *  (the worker prepends the resolved name so it can differ from the in-app copy). */
  waVars: string[];
}

/** Loose context: the event payload fields plus any resolved extras (names/counts). */
type Ctx = Record<string, unknown>;

const s = (v: unknown, fallback = ""): string => (v === undefined || v === null ? fallback : String(v));

/**
 * Render the in-app title/body and (where applicable) the WhatsApp template call
 * for one recipient. Pure — all data is resolved by the caller and passed in ctx.
 */
export function renderMessage(kind: RecipientKind, ctx: Ctx): RenderedMessage {
  switch (kind) {
    case "roster_self": {
      const week = s(ctx.weekKey);
      const count = Number(ctx.shiftCount ?? 0);
      const summary = count === 1 ? "1 shift" : `${count} shifts`;
      const link = ctx.magicLink ? s(ctx.magicLink) : "";
      return {
        title: "Your roster is published",
        body: `Your duty roster for the week of ${week} is ready — ${summary} scheduled.${link ? ` View it: ${link}` : " Open the app to view your full week."}`,
        waTemplate: WA_TEMPLATES.rosterPublished,
        // Until a URL-button template is approved in Meta, the link degrades into the
        // summary variable so it still reaches WhatsApp recipients via the existing template.
        waVars: [week, link ? `${summary} — ${link}` : summary],
      };
    }
    case "roster_head": {
      const week = s(ctx.weekKey);
      const outlet = s(ctx.outletName, "your outlet");
      const staffCount = Number(ctx.staffCount ?? 0);
      return {
        title: "Roster published",
        body: `The roster for ${outlet} (week of ${week}) has been published to ${staffCount} staff.`,
        waTemplate: null,
        waVars: [],
      };
    }
    case "shift_self": {
      const date = s(ctx.shiftDate);
      const start = s(ctx.startTime);
      const end = s(ctx.endTime);
      const outlet = s(ctx.outletName, "your outlet");
      const named = ctx.shiftName ? ` (${s(ctx.shiftName)})` : "";
      return {
        title: "Your shift was updated",
        body: `Your shift on ${date} is now ${start}–${end}${named} at ${outlet}.`,
        waTemplate: WA_TEMPLATES.shiftUpdate,
        waVars: [date, start, end, outlet],
      };
    }
    case "shift_head": {
      const date = s(ctx.shiftDate);
      const start = s(ctx.startTime);
      const end = s(ctx.endTime);
      const who = s(ctx.staffName, "A staff member");
      return {
        title: "Shift changed",
        body: `${who}'s shift on ${date} was changed to ${start}–${end}.`,
        waTemplate: null,
        waVars: [],
      };
    }
    case "reminder_self": {
      const date = s(ctx.shiftDate);
      const start = s(ctx.startTime);
      const end = s(ctx.endTime);
      const outlet = s(ctx.outletName, "your outlet");
      return {
        title: "Shift reminder",
        body: `Reminder: you have a shift tomorrow (${date}) from ${start} to ${end} at ${outlet}.`,
        waTemplate: WA_TEMPLATES.shiftReminder,
        waVars: [date, start, end, outlet],
      };
    }
    case "leave_confirm": {
      const start = s(ctx.startDate);
      const end = s(ctx.endDate);
      return {
        title: "Leave request submitted",
        body: `Your leave request for ${start} to ${end} has been submitted and is awaiting approval.`,
        waTemplate: null,
        waVars: [],
      };
    }
    case "leave_approver": {
      const who = s(ctx.requesterName, "A staff member");
      const start = s(ctx.startDate);
      const end = s(ctx.endDate);
      return {
        title: "Leave request to review",
        body: `${who} has requested leave from ${start} to ${end}. Please review it.`,
        waTemplate: WA_TEMPLATES.leaveRequested,
        waVars: [who, start, end],
      };
    }
    case "leave_decided_self": {
      const start = s(ctx.startDate);
      const end = s(ctx.endDate);
      const decision = s(ctx.decision);
      return {
        title: `Leave ${decision}`,
        body: `Your leave request for ${start} to ${end} has been ${decision}.`,
        waTemplate: WA_TEMPLATES.leaveStatus,
        waVars: [start, end, decision],
      };
    }
    case "leave_coverage": {
      const who = s(ctx.requesterName, "A staff member");
      const start = s(ctx.startDate);
      const end = s(ctx.endDate);
      const decision = s(ctx.decision);
      return {
        title: "Leave decision",
        body: `${who}'s leave (${start} to ${end}) was ${decision} — plan coverage as needed.`,
        waTemplate: null,
        waVars: [],
      };
    }
    case "account_pending": {
      const name = s(ctx.name, "A new user");
      const email = s(ctx.email);
      const ticket = ctx.ticketNumber ? ` (ticket ${s(ctx.ticketNumber)})` : "";
      return {
        title: "New account pending approval",
        body: `${name}${email ? ` (${email})` : ""} registered and is awaiting approval${ticket}.`,
        waTemplate: null,
        waVars: [],
      };
    }
    case "system_alert": {
      return {
        title: s(ctx.title, "System alert"),
        body: s(ctx.message),
        waTemplate: null,
        waVars: [],
      };
    }
  }
}
