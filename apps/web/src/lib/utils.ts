import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, startOfWeek, addDays } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Rupees, whole-number. The app is INR throughout — never format money by hand. */
export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export function formatDate(date: string | Date, fmt = "dd MMM yyyy"): string {
  try {
    const d = typeof date === "string" ? parseISO(date) : date;
    return format(d, fmt);
  } catch {
    return String(date).substring(0, 10);
  }
}

export function formatTime(time: string): string {
  if (!time) return "-";
  if (time.length === 5) return time; // already HH:mm
  try {
    return format(parseISO(`2000-01-01T${time}`), "h:mm a");
  } catch {
    return time;
  }
}

export function getWeekDates(weekStartDate: string): Date[] {
  const start = parseISO(weekStartDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getMondayOfWeek(date: Date = new Date()): string {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

export function toLocalDateStr(d: Date | string): string {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(d).substring(0, 10);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "active":
    case "approved":
    case "present":
      return "success";
    case "inactive":
    case "rejected":
    case "absent":
      return "danger";
    case "pending":
    case "late":
      return "warning";
    case "on_leave":
    case "half_day":
      return "info";
    default:
      return "neutral";
  }
}

export function employmentTypeLabel(type: string): string {
  const map: Record<string, string> = {
    full_time: "Full Time",
    part_time: "Part Time",
    contract: "Contract",
  };
  return map[type] || type;
}

export function truncate(str: string, max = 30): string {
  return str.length > max ? str.substring(0, max) + "…" : str;
}
