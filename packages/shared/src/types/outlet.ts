import type { UUID, AuditFields, Address, ContactInfo, TimeString } from "./common";
import type { DayOfWeek as DayOfWeekEnum, OvertimePolicy } from "../constants/enums";

export interface OperatingHours {
  dayOfWeek: DayOfWeekEnum;
  openTime: TimeString;
  closeTime: TimeString;
  isClosed: boolean;
}

export interface HeadcountRequirement {
  departmentId: UUID;
  positionId: UUID;
  minCount: number;
  targetCount: number;
}

export interface OutletSettings {
  overtimePolicy: OvertimePolicy;
  overtimeThresholdHours: number;
  schedulePublishLeadDays: number;
  shiftSwapRequiresApproval: boolean;
  autoScheduleEnabled: boolean;
  forecastModel: string;
  laborCostTarget?: number;
  laborCostWarningPercent?: number;
}

export interface Outlet {
  id: UUID;
  tenantId: UUID;
  brandId: UUID;
  brand?: { name: string; logoUrl?: string };
  code: string;
  name: string;
  type: "dine_in" | "quick_service" | "cafe" | "cloud_kitchen" | "bar" | "other";
  address: Address;
  contact: ContactInfo;
  seatingCapacity?: number;
  operatingHours: OperatingHours[];
  headcountRequirements: HeadcountRequirement[];
  settings: OutletSettings;
  isActive: boolean;
  openDate?: string;
}

export type OutletSummary = Pick<
  Outlet,
  "id" | "code" | "name" | "type" | "brandId" | "isActive"
> & { brandName?: string };

export interface CreateOutletDto {
  brandId: UUID;
  code: string;
  name: string;
  type: Outlet["type"];
  address: Address;
  contact: ContactInfo;
  seatingCapacity?: number;
  operatingHours: OperatingHours[];
  settings?: Partial<OutletSettings>;
}

export interface UpdateOutletDto extends Partial<CreateOutletDto> {
  isActive?: boolean;
}
