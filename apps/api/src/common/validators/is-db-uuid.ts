import { registerDecorator, ValidationOptions, ValidationArguments } from "class-validator";

/**
 * A UUID as POSTGRES defines it, which is looser than class-validator's `@IsUUID()`.
 *
 * `@IsUUID()` enforces RFC-4122 *versions* — the 13th hex digit must be 1-5. Postgres does
 * not: its `uuid` type accepts any 32 hex digits. This codebase's seed data leans on that.
 * Outlets, brands, positions and departments carry hand-written ids like
 * `20000000-0000-0000-0000-000000000002` (version digit = 0), which Postgres stores happily
 * and `@IsUUID()` then rejects — so an endpoint would 400 on ids the database itself issued.
 * That is what broke manual attendance entry: "outletId must be a UUID", about a real outlet.
 *
 * Staff ids are genuine v4 (gen_random_uuid), so they pass either way; only the seeded
 * tables were affected. Use this decorator for any id that may come from seed data.
 */
export function IsDbUuid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isDbUuid",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && DB_UUID_RE.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a UUID`;
        },
      },
    });
  };
}

/** Each-element variant, for string[] fields such as auth's outletIds. */
export function IsDbUuidArray(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isDbUuidArray",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return Array.isArray(value) && value.every((v) => typeof v === "string" && DB_UUID_RE.test(v));
        },
        defaultMessage(args: ValidationArguments) {
          return `each value in ${args.property} must be a UUID`;
        },
      },
    });
  };
}

/** 8-4-4-4-12 hex, any version — exactly what Postgres's uuid type accepts. */
const DB_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
