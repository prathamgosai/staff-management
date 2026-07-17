import { RatioBasedStrategy, RoleRatio, PredictionInputs, effectivePaxFromInputs, resolveEffectivePax, PEAK_TURNS_PER_SERVICE } from "./prediction-strategy";

const strat = new RatioBasedStrategy();

function roles(): RoleRatio[] {
  return [
    { positionId: "k", positionName: "Kitchen", category: "Kitchen", guestsPerStaff: 22, minStaff: 2, avgMonthlySalary: 20000 },
    { positionId: "s", positionName: "Service", category: "Service", guestsPerStaff: 18, minStaff: 1, avgMonthlySalary: 15000 },
    { positionId: "m", positionName: "Manager", category: "Management", guestsPerStaff: null, minStaff: 1, avgMonthlySalary: 40000 },
    { positionId: "x", positionName: "Unused", category: "General", guestsPerStaff: null, minStaff: 0, avgMonthlySalary: 10000 },
  ];
}

describe("prediction-strategy: effectivePax", () => {
  it("uses peak of lunch/dinner, else daily", () => {
    expect(effectivePaxFromInputs({ expectedLunchPax: 120, expectedDinnerPax: 200 })).toBe(200);
    expect(effectivePaxFromInputs({ expectedDailyPax: 350 })).toBe(350);
    expect(effectivePaxFromInputs({})).toBe(0);
  });

  it("reports where the pax figure came from", () => {
    expect(resolveEffectivePax({ expectedLunchPax: 120, expectedDinnerPax: 200 })).toEqual({ pax: 200, source: "peak_service" });
    expect(resolveEffectivePax({ expectedDailyPax: 350 })).toEqual({ pax: 350, source: "daily" });
    expect(resolveEffectivePax({})).toEqual({ pax: 0, source: "none" });
  });

  it("falls back to a seating estimate — seating used to be collected and ignored", () => {
    const r = resolveEffectivePax({ totalSeating: 60 });
    expect(r.source).toBe("seating_estimate");
    expect(r.pax).toBe(Math.ceil(60 * PEAK_TURNS_PER_SERVICE)); // 90
  });

  it("prefers stated pax over the seating estimate", () => {
    expect(resolveEffectivePax({ totalSeating: 60, expectedDinnerPax: 200 }).source).toBe("peak_service");
    expect(resolveEffectivePax({ totalSeating: 60, expectedDailyPax: 300 }).source).toBe("daily");
  });

  it("seating now changes the answer (the bug: it never did)", () => {
    const small = strat.predict({ totalSeating: 40 } as PredictionInputs, roles());
    const large = strat.predict({ totalSeating: 200 } as PredictionInputs, roles());
    expect(large.totalStaff).toBeGreaterThan(small.totalStaff);
  });
});

describe("prediction-strategy: revenue + labour cost", () => {
  it("avg bill now produces revenue and labour-cost % (it was discarded before)", () => {
    const out = strat.predict({ expectedDinnerPax: 200, expectedAvgBill: 700 } as PredictionInputs, roles());
    expect(out.monthlyRevenue).toBe(200 * 700 * 30); // 4,200,000
    expect(out.laborCostPct).toBeCloseTo(Math.round((out.monthlyPayroll / (200 * 700 * 30)) * 1000) / 10, 5);
    expect(out.laborCostPct).toBeGreaterThan(0);
  });

  it("no avg bill -> no revenue and no percentage, rather than a zero", () => {
    const out = strat.predict({ expectedDinnerPax: 200 } as PredictionInputs, roles());
    expect(out.monthlyRevenue).toBeNull();
    expect(out.laborCostPct).toBeNull();
  });

  it("withholds labour-cost % when payroll is incomplete — a partial one reads too low", () => {
    const partial = roles().map((r) => (r.positionId === "s" ? { ...r, avgMonthlySalary: null } : r));
    const out = strat.predict({ expectedDinnerPax: 200, expectedAvgBill: 700 } as PredictionInputs, partial);
    expect(out.payrollComplete).toBe(false);
    expect(out.monthlyRevenue).not.toBeNull(); // revenue is still knowable
    expect(out.laborCostPct).toBeNull();
  });
});

describe("prediction-strategy: RatioBasedStrategy v1", () => {
  it("predicts headcount = max(ceil(pax/ratio), floor) and skips zero-need roles", () => {
    const out = strat.predict({ expectedDinnerPax: 220 } as PredictionInputs, roles());
    const byId = Object.fromEntries(out.roles.map((r) => [r.positionId, r.headcount]));
    expect(byId.k).toBe(10); // ceil(220/22)
    expect(byId.s).toBe(13); // ceil(220/18)=13
    expect(byId.m).toBe(1); // floor only (null ratio, min 1)
    expect(byId.x).toBeUndefined(); // null ratio + 0 floor → not predicted
    expect(out.strategyVersion).toBe("ratio-based-v1");
  });

  it("computes monthly payroll, department breakdown, cost-per-pax and productivity", () => {
    const out = strat.predict({ expectedDinnerPax: 220 } as PredictionInputs, roles());
    // 10*20000 + 13*15000 + 1*40000 = 200000 + 195000 + 40000 = 435000
    expect(out.monthlyPayroll).toBe(435000);
    expect(out.payrollComplete).toBe(true);
    expect(out.totalStaff).toBe(24);
    expect(out.paxPerStaff).toBeCloseTo(220 / 24, 1);
    expect(out.departmentBreakdown.find((d) => d.category === "Kitchen")!.headcount).toBe(10);
  });

  it("flags incomplete payroll when a needed role has no salary", () => {
    const r = roles();
    r[0].avgMonthlySalary = null; // Kitchen salary missing
    const out = strat.predict({ expectedDinnerPax: 220 } as PredictionInputs, r);
    expect(out.payrollComplete).toBe(false);
    expect(out.roles.find((x) => x.positionId === "k")!.monthlyCost).toBeNull();
  });

  it("EDGE: zero pax → only floors, no crash, costPerPax null when no payroll", () => {
    const out = strat.predict({} as PredictionInputs, roles());
    expect(out.effectivePax).toBe(0);
    expect(out.roles.find((r) => r.positionId === "k")!.headcount).toBe(2); // floor
    expect(out.paxPerStaff).toBeNull();
    expect(out.costPerPax).toBeNull();
  });
});
