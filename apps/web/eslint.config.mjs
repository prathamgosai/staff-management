import base from "../../eslint.base.mjs";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Next.js web app. Extends the shared TS base with the official Next plugin
 * (recommended + Core Web Vitals) and react-hooks, so we keep the important
 * framework checks — next/no-img-element, exhaustive-deps, etc. — without
 * depending on `next lint`'s legacy eslintrc path. Both plugins MUST be
 * registered even though most rules are warnings: the existing code carries
 * inline `eslint-disable react-hooks/*` / `@next/next/*` comments, and ESLint
 * errors on a disable directive for an unregistered rule. Rules stay warnings
 * to keep the first pass green (the codebase opts out inline where intentional).
 */
export default [
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
