/** Jest config for the API — TypeScript via ts-jest. */
// Pin the timezone so date-bucketing / week-key logic is tested against the app's
// real operating TZ (India) rather than the CI runner's (UTC). Jest evaluates this
// config in the parent process and forked workers inherit process.env, so this
// propagates to every test. Override by setting TZ in the environment.
process.env.TZ = process.env.TZ || "Asia/Kolkata";

module.exports = {
  testEnvironment: "node",
  rootDir: "src",
  moduleFileExtensions: ["ts", "js", "json"],
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { isolatedModules: true }],
  },
  // Resolve the workspace package to its TS source (mirrors tsconfig paths), so
  // tests don't depend on the built dist / package "exports" map.
  moduleNameMapper: {
    "^@workforceiq/shared$": "<rootDir>/../../../packages/shared/src/index.ts",
  },
};
