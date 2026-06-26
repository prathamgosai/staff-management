import type { LeaveStatus, LeaveType } from "../constants/enums";
import type { UUID, DateString, ISODateTime } from "./common";

export interface LeaveTypeConfig {
  id: UUID;
  tenantId: UUID;
  type: LeaveType;
  name: string;
  annualEntitlement: number;
  carryForwardMax?: number;
  requiresApproval: boolean;
  requiresDocument: boolean;
  minNoticeDays?: number;
  isPaid: boolean;
  isActive: boolean;
}

export interface LeaveBalance {
  id: UUID;
  staffId: UUID;
  leaveTypeId: UUID;
  leaveType?: LeaveTypeConfig;
  year: number;
  entitlement: number;
  taken: number;
  pending: number;
  balance: number;
  carryForward: number;
}

export interface LeaveRequest {
  id: UUID;
  staffId: UUID;
  staff?: { name: string; employeeId: string; outletId: UUID };
  leaveTypeId: UUID;
  leaveType?: LeaveTypeConfig;
  startDate: DateString;
  endDate: DateString;
  totalDays: number;
  halfDayOption?: "am" | "pm";
  reason?: string;
  documentUrl?: string;
  status: LeaveStatus;
  appliedAt: ISODateTime;
  reviewedBy?: UUID;
  reviewedAt?: ISODateTime;
  reviewNotes?: string;
  cancelledAt?: ISODateTime;
  cancelReason?: string;
}

export interface CreateLeaveRequestDto {
  leaveTypeId: UUID;
  startDate: DateString;
  endDate: DateString;
  halfDayOption?: "am" | "pm";
  reason?: string;
  documentUrl?: string;
}

export interface ApproveLeaveDto {
  action: "approve" | "reject";
  notes?: string;
}

export interface LeaveCalendarEntry {
  staffId: UUID;
  staffName: string;
  outletId: UUID;
  startDate: DateString;
  endDate: DateString;
  leaveType: LeaveType;
  status: LeaveStatus;
}

export interface LeaveReport {
  outletId: UUID;
  period: { startDate: DateString; endDate: DateString };
  byType: Record<LeaveType, { count: number; totalDays: number }>;
  topAbsentees: Array<{ staffId: UUID; name: string; days: number }>;
  approvalRate: number;
}
