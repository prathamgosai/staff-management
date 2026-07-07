import base from "../../eslint.base.mjs";

// NestJS API — the shared base is sufficient (Node/TS, no framework plugin).
export default [
  ...base,
  {
    files: ["**/*.ts"],
    rules: {
      // Nest heavily uses parameter decorators + DI; empty ctors are idiomatic.
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];
