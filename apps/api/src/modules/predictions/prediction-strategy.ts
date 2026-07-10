/**
 * Staff Predictor engine (Feature 5) — pluggable strategy so smarter, data-driven formulas can
 * replace v1 without touching the API/UI. PURE: no DB, no I/O. Unit-tested directly.
 */

export interface PredictionInputs {
  categoryName?: string;
  areaSqft?: number;
  totalSeating?: number;
  expectedLunchPax?: number;
  expectedDinnerPax?: number;
  expectedDailyPax?: number;
  expectedAvgBill?: number;
  operatingHours?: string;
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

export interface PredictionOutputs {
  strategyVersion: string;
  effectivePax: number;
  roles: PredictedRole[];
  totalStaff: number;
  departmentBreakdown: { category: string; headcount: number; monthlyCost: number | null }[];
  monthlyPayroll: number;
  payrollComplete: boolean; // false when some predicted role has no salary configured
  costPerPax: number | null;
  paxPerStaff: number | null;
}

export interface PredictionStrategy {
  readonly version: string;
  predict(inputs: PredictionInputs, roles: RoleRatio[]): PredictionOutputs;
}

/** Peak of lunch/dinner, else expected daily pax. */
export function effectivePaxFromInputs(inputs: PredictionInputs): number {
  const peak = Math.max(inputs.expectedLunchPax ?? 0, inputs.expectedDinnerPax ?? 0);
  if (peak > 0) return peak;
  return inputs.expectedDailyPax ?? 0;
}

/** Assumed operating days per month for the cost-per-pax denominator (config-free heuristic). */
export const OPERATING_DAYS_PER_MONTH = 30;

export class RatioBasedStrategy implements PredictionStrategy {
  readonly version = "ratio-based-v1";

  predict(inputs: PredictionInputs, roles: RoleRatio[]): PredictionOutputs {
    const effectivePax = effectivePaxFromInputs(inputs);

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

    return {
      strategyVersion: this.version,
      effectivePax,
      roles: predicted,
      totalStaff,
      departmentBreakdown,
      monthlyPayroll,
      payrollComplete,
      costPerPax: effectivePax > 0 && monthlyPayroll > 0
        ? Math.round((monthlyPayroll / (effectivePax * OPERATING_DAYS_PER_MONTH)) * 100) / 100
        : null,
      paxPerStaff: totalStaff > 0 && effectivePax > 0 ? Math.round((effectivePax / totalStaff) * 10) / 10 : null,
    };
  }
}
