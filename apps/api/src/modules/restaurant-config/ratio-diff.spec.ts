import { diffRatios, ExistingRatio, RatioInput } from "./ratio-diff";

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";

function ex(entries: [string, ExistingRatio][]): Map<string, ExistingRatio> {
  return new Map(entries);
}

describe("ratio-diff: diffRatios", () => {
  it("flags a brand-new ratio (no prior value) with null old fields", () => {
    const changes = diffRatios(ex([]), [{ positionId: P1, guestsPerStaff: 18, minStaff: 1 }]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      positionId: P1, oldGuestsPerStaff: null, newGuestsPerStaff: 18, oldMinStaff: null, newMinStaff: 1,
    });
  });

  it("ignores rows that are unchanged", () => {
    const existing = ex([[P1, { guestsPerStaff: 18, minStaff: 1 }]]);
    const changes = diffRatios(existing, [{ positionId: P1, guestsPerStaff: 18, minStaff: 1 }]);
    expect(changes).toHaveLength(0);
  });

  it("captures old → new when guests-per-staff changes", () => {
    const existing = ex([[P1, { guestsPerStaff: 18, minStaff: 1 }]]);
    const changes = diffRatios(existing, [{ positionId: P1, guestsPerStaff: 22, minStaff: 1 }]);
    expect(changes[0]).toMatchObject({ oldGuestsPerStaff: 18, newGuestsPerStaff: 22 });
  });

  it("captures a min-staff-only change", () => {
    const existing = ex([[P1, { guestsPerStaff: 18, minStaff: 1 }]]);
    const changes = diffRatios(existing, [{ positionId: P1, guestsPerStaff: 18, minStaff: 2 }]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ oldMinStaff: 1, newMinStaff: 2 });
  });

  it("handles a mixed batch (one changed, one new, one unchanged)", () => {
    const existing = ex([
      [P1, { guestsPerStaff: 18, minStaff: 1 }],
      [P2, { guestsPerStaff: 45, minStaff: 1 }],
    ]);
    const incoming: RatioInput[] = [
      { positionId: P1, guestsPerStaff: 20, minStaff: 1 }, // changed
      { positionId: P2, guestsPerStaff: 45, minStaff: 1 }, // unchanged
      { positionId: "33333333-3333-3333-3333-333333333333", guestsPerStaff: 22, minStaff: 2 }, // new
    ];
    const changes = diffRatios(existing, incoming);
    expect(changes.map((c) => c.positionId).sort()).toEqual([P1, "33333333-3333-3333-3333-333333333333"].sort());
  });
});
