import {
  Bell, CalendarCheck, CalendarOff, Clock, AlarmClock,
  UserRound, AlertTriangle, type LucideIcon,
} from "lucide-react";

/** Icon + chip colour for a notification type. Uses semantic tokens (light/dark safe). */
export function notificationVisual(type: string): { Icon: LucideIcon; chip: string } {
  switch (type) {
    case "roster_published":
      return { Icon: CalendarCheck, chip: "bg-primary/15 text-primary" };
    case "shift_changed":
      return { Icon: Clock, chip: "bg-warning/15 text-warning" };
    case "shift_reminder":
      return { Icon: AlarmClock, chip: "bg-info/15 text-info" };
    case "leave_requested":
      return { Icon: CalendarOff, chip: "bg-info/15 text-info" };
    case "leave_decided":
      return { Icon: CalendarCheck, chip: "bg-success/15 text-success" };
    case "account_pending_approval":
      return { Icon: UserRound, chip: "bg-warning/15 text-warning" };
    case "system_alert":
      return { Icon: AlertTriangle, chip: "bg-danger/15 text-danger" };
    default:
      return { Icon: Bell, chip: "bg-muted text-muted-foreground" };
  }
}
