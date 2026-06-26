export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  outletIds: string[];
  tenantId: string;
  avatarUrl: string | null;
}

export interface AuthResponse {
  data: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Outlet {
  id: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  managerName?: string;
  staffCount?: number;
  isActive?: boolean;
}

export interface Staff {
  id: string;
  employeeId: string;
  name: string;
  phone: string;
  whatsapp?: string | null;
  avatarUrl?: string | null;
  primaryOutletId: string;
  currentOutletId: string;
  outletName: string;
  departmentId: string;
  departmentName: string;
  positionId: string;
  positionName: string;
  employmentType: "full_time" | "part_time" | "contract";
  employmentStatus: "active" | "inactive" | "on_leave";
  joinDate: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface LeaveType {
  id: string;
  type: string;
  name: string;
  annual_entitlement: string;
  carry_forward_max: string;
  requires_approval: boolean;
  is_paid: boolean;
  is_active: boolean;
}

export interface LeaveRequest {
  id: string;
  staff_id: string;
  staffName?: string;
  leave_type_id: string;
  leaveTypeName?: string;
  start_date: string;
  end_date: string;
  total_days: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  applied_at: string;
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  outletId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: "present" | "absent" | "late" | "half_day";
  hoursWorked?: number;
}

export interface RosterShift {
  date: string;
  staffId: string;
  staffName: string;
  departmentName: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  outletId: string;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  durationHours: number;
}

export interface AllocationEntry {
  staffId: string;
  staffName: string;
  employeeId: string;
  fromOutletId: string;
  fromOutletName: string;
  toOutletId?: string;
  toOutletName?: string;
  departmentName: string;
  status: "allocated" | "pending_transfer" | "transferred";
}

export interface DashboardStats {
  totalStaff: number;
  activeStaff: number;
  presentToday: number;
  onLeave: number;
  pendingLeaveRequests: number;
  attendanceRate: number;
}
