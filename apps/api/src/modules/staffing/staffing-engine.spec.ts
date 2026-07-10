import { computeStaffing, DEFAULT_THRESHOLDS, RoleInput } from "./staffing-engine";

const T = DEFAULT_THRESHOLDS; // tExcess=1, tMinor=0.15

function role(p: Partial<RoleInput> & { positionId: string }): RoleInput {
  return {
    guestsPerStaff: 20, minStaff: 0, current: 0, onLeave: 0, present: 0,
    transferredIn: 0, transferredOut: 0, ...p,
  };
}

describe("staffing-engine: required & status", () => {
  it("required = max(ceil(pax/guests), minStaff)", () => {
    const r = computeStaffing({ effectivePax: 220, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 22, minStaff: 1 })] });
    expect(r.roles[0].required).toBe(10); // ceil(220/22)
    const r2 = computeStaffing({ effectivePax: 10, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 22, minStaff: 3 })] });
    expect(r2.roles[0].required).toBe(3); // floor wins
  });

  it("GREEN when perfectly staffed within excess tolerance", () => {
    const r = computeStaffing({ effectivePax: 100, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 20, current: 5 })] }); // req 5, avail 5
    expect(r.roles[0].status).toBe("green");
    expect(r.status).toBe("green");
  });

  it("BLUE when excess exceeds tolerance", () => {
    const r = computeStaffing({ effectivePax: 100, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 20, current: 9 })] }); // req 5, avail 9, excess 4 > 1
    expect(r.roles[0].status).toBe("blue");
    expect(r.roles[0].excess).toBe(4);
  });

  it("YELLOW for a minor shortage, RED for a critical one", () => {
    // req 10, avail 9 → shortage 1, ratio 0.1 ≤ 0.15 → yellow
    const yellow = computeStaffing({ effectivePax: 200, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 20, current: 9 })] });
    expect(yellow.roles[0].status).toBe("yellow");
    // req 10, avail 4 → shortage 6, ratio 0.6 → red
    const red = computeStaffing({ effectivePax: 200, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 20, current: 4 })] });
    expect(red.roles[0].status).toBe("red");
  });
});

describe("staffing-engine: Edge-Case Gauntlet", () => {
  it("zero pax → required is just the floor, no crash", () => {
    const r = computeStaffing({ effectivePax: 0, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 20, minStaff: 2, current: 2 })] });
    expect(r.roles[0].required).toBe(2);
    expect(r.roles[0].status).toBe("green");
  });

  it("unconfigured outlet (effectivePax null) → UNCONFIGURED, never fake-green", () => {
    const r = computeStaffing({ effectivePax: null, thresholds: T, roles: [role({ positionId: "a", current: 3 })] });
    expect(r.status).toBe("unconfigured");
    expect(r.roles[0].status).toBe("unconfigured");
  });

  it("zero / null ratio and no floor → UNCONFIGURED, no divide-by-zero", () => {
    const zero = computeStaffing({ effectivePax: 200, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 0, current: 3 })] });
    expect(zero.roles[0].status).toBe("unconfigured");
    expect(Number.isFinite(zero.roles[0].required)).toBe(true);
    const nul = computeStaffing({ effectivePax: 200, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: null, current: 3 })] });
    expect(nul.roles[0].status).toBe("unconfigured");
  });

  it("null ratio WITH a floor is still sized (not unconfigured)", () => {
    const r = computeStaffing({ effectivePax: 200, thresholds: T, roles: [role({ positionId: "mgr", guestsPerStaff: null, minStaff: 1, current: 1 })] });
    expect(r.roles[0].required).toBe(1);
    expect(r.roles[0].status).toBe("green");
  });

  it("all staff on leave → available 0 → full shortage", () => {
    const r = computeStaffing({ effectivePax: 100, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 20, current: 5, onLeave: 5 })] });
    expect(r.roles[0].available).toBe(0);
    expect(r.roles[0].shortage).toBe(5);
    expect(r.roles[0].status).toBe("red");
  });

  it("no roles at all → unconfigured, zeroed totals", () => {
    const r = computeStaffing({ effectivePax: 100, thresholds: T, roles: [] });
    expect(r.status).toBe("unconfigured");
    expect(r.totals.required).toBe(0);
  });

  it("mixed outlet: a role short + a role in excess → net shortage wins (not green)", () => {
    const r = computeStaffing({
      effectivePax: 100, thresholds: T,
      roles: [
        role({ positionId: "kitchen", guestsPerStaff: 20, current: 2 }), // req 5, short 3
        role({ positionId: "service", guestsPerStaff: 10, current: 15 }), // req 10, excess 5
      ],
    });
    expect(r.totals.shortage).toBe(3);
    expect(r.totals.excess).toBe(5);
    expect(r.status).not.toBe("green");
    expect(["yellow", "red"]).toContain(r.status);
  });

  it("unmapped staff (unconfigured role) report headcount but never fake outlet excess/blue", () => {
    const r = computeStaffing({
      effectivePax: 100, thresholds: T,
      roles: [
        role({ positionId: "kitchen", guestsPerStaff: 20, current: 5 }), // req 5, avail 5 → green
        role({ positionId: "odc", guestsPerStaff: null, minStaff: 0, current: 8 }), // unconfigured
      ],
    });
    expect(r.roles.find((x) => x.positionId === "odc")!.excess).toBe(0);
    expect(r.totals.excess).toBe(0);
    expect(r.totals.current).toBe(13); // headcount still counts both
    expect(r.status).toBe("green");
  });

  it("vacant equals shortage; transfers/present are carried through as reporting", () => {
    const r = computeStaffing({ effectivePax: 200, thresholds: T, roles: [role({ positionId: "a", guestsPerStaff: 20, current: 6, present: 5, transferredIn: 2, transferredOut: 1 })] });
    expect(r.roles[0].vacant).toBe(r.roles[0].shortage);
    expect(r.totals.present).toBe(5);
    expect(r.totals.transferredIn).toBe(2);
    expect(r.totals.transferredOut).toBe(1);
  });
});
