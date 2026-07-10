import { matchTransfers, OutletRoleVariance } from "./transfer-matcher";

function v(outletId: string, outletName: string, positionId: string, positionName: string, excess: number, shortage: number): OutletRoleVariance {
  return { outletId, outletName, positionId, positionName, excess, shortage };
}

describe("transfer-matcher: greedy matching", () => {
  it("moves surplus stewards to a shortage outlet (brief example)", () => {
    const recs = matchTransfers([
      v("surat", "Capiche Surat", "steward", "Steward", 4, 0),
      v("ambli", "AIKO Ambli", "steward", "Steward", 0, 2),
    ]);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ fromName: "Capiche Surat", toName: "AIKO Ambli", positionName: "Steward", headcount: 2 });
    // donor keeps 2 surplus, receiver fully covered → HIGH
    expect(recs[0].confidence).toBe("high");
    expect(recs[0].reason).toContain("Steward");
  });

  it("MEDIUM when a donor only partially fills a larger shortage", () => {
    const recs = matchTransfers([
      v("a", "A", "cook", "Cook", 2, 0),
      v("b", "B", "cook", "Cook", 0, 5),
    ]);
    expect(recs[0].headcount).toBe(2);
    expect(recs[0].confidence).toBe("medium"); // partial fill
  });

  it("MEDIUM when the donor empties its whole surplus (lands at green boundary)", () => {
    const recs = matchTransfers([
      v("a", "A", "cook", "Cook", 2, 0),
      v("b", "B", "cook", "Cook", 0, 2),
    ]);
    expect(recs[0].headcount).toBe(2);
    expect(recs[0].confidence).toBe("medium"); // donorExcessAfter === 0
  });

  it("distributes one donor across multiple receivers, never going below green", () => {
    const recs = matchTransfers([
      v("big", "Big", "server", "Server", 5, 0),
      v("r1", "R1", "server", "Server", 0, 3),
      v("r2", "R2", "server", "Server", 0, 4),
    ]);
    const total = recs.reduce((s, r) => s + r.headcount, 0);
    expect(total).toBe(5); // only 5 surplus available
    expect(recs.every((r) => r.fromName === "Big")).toBe(true);
  });

  it("emits nothing when there is no surplus or no shortage for a role", () => {
    expect(matchTransfers([v("a", "A", "cook", "Cook", 3, 0)])).toHaveLength(0); // no receiver
    expect(matchTransfers([v("b", "B", "cook", "Cook", 0, 3)])).toHaveLength(0); // no donor
  });

  it("matches strictly within the same role (never cross-role)", () => {
    const recs = matchTransfers([
      v("a", "A", "cook", "Cook", 3, 0),
      v("b", "B", "server", "Server", 0, 3),
    ]);
    expect(recs).toHaveLength(0);
  });
});
