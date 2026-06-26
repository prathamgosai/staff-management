import type { AttendanceStatus } from "../constants/enums";
import type { UUID, DateString, ISODateTime } from "./common";

export interface AttendanceRecord {
  id: UUID;
  staffId: UUID;
  outletId: UUID;
  shiftId?: UUID;
  date: DateString;
  clockIn?: ISODateTime;
  clockOut?: ISODateTime;
  breakMinutes: number;
  regularHours: number;
  overtimeHours: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  status: AttendanceStatus;
  clockInMethod: "manual" | "biometric" | "qr_code" | "mobile_gps";
  clockOutMethod?: "manual" | "biometric" | "qr_code" | "mobile_gps";
  gpsLocation?: { lat: number; lng: number };
  verifiedBy?: UUID;
  verifiedAt?: ISODateTime;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AttendanceSummary {
  staffId: UUID;
  period: { startDate: DateString; endDate: DateString };
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalLateMinutes: number;
  attendanceRate: number;
}

export interface ClockInRequest {
  staffId: UUID;
  outletId: UUID;
  shiftId?: UUID;
  method: AttendanceRecord["clockInMethod"];
  gpsLocation?: { lat: number; lng: number };
  notes?: string;
}

export interface ClockOutRequest {
  attendanceId: UUID;
  method: AttendanceRecord["clockOutMethod"];
  gpsLocation?: { lat: number; lng: number };
  notes?: string;
}

export interface AttendanceCorrection {
  id: UUID;
  attendanceId: UUID;
  requestedBy: UUID;
  originalClockIn?: ISODateTime;
  originalClockOut?: ISODateTime;
  correctedClockIn?: ISODateTime;
  correctedClockOut?: ISODateTime;
  reason: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: UUID;
  approvedAt?: ISODateTime;
}

export interface OvertimeRequest {
  id: UUID;
  staffId: UUID;
  date: DateString;
  estimatedHours: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: UUID;
}
