import base from "../../eslint.base.mjs";
import nextPlugin from "@next/eslint-plugin-next";

/**
 * Next.js web app. Extends the shared TS base with the official Next plugin
 * (recommended + Core Web Vitals) so we keep the important framework checks —
 * next/no-img-element, no-html-link-for-pages, etc. — without depending on
 * `next lint`'s legacy eslintrc path. Image/link rules are warnings to keep the
 * first pass green (the codebase already opts out inline where intentional).
 */
export default [
  ...base,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
];
