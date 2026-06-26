import type { EmploymentType, EmploymentStatus } from "../constants/enums";
import type { UUID, ISODateTime, DateString, AuditFields, Address, ContactInfo } from "./common";

export interface Brand {
  id: UUID;
  tenantId: UUID;
  name: string;
  logoUrl?: string;
  isActive: boolean;
}

export interface Position {
  id: UUID;
  tenantId: UUID;
  departmentId: UUID;
  name: string;
  level: number;
  minHeadcount?: number;
  defaultHoursPerWeek?: number;
}

export interface Department {
  id: UUID;
  outletId: UUID;
  name: string;
  headStaffId?: UUID;
  positions: Position[];
}

export interface StaffDocument {
  id: UUID;
  staffId: UUID;
  type: "ic" | "passport" | "work_permit" | "contract" | "certificate" | "other";
  name: string;
  fileUrl: string;
  expiryDate?: DateString;
  uploadedAt: ISODateTime;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface Staff {
  id: UUID;
  tenantId: UUID;
  employeeId: string;
  name: string;
  email?: string;
  phone: string;
  whatsapp?: string;
  avatarUrl?: string;
  nationalId?: string;
  passportNumber?: string;
  nationality?: string;
  dateOfBirth?: DateString;
  address?: Address;
  emergencyContact?: EmergencyContact;
  primaryOutletId: UUID;
  currentOutletId: UUID;
  departmentId: UUID;
  positionId: UUID;
  reportingManagerId?: UUID;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  joinDate: DateString;
  confirmationDate?: DateString;
  resignationDate?: DateString;
  lastWorkingDate?: DateString;
  baseSalary?: number;
  hourlyRate?: number;
  weeklyHours?: number;
  overtimeEligible: boolean;
  documents?: StaffDocument[];
}

export type StaffSummary = Pick<
  Staff,
  | "id"
  | "employeeId"
  | "name"
  | "phone"
  | "primaryOutletId"
  | "departmentId"
  | "positionId"
  | "employmentType"
  | "employmentStatus"
  | "avatarUrl"
>;

export interface CreateStaffDto {
  name: string;
  phone: string;
  email?: string;
  whatsapp?: string;
  primaryOutletId: UUID;
  departmentId: UUID;
  positionId: UUID;
  employmentType: EmploymentType;
  joinDate: DateString;
  baseSalary?: number;
  hourlyRate?: number;
  weeklyHours?: number;
  overtimeEligible?: boolean;
}

export interface UpdateStaffDto extends Partial<CreateStaffDto> {
  employmentStatus?: EmploymentStatus;
}

export interface StaffTransfer {
  id: UUID;
  staffId: UUID;
  fromOutletId: UUID;
  toOutletId: UUID;
  effectiveDate: DateString;
  endDate?: DateString;
  reason?: string;
  approvedBy?: UUID;
  status: "pending" | "approved" | "rejected" | "completed";
}
