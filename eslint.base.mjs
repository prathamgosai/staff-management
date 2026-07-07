import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

/**
 * Shared ESLint **flat config** base for every workspace (root + per-package).
 * Deliberately lenient: this is a first lint over a large, pre-existing codebase,
 * so the legacy-heavy TS rules are warnings (surface, don't block) rather than
 * errors — matching the project's "rules are aspirational unless we retrofit"
 * stance. Tighten per package over time. Errors are reserved for real bugs.
 */
export default [
  {
    // Global ignores — an object with ONLY `ignores` applies repo-wide.
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/build/**",
      "**/.turbo/**",
      // Only the web app's static assets — NOT source dirs named "public"
      // (e.g. apps/api/src/modules/public, the magic-link/PublicModule code).
      "apps/web/public/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "**/*.config.ts",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript already enforces these; the ESLint core versions misfire on TS.
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-dupe-class-members": "off",
      // Intentional empty catches (best-effort cleanup) are idiomatic here.
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Keep the first pass green: report legacy patterns as warnings, not errors.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-inferrable-types": "off",
    },
  },
];
