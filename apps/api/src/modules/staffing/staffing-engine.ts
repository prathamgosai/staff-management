/**
 * Real-Time Staffing Requirement Engine (Feature 3) — PURE and deterministic. No DB, no I/O,
 * no Nest. Inputs in → results out, so it's unit-tested directly against the Edge-Case Gauntlet
 * (zero pax, unconfigured outlet, zero/null ratio → no divide-by-zero, all staff on leave).
 *
 * Formulas (brief §5 F3), all constants injected via thresholds:
 *   required(role)  = max( ceil(effective_pax / guests_per_staff), min_staff )
 *   available(role) = current − on_leave        (current already reflects approved transfers)
 *   shortage(role)  = max(0, required − available)
 *   excess(role)    = max(0, available − required)
 *   vacant(role)    = shortage(role)
 *   status: shortage==0 && excess<=T_excess → GREEN ; excess>T_excess → BLUE ;
 *           shortage/required <= T_minor → YELLOW ; else RED ;
 *           no config / zero-or-null ratio (and no floor) → UNCONFIGURED (never fake-green, never ÷0)
 */

export type StaffingStatus = "green" | "yellow" | "red" | "blue" | "unconfigured";

export interface EngineThresholds {
  /** Excess at or below this many staff is still GREEN. */
  tExcess: number;
  /** shortage/required at or below this fraction is YELLOW (minor); above is RED. */
  tMinor: number;
}

export const DEFAULT_THRESHOLDS: EngineThresholds = { tExcess: 1, tMinor: 0.15 };

export interface RoleInput {
  positionId: string;
  positionName?: string;
  /** null or ≤ 0 means "no demand ratio configured" for this role. */
  guestsPerStaff: number | null;
  minStaff: number;
  current: number;
  onLeave: number;
  present: number;
  transferredIn: number;
  transferredOut: number;
}

export interface RoleResult {
  positionId: string;
  positionName?: string;
  required: number;
  current: number;
  available: number;
  present: number;
  onLeave: number;
  transferredIn: number;
  transferredOut: number;
  shortage: number;
  excess: number;
  vacant: number;
  status: StaffingStatus;
}

export interface OutletStaffingInput {
  /** null → no capacity configured for this outlet → UNCONFIGURED. */
  effectivePax: number | null;
  thresholds: EngineThresholds;
  roles: RoleInput[];
}

export interface StaffingTotals {
  required: number;
  current: number;
  available: number;
  present: number;
  onLeave: number;
  transferredIn: number;
  transferredOut: number;
  shortage: number;
  excess: number;
  vacant: number;
}

export interface OutletStaffingResult {
  effectivePax: number | null;
  status: StaffingStatus;
  totals: StaffingTotals;
  roles: RoleResult[];
}

function classify(shortage: number, excess: number, required: number, t: EngineThresholds): StaffingStatus {
  if (shortage <= 0) return excess > t.tExcess ? "blue" : "green";
  // shortage > 0 ⇒ required > 0 (shortage = max(0, required − available)), so no ÷0
  const ratio = required > 0 ? shortage / required : 1;
  return ratio <= t.tMinor ? "yellow" : "red";
}

function computeRole(role: RoleInput, effectivePax: number | null, t: EngineThresholds): RoleResult {
  const hasRatio = role.guestsPerStaff != null && role.guestsPerStaff > 0;
  const configured = effectivePax != null && hasRatio;
  const available = role.current - role.onLeave;

  // Unconfigured only when there is neither a demand ratio nor a floor to size against. Such a
  // role reports headcount (current/available/present) but contributes NOTHING to the demand
  // math — required/shortage/excess all 0 — so unmapped staff (e.g. Support/ODC) never fake a
  // blue "excess" for the outlet.
  const isUnconfigured = !configured && role.minStaff <= 0;
  if (isUnconfigured) {
    return {
      positionId: role.positionId, positionName: role.positionName,
      required: 0, current: role.current, available, present: role.present, onLeave: role.onLeave,
      transferredIn: role.transferredIn, transferredOut: role.transferredOut,
      shortage: 0, excess: 0, vacant: 0, status: "unconfigured",
    };
  }

  const demand = configured ? Math.ceil((effectivePax as number) / (role.guestsPerStaff as number)) : 0;
  const required = Math.max(demand, role.minStaff);
  const shortage = Math.max(0, required - available);
  const excess = Math.max(0, available - required);

  return {
    positionId: role.positionId,
    positionName: role.positionName,
    required,
    current: role.current,
    available,
    present: role.present,
    onLeave: role.onLeave,
    transferredIn: role.transferredIn,
    transferredOut: role.transferredOut,
    shortage,
    excess,
    vacant: shortage,
    status: classify(shortage, excess, required, t),
  };
}

export function computeStaffing(input: OutletStaffingInput): OutletStaffingResult {
  const t = input.thresholds;
  const roles = input.roles.map((r) => computeRole(r, input.effectivePax, t));

  const totals: StaffingTotals = {
    required: 0, current: 0, available: 0, present: 0, onLeave: 0,
    transferredIn: 0, transferredOut: 0, shortage: 0, excess: 0, vacant: 0,
  };
  for (const r of roles) {
    totals.required += r.required;
    totals.current += r.current;
    totals.available += r.available;
    totals.present += r.present;
    totals.onLeave += r.onLeave;
    totals.transferredIn += r.transferredIn;
    totals.transferredOut += r.transferredOut;
    totals.shortage += r.shortage;
    totals.excess += r.excess;
    totals.vacant += r.vacant;
  }

  // Outlet is UNCONFIGURED when it has no capacity, or every role is unconfigured.
  const anyConfigured = roles.some((r) => r.status !== "unconfigured");
  let status: StaffingStatus;
  if (input.effectivePax == null || !anyConfigured) {
    status = "unconfigured";
  } else if (totals.shortage > 0) {
    // A net shortage anywhere means the outlet is not perfectly staffed.
    const ratio = totals.required > 0 ? totals.shortage / totals.required : 1;
    status = ratio <= t.tMinor ? "yellow" : "red";
  } else if (totals.excess > t.tExcess) {
    status = "blue";
  } else {
    status = "green";
  }

  return { effectivePax: input.effectivePax, status, totals, roles };
}
