/** Jest config for the API — TypeScript via ts-jest. */
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
