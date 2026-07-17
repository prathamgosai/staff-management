/**
 * Staff Predictor engine (Feature 5) — pluggable strategy so smarter, data-driven formulas can
 * replace v1 without touching the API/UI. PURE: no DB, no I/O. Unit-tested directly.
 */

export interface PredictionInputs {
  categoryName?: string;
  /** Falls back to a pax estimate when no pax figure is given (see PEAK_TURNS_PER_SERVICE). */
  totalSeating?: number;
  expectedLunchPax?: number;
  expectedDinnerPax?: number;
  expectedDailyPax?: number;
  /** Average bill per guest. Drives expected revenue and labour-cost %. */
  expectedAvgBill?: number;
}

/** A candidate role with its resolved ratio (template→company default) + average salary. */
export interface RoleRatio {
  positionId: string;
  positionName: string;
  category: string;
  guestsPerStaff: number | null;
  minStaff: number;
  avgMonthlySalary: number | null;
}

export interface PredictedRole {
  positionId: string;
  positionName: string;
  category: string;
  headcount: number;
  monthlyCost: number | null;
}

/** Where effectivePax came from — shown to the user so an estimate never reads as a given. */
export type PaxSource = "peak_service" | "daily" | "seating_estimate" | "none";

export interface PredictionOutputs {
  strategyVersion: string;
  effectivePax: number;
  paxSource: PaxSource;
  roles: PredictedRole[];
  totalStaff: number;
  departmentBreakdown: { category: string; headcount: number; monthlyCost: number | null }[];
  monthlyPayroll: number;
  payrollComplete: boolean; // false when some predicted role has no salary configured
  costPerPax: number | null;
  paxPerStaff: number | null;
  /** Null unless an average bill was given. */
  monthlyRevenue: number | null;
  /**
   * Payroll as a share of revenue — the number a restaurant owner actually manages against.
   * Null unless both an average bill and a complete payroll are available; a percentage
   * computed from a partial payroll would read low and mislead.
   */
  laborCostPct: number | null;
}

export interface PredictionStrategy {
  readonly version: string;
  predict(inputs: PredictionInputs, roles: RoleRatio[]): PredictionOutputs;
}

/**
 * Guests the peak service must be staffed for, and where that number came from.
 *
 * Preference order is most-specific-first: a stated peak service beats a daily total, which
 * beats an estimate derived from seating.
 */
export function resolveEffectivePax(inputs: PredictionInputs): { pax: number; source: PaxSource } {
  const peak = Math.max(inputs.expectedLunchPax ?? 0, inputs.expectedDinnerPax ?? 0);
  if (peak > 0) return { pax: peak, source: "peak_service" };
  if ((inputs.expectedDailyPax ?? 0) > 0) return { pax: inputs.expectedDailyPax as number, source: "daily" };
  // Seating is the last resort: it was previously collected and ignored, so a planner who
  // knew only their seat count got a silent zero back. An estimate the UI labels as an
  // estimate beats both a zero and an invisible assumption.
  if ((inputs.totalSeating ?? 0) > 0) {
    return { pax: Math.ceil((inputs.totalSeating as number) * PEAK_TURNS_PER_SERVICE), source: "seating_estimate" };
  }
  return { pax: 0, source: "none" };
}

/** Back-compat wrapper for callers that only need the number. */
export function effectivePaxFromInputs(inputs: PredictionInputs): number {
  return resolveEffectivePax(inputs).pax;
}

/**
 * Seat turns during ONE peak service, used only when no pax figure is supplied.
 * ASSUMPTION, not measured: 1.5 sittings across a 2.5h lunch or 5h dinner service. Adjust
 * once real hourly pax exists — pax_data currently carries a single hour bucket per day, so
 * there is nothing to calibrate this against.
 */
export const PEAK_TURNS_PER_SERVICE = 1.5;

/** Assumed operating days per month for the cost-per-pax denominator (config-free heuristic). */
export const OPERATING_DAYS_PER_MONTH = 30;

export class RatioBasedStrategy implements PredictionStrategy {
  readonly version = "ratio-based-v1";

  predict(inputs: PredictionInputs, roles: RoleRatio[]): PredictionOutputs {
    const { pax: effectivePax, source: paxSource } = resolveEffectivePax(inputs);

    const predicted: PredictedRole[] = [];
    for (const r of roles) {
      const hasRatio = r.guestsPerStaff != null && r.guestsPerStaff > 0;
      const demand = hasRatio ? Math.ceil(effectivePax / (r.guestsPerStaff as number)) : 0;
      const headcount = Math.max(demand, r.minStaff);
      if (headcount <= 0) continue; // role not needed at this pax
      const monthlyCost = r.avgMonthlySalary != null ? headcount * r.avgMonthlySalary : null;
      predicted.push({ positionId: r.positionId, positionName: r.positionName, category: r.category, headcount, monthlyCost });
    }

    const totalStaff = predicted.reduce((s, r) => s + r.headcount, 0);
    const monthlyPayroll = predicted.reduce((s, r) => s + (r.monthlyCost ?? 0), 0);
    const payrollComplete = predicted.every((r) => r.monthlyCost != null);

    // Department breakdown by staff-category.
    const byCat = new Map<string, { headcount: number; monthlyCost: number | null }>();
    for (const r of predicted) {
      const cur = byCat.get(r.category) ?? { headcount: 0, monthlyCost: 0 };
      cur.headcount += r.headcount;
      cur.monthlyCost = (cur.monthlyCost ?? 0) + (r.monthlyCost ?? 0);
      byCat.set(r.category, cur);
    }
    const departmentBreakdown = [...byCat.entries()].map(([category, v]) => ({ category, headcount: v.headcount, monthlyCost: v.monthlyCost }));

    // Average bill × guests × operating days. Previously collected and discarded.
    const avgBill = inputs.expectedAvgBill ?? 0;
    const monthlyRevenue = avgBill > 0 && effectivePax > 0
      ? Math.round(effectivePax * avgBill * OPERATING_DAYS_PER_MONTH)
      : null;

    return {
      strategyVersion: this.version,
      effectivePax,
      paxSource,
      roles: predicted,
      totalStaff,
      departmentBreakdown,
      monthlyPayroll,
      payrollComplete,
      costPerPax: effectivePax > 0 && monthlyPayroll > 0
        ? Math.round((monthlyPayroll / (effectivePax * OPERATING_DAYS_PER_MONTH)) * 100) / 100
        : null,
      paxPerStaff: totalStaff > 0 && effectivePax > 0 ? Math.round((effectivePax / totalStaff) * 10) / 10 : null,
      monthlyRevenue,
      // Only when payroll is complete: a percentage built from a partial payroll understates
      // labour cost, which is the one direction that would encourage overstaffing.
      laborCostPct: monthlyRevenue && monthlyRevenue > 0 && payrollComplete && monthlyPayroll > 0
        ? Math.round((monthlyPayroll / monthlyRevenue) * 1000) / 10
        : null,
    };
  }
}
