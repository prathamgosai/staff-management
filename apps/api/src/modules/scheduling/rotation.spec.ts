import { computeRotationPlan } from "./rotation";

const T = ["tA", "tB", "tC"]; // 3 template ids, in start-time order

describe("computeRotationPlan", () => {
  it("splits staff into 3 balanced groups (ceil for the first groups)", () => {
    const { groups } = computeRotationPlan(["1", "2", "3", "4", "5"], T, 0);
    // ceil(5/3) = 2 → [2,2,1]
    expect(groups.map((g) => g.length)).toEqual([2, 2, 1]);
    expect(groups[0]).toEqual(["1", "2"]);
    expect(groups[1]).toEqual(["3", "4"]);
    expect(groups[2]).toEqual(["5"]);
  });

  it("maps groups to templates and rotates by one each week", () => {
    expect(computeRotationPlan(["a"], T, 0).groupShiftMap).toEqual({ 0: "tA", 1: "tB", 2: "tC" });
    expect(computeRotationPlan(["a"], T, 1).groupShiftMap).toEqual({ 0: "tB", 1: "tC", 2: "tA" });
    expect(computeRotationPlan(["a"], T, 2).groupShiftMap).toEqual({ 0: "tC", 1: "tA", 2: "tB" });
    // wraps every 3 weeks
    expect(computeRotationPlan(["a"], T, 3).groupShiftMap).toEqual(computeRotationPlan(["a"], T, 0).groupShiftMap);
  });

  it("assigns every staff member their group's template", () => {
    const { staffTemplateId } = computeRotationPlan(["1", "2", "3"], T, 0);
    expect(staffTemplateId).toEqual({ "1": "tA", "2": "tB", "3": "tC" });
  });

  it("lets a valid pin override the staff member's rotation template", () => {
    // staff "1" is in group 0 (tA at wk 0) but pinned to tC.
    const { staffTemplateId } = computeRotationPlan(["1", "2", "3"], T, 0, [
      { staff_id: "1", template_id: "tC" },
    ]);
    expect(staffTemplateId["1"]).toBe("tC");
    expect(staffTemplateId["2"]).toBe("tB");
  });

  it("ignores a pin to a template not in this week's roster", () => {
    const { staffTemplateId } = computeRotationPlan(["1"], T, 0, [
      { staff_id: "1", template_id: "tZ" },
    ]);
    expect(staffTemplateId["1"]).toBe("tA"); // unchanged
  });

  it("ignores a pin for a staff member not rostered", () => {
    const plan = computeRotationPlan(["1"], T, 0, [{ staff_id: "999", template_id: "tB" }]);
    expect(plan.staffTemplateId["999"]).toBeUndefined();
    expect(plan.staffTemplateId["1"]).toBe("tA");
  });

  it("handles a single staff member", () => {
    const { groups, staffTemplateId } = computeRotationPlan(["only"], T, 0);
    expect(groups).toEqual([["only"], [], []]);
    expect(staffTemplateId).toEqual({ only: "tA" });
  });
});
