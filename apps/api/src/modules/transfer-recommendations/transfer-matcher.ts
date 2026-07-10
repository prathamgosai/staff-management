/**
 * Intelligent Transfer Recommendation matcher (Feature 6) — PURE, deterministic. Greedy per-role
 * matching of surplus outlets to shortage outlets, never dropping a donor into shortage. The
 * matcher runs a CHAIN of pluggable scorers so future dimensions (skill, experience, distance,
 * shift, language) slot in without reworking the core loop. v1 ships the base role-identity scorer.
 */

export type Confidence = "high" | "medium" | "low";

/** Per-outlet, per-role surplus/shortage (from the staffing engine). */
export interface OutletRoleVariance {
  outletId: string;
  outletName: string;
  positionId: string;
  positionName: string;
  excess: number;
  shortage: number;
}

export interface Recommendation {
  fromOutletId: string;
  fromName: string;
  toOutletId: string;
  toName: string;
  positionId: string;
  positionName: string;
  headcount: number;
  confidence: Confidence;
  reason: string;
}

/** Context a scorer sees for one candidate move. */
export interface ScoreContext {
  positionName: string;
  qty: number;
  receiverShortageBefore: number;
  donorExcessAfter: number;
  roleIdentical: boolean;
}

export interface TransferScorer {
  readonly name: string;
  /** Return a confidence for this move, or null to defer to the next scorer / base logic. */
  score(ctx: ScoreContext): Confidence | null;
}

/** v1 base: role identity + coverage. Fully-covered receiver with a donor still in surplus = HIGH. */
export const RoleIdentityScorer: TransferScorer = {
  name: "role-identity",
  score(ctx) {
    if (!ctx.roleIdentical) return "low";
    const fullyCovers = ctx.qty >= ctx.receiverShortageBefore;
    if (fullyCovers && ctx.donorExcessAfter > 0) return "high";
    return "medium";
  },
};

function runScorers(ctx: ScoreContext, scorers: TransferScorer[]): Confidence {
  for (const s of scorers) {
    const c = s.score(ctx);
    if (c) return c;
  }
  return "medium";
}

/**
 * Greedy matcher. For each role: donors (excess>0, desc) → receivers (shortage>0, desc); move
 * min(donor.excess, receiver.shortage); a donor can give its whole surplus and still stay GREEN
 * (excess→0, no shortage). Deterministic ordering (excess/shortage desc, then name) for stable
 * regeneration.
 */
export function matchTransfers(
  variances: OutletRoleVariance[],
  scorers: TransferScorer[] = [RoleIdentityScorer],
): Recommendation[] {
  const byRole = new Map<string, OutletRoleVariance[]>();
  for (const v of variances) {
    if (!byRole.has(v.positionId)) byRole.set(v.positionId, []);
    byRole.get(v.positionId)!.push(v);
  }

  const recs: Recommendation[] = [];
  for (const [, rows] of [...byRole.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const positionName = rows[0].positionName;
    const donors = rows
      .filter((r) => r.excess > 0)
      .map((r) => ({ id: r.outletId, name: r.outletName, avail: r.excess }))
      .sort((a, b) => b.avail - a.avail || a.name.localeCompare(b.name));
    const receivers = rows
      .filter((r) => r.shortage > 0)
      .map((r) => ({ id: r.outletId, name: r.outletName, need: r.shortage, orig: r.shortage }))
      .sort((a, b) => b.need - a.need || a.name.localeCompare(b.name));

    let di = 0;
    let ri = 0;
    while (di < donors.length && ri < receivers.length) {
      const d = donors[di];
      const r = receivers[ri];
      const qty = Math.min(d.avail, r.need);
      if (qty > 0) {
        const donorExcessAfter = d.avail - qty;
        const confidence = runScorers(
          { positionName, qty, receiverShortageBefore: r.need, donorExcessAfter, roleIdentical: true },
          scorers,
        );
        recs.push({
          fromOutletId: d.id, fromName: d.name, toOutletId: r.id, toName: r.name,
          positionId: rows[0].positionId, positionName, headcount: qty, confidence,
          reason: `Both ${r.name} and ${d.name} staff the ${positionName} role; ${d.name} retains adequate coverage after moving ${qty}.`,
        });
        d.avail -= qty;
        r.need -= qty;
      }
      if (d.avail <= 0) di++;
      if (r.need <= 0) ri++;
    }
  }
  return recs;
}
