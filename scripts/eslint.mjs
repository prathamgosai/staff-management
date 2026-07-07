#!/usr/bin/env node
/**
 * Cross-platform ESLint runner that opts into **flat config** on ESLint 8.57
 * (where it's still gated behind ESLINT_USE_FLAT_CONFIG; default only in v9).
 * Setting the env var here — before ESLint is imported — avoids per-script shell
 * syntax that differs on PowerShell/cmd vs bash, and needs no `cross-env` dep.
 *
 * Usage (from any workspace):  node <repo>/scripts/eslint.mjs src
 * Exits 1 only when there are lint ERRORS; warnings pass (see eslint.base.mjs).
 */
process.env.ESLINT_USE_FLAT_CONFIG = "true";

// IMPORTANT: on ESLint 8.57 the top-level `ESLint` export is the LEGACY eslintrc
// engine — it ignores ESLINT_USE_FLAT_CONFIG and, with no .eslintrc present,
// silently matches zero files (a green no-op). `loadESLint({ useFlatConfig })`
// returns the flat-config engine that actually reads eslint.config.mjs.
const { loadESLint } = await import("eslint");
const ESLint = await loadESLint({ useFlatConfig: true });

const patterns = process.argv.slice(2);
const eslint = new ESLint({ errorOnUnmatchedPattern: false });

const results = await eslint.lintFiles(patterns.length ? patterns : ["."]);
const formatter = await eslint.loadFormatter("stylish");
const output = await formatter.format(results);
if (output.trim()) process.stdout.write(output + "\n");

const errors = results.reduce((n, r) => n + r.errorCount, 0);
process.exit(errors > 0 ? 1 : 0);
