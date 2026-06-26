export enum EmploymentType {
  FULL_TIME = "full_time",
  PART_TIME = "part_time",
  CONTRACT = "contract",
  TEMPORARY = "temporary",
  INTERN = "intern",
}

export enum EmploymentStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ON_LEAVE = "on_leave",
  PROBATION = "probation",
  TERMINATED = "terminated",
  RESIGNED = "resigned",
}

export enum ShiftStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ACKNOWLEDGED = "acknowledged",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum AttendanceStatus {
  PRESENT = "present",
  ABSENT = "absent",
  LATE = "late",
  EARLY_DEPARTURE = "early_departure",
  ON_LEAVE = "on_leave",
  PUBLIC_HOLIDAY = "public_holiday",
  REST_DAY = "rest_day",
}

export enum LeaveStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
  WITHDRAWN = "withdrawn",
}

export enum LeaveType {
  ANNUAL = "annual",
  SICK = "sick",
  EMERGENCY = "emergency",
  MATERNITY = "maternity",
  PATERNITY = "paternity",
  UNPAID = "unpaid",
  REPLACEMENT = "replacement",
  HOSPITALIZATION = "hospitalization",
}

export enum ForecastModel {
  RULE_BASED = "rule_based",
  PROPHET = "prophet",
  XGBOOST = "xgboost",
  ENSEMBLE = "ensemble",
}

export enum ForecastHorizon {
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
}

export enum TransferType {
  PERMANENT = "permanent",
  TEMPORARY = "temporary",
  SECONDMENT = "secondment",
}

export enum TransferStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  COMPLETED = "completed",
}

export enum NotificationChannel {
  WHATSAPP = "whatsapp",
  EMAIL = "email",
  IN_APP = "in_app",
  SMS = "sms",
}

export enum NotificationStatus {
  QUEUED = "queued",
  SENT = "sent",
  DELIVERED = "delivered",
  FAILED = "failed",
  READ = "read",
}

export enum DayOfWeek {
  MONDAY = "monday",
  TUESDAY = "tuesday",
  WEDNESDAY = "wednesday",
  THURSDAY = "thursday",
  FRIDAY = "friday",
  SATURDAY = "saturday",
  SUNDAY = "sunday",
}

export enum OvertimePolicy {
  NONE = "none",
  PAID = "paid",
  TIME_OFF = "time_off",
  HYBRID = "hybrid",
}
