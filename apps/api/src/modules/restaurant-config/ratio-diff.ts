/**
 * Pure ratio-change diff — decides which per-role ratio edits are real changes (→ a history
 * row). No DB, no I/O. Unit-tested directly.
 */
export interface RatioInput {
  positionId: string;
  guestsPerStaff: number;
  minStaff: number;
  maxStaff?: number;
}
export interface ExistingRatio {
  guestsPerStaff: number;
  minStaff: number;
}
export interface RatioChange {
  positionId: string;
  oldGuestsPerStaff: number | null;
  newGuestsPerStaff: number;
  oldMinStaff: number | null;
  newMinStaff: number;
}

/** Rows whose guests-per-staff or min-staff differ from the currently-stored value (or are new). */
export function diffRatios(existing: Map<string, ExistingRatio>, incoming: RatioInput[]): RatioChange[] {
  const changes: RatioChange[] = [];
  for (const inc of incoming) {
    const ex = existing.get(inc.positionId);
    if (!ex || ex.guestsPerStaff !== inc.guestsPerStaff || ex.minStaff !== inc.minStaff) {
      changes.push({
        positionId: inc.positionId,
        oldGuestsPerStaff: ex ? ex.guestsPerStaff : null,
        newGuestsPerStaff: inc.guestsPerStaff,
        oldMinStaff: ex ? ex.minStaff : null,
        newMinStaff: inc.minStaff,
      });
    }
  }
  return changes;
}
