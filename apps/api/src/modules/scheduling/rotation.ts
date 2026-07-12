/**
 * Pure rotation math for the weekly 3-shift roster, extracted from
 * SchedulingService.autoGenerateRotation so it can be unit-tested independently of the DB.
 *
 * Staff (already sorted) are split into 3 groups; each week the group→template mapping
 * rotates by one (A→B→C→A). A manual per-staff pin overrides that staff's template, but
 * only if the pin points at one of the 3 rostered templates (so it can never orphan an
 * assignment). This function performs NO I/O and does not change week-to-week behavior.
 */
export interface RotationPin {
  staff_id: string;
  template_id: string;
}

export interface RotationPlan {
  /** Staff ids split into the 3 rotation groups (in input order). */
  groups: string[][];
  /** group index (0|1|2) → the template id that group works this week. */
  groupShiftMap: Record<number, string>;
  /** staff id → the template id they are rostered onto this week (after pins). */
  staffTemplateId: Record<string, string>;
}

export function computeRotationPlan(
  staffIds: string[],
  templateIds: string[],
  weekIndex: number,
  pins: RotationPin[] = [],
): RotationPlan {
  const groupSize = Math.ceil(staffIds.length / 3);
  const groups: string[][] = [
    staffIds.slice(0, groupSize),
    staffIds.slice(groupSize, groupSize * 2),
    staffIds.slice(groupSize * 2),
  ];

  // Each week shifts the mapping by 1. Mirrors the original templates[(g+wk)%3] indexing.
  const groupShiftMap: Record<number, string> = {
    0: templateIds[weekIndex % 3],
    1: templateIds[(weekIndex + 1) % 3],
    2: templateIds[(weekIndex + 2) % 3],
  };

  const staffTemplateId: Record<string, string> = {};
  for (let g = 0; g < 3; g++) {
    for (const staffId of groups[g]) staffTemplateId[staffId] = groupShiftMap[g];
  }

  // Honour a manual pin only for staff rostered this week and pointing at one of the
  // 3 templates actually in play.
  const scheduled = new Set(templateIds);
  for (const pin of pins) {
    if (staffTemplateId[pin.staff_id] && scheduled.has(pin.template_id)) {
      staffTemplateId[pin.staff_id] = pin.template_id;
    }
  }

  return { groups, groupShiftMap, staffTemplateId };
}
