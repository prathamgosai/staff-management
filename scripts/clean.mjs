#!/usr/bin/env node
/**
 * Cross-platform cache cleaner. Removes the build/dev caches that go stale after
 * next.config / dependency changes — the usual cause of the Node-24 "Cannot find
 * module './xxx.js'" / fallback-chunk 500s. Run `pnpm clean` then restart dev.
 */
import { rm } from "node:fs/promises";

const TARGETS = [
  "apps/web/.next",
  "apps/web/node_modules/.cache",
  "apps/api/dist",
  "apps/api/tsconfig.tsbuildinfo",
  "apps/api/tsconfig.build.tsbuildinfo",
  "node_modules/.cache",
  ".turbo",
];

for (const t of TARGETS) {
  await rm(t, { recursive: true, force: true });
  console.log("removed", t);
}
console.log("\nCaches cleared. Now restart dev:  pnpm dev");
