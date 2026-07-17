import { validate } from "class-validator";
import { IsUUID } from "class-validator";
import { IsDbUuid, IsDbUuidArray } from "./is-db-uuid";

class WithDbUuid {
  @IsDbUuid()
  outletId!: string;
}
class WithStrictUuid {
  @IsUUID()
  outletId!: string;
}
class WithDbUuidArray {
  @IsDbUuidArray()
  outletIds!: string[];
}

// A real outlet id from this database's seed data (002_seed.sql).
const SEEDED_OUTLET_ID = "20000000-0000-0000-0000-000000000002";
// A real staff id (gen_random_uuid) — genuine v4.
const V4_STAFF_ID = "31b5d393-c658-421a-818e-319c5cf85f07";

async function errorsFor(obj: object) {
  return (await validate(obj)).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe("IsDbUuid", () => {
  it("accepts the seeded ids that @IsUUID rejects — the actual bug", async () => {
    const dbOk = Object.assign(new WithDbUuid(), { outletId: SEEDED_OUTLET_ID });
    const strict = Object.assign(new WithStrictUuid(), { outletId: SEEDED_OUTLET_ID });

    expect(await errorsFor(dbOk)).toEqual([]);
    // Proves the regression this decorator exists to fix: the strict validator 400s on an
    // id Postgres itself issued and stores.
    expect(await errorsFor(strict)).toContain("outletId must be a UUID");
  });

  it("accepts genuine v4 ids too", async () => {
    expect(await errorsFor(Object.assign(new WithDbUuid(), { outletId: V4_STAFF_ID }))).toEqual([]);
  });

  it("is case-insensitive", async () => {
    expect(await errorsFor(Object.assign(new WithDbUuid(), { outletId: SEEDED_OUTLET_ID.toUpperCase() }))).toEqual([]);
  });

  it.each([
    ["not-a-uuid", "free text"],
    ["20000000-0000-0000-0000-00000000000", "too short"],
    ["20000000-0000-0000-0000-0000000000021", "too long"],
    ["20000000_0000_0000_0000_000000000002", "wrong separators"],
    ["2000000g-0000-0000-0000-000000000002", "non-hex digit"],
    ["", "empty"],
  ])("still rejects %s (%s)", async (bad) => {
    expect(await errorsFor(Object.assign(new WithDbUuid(), { outletId: bad }))).toContain("outletId must be a UUID");
  });

  it("rejects non-strings, so a smuggled object can't reach a ::uuid cast", async () => {
    expect(await errorsFor(Object.assign(new WithDbUuid(), { outletId: { toString: () => SEEDED_OUTLET_ID } }))).not.toEqual([]);
    expect(await errorsFor(Object.assign(new WithDbUuid(), { outletId: null }))).not.toEqual([]);
  });

  describe("IsDbUuidArray", () => {
    it("accepts an array of seeded ids", async () => {
      expect(await errorsFor(Object.assign(new WithDbUuidArray(), { outletIds: [SEEDED_OUTLET_ID, V4_STAFF_ID] }))).toEqual([]);
    });

    it("accepts an empty array (no outlets assigned)", async () => {
      expect(await errorsFor(Object.assign(new WithDbUuidArray(), { outletIds: [] }))).toEqual([]);
    });

    it("rejects when any element is bad", async () => {
      expect(await errorsFor(Object.assign(new WithDbUuidArray(), { outletIds: [SEEDED_OUTLET_ID, "nope"] }))).not.toEqual([]);
    });

    it("rejects a non-array", async () => {
      expect(await errorsFor(Object.assign(new WithDbUuidArray(), { outletIds: SEEDED_OUTLET_ID }))).not.toEqual([]);
    });
  });
});
