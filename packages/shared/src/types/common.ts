export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface AuditFields {
  createdAt: string; // ISO datetime
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface ContactInfo {
  phone?: string;
  whatsapp?: string;
  email?: string;
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

export interface TimeRange {
  startTime: string; // HH:mm
  endTime: string;
}

export type UUID = string;
export type ISODateTime = string;
export type DateString = string; // YYYY-MM-DD
export type TimeString = string; // HH:mm
