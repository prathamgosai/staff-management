import { getMondayStr, toLocalDateStr } from "./week.util";

/**
 * The week-key invariant is the single most load-bearing date rule in the app:
 * the rotation scheduler and the /me endpoints must agree with the web client's
 * date-fns startOfWeek(weekStartsOn: 1) or a user's roster silently queries the
 * wrong week. jest.config.js pins TZ=Asia/Kolkata so the +05:30 UTC off-by-one
 * (the bug the LOCAL-component formatting exists to avoid) is actually exercised.
 */
describe("getMondayStr", () => {
  it("returns the same Monday for every day of a week (Mon–Sun)", () => {
    // Week of Mon 2026-07-06 … Sun 2026-07-12.
    const expected = "2026-07-06";
    for (let day = 6; day <= 12; day++) {
      expect(getMondayStr(new Date(2026, 6, day))).toBe(expected);
    }
  });

  it("maps a Monday to itself", () => {
    expect(getMondayStr(new Date(2026, 6, 6))).toBe("2026-07-06");
  });

  it("maps a Sunday back to the week's Monday (not forward)", () => {
    expect(getMondayStr(new Date(2026, 6, 12))).toBe("2026-07-06");
  });

  it("does NOT drift to Sunday for a Monday just after IST midnight (the UTC bug)", () => {
    // 2026-07-06 00:30 IST is 2026-07-05 19:00 UTC. A toISOString()-based
    // implementation would return '2026-07-05' (Sunday); LOCAL components keep it Monday.
    expect(getMondayStr(new Date(2026, 6, 6, 0, 30))).toBe("2026-07-06");
  });

  it("crosses a month boundary correctly", () => {
    // Wed 2026-04-01 belongs to the week starting Mon 2026-03-30.
    expect(getMondayStr(new Date(2026, 3, 1))).toBe("2026-03-30");
  });

  it("crosses a year boundary correctly", () => {
    // Thu 2027-01-01 belongs to the week starting Mon 2026-12-28.
    expect(getMondayStr(new Date(2027, 0, 1))).toBe("2026-12-28");
  });
});

describe("toLocalDateStr", () => {
  it("formats a Date from local components", () => {
    expect(toLocalDateStr(new Date(2026, 6, 6, 23, 59))).toBe("2026-07-06");
  });

  it("does not shift a local-midnight Date back a day (UTC off-by-one guard)", () => {
    expect(toLocalDateStr(new Date(2026, 6, 6, 0, 0))).toBe("2026-07-06");
  });

  it("takes the first 10 chars of a date-ish string", () => {
    expect(toLocalDateStr("2026-07-06T18:30:00.000Z")).toBe("2026-07-06");
  });
});
