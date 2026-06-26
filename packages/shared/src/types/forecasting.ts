import type { ForecastModel, ForecastHorizon } from "../constants/enums";
import type { UUID, DateString, ISODateTime } from "./common";

export interface PaxDataPoint {
  outletId: UUID;
  date: DateString;
  hour: number;
  paxCount: number;
  revenue?: number;
  dayOfWeek: number;
  isPublicHoliday: boolean;
  weatherCondition?: string;
  specialEvent?: string;
  recordedAt: ISODateTime;
}

export interface DemandForecast {
  id: UUID;
  outletId: UUID;
  forecastDate: DateString;
  horizon: ForecastHorizon;
  model: ForecastModel;
  generatedAt: ISODateTime;
  hourlyForecasts: HourlyForecast[];
  dailySummary: DailyForecastSummary;
  confidence: number;
  accuracy?: number;
}

export interface HourlyForecast {
  hour: number;
  paxForecast: number;
  revenueForecast?: number;
  recommendedHeadcount: number;
  confidenceLower: number;
  confidenceUpper: number;
}

export interface DailyForecastSummary {
  totalPax: number;
  peakHour: number;
  peakPax: number;
  totalRevenue?: number;
  recommendedHeadcount: number;
  estimatedLaborCost?: number;
  laborCostPercent?: number;
}

export interface ForecastAccuracyReport {
  outletId: UUID;
  period: { startDate: DateString; endDate: DateString };
  model: ForecastModel;
  mape: number;
  rmse: number;
  r2Score: number;
  sampleCount: number;
}

export interface LaborRatioConfig {
  outletId: UUID;
  positionId: UUID;
  paxPerStaff: number;
  minStaff: number;
  maxStaff: number;
  peakMultiplier: number;
}

export interface SpecialEvent {
  id: UUID;
  outletId?: UUID;
  name: string;
  date: DateString;
  paxImpactMultiplier: number;
  notes?: string;
}

export interface PublicHoliday {
  id: UUID;
  country: string;
  state?: string;
  date: DateString;
  name: string;
  paxImpactMultiplier: number;
}

export interface ForecastRequest {
  outletId: UUID;
  startDate: DateString;
  endDate: DateString;
  horizon: ForecastHorizon;
  model?: ForecastModel;
  includeRecommendations?: boolean;
}
