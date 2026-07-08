#!/usr/bin/env node
/**
 * Preflight Node-version guard for `pnpm dev`.
 *
 * This project (Next.js 14.2 dev bundler) only runs cleanly on Node 20–22. On
 * Node 23/24 the dev server produces broken output — `/_next/static/*.js|css`
 * return 404 (pages load but are unstyled and non-interactive) and
 * "Cannot find module './xxx.js'". Fail fast with an actionable message instead
 * of a cryptic, half-working dev server.
 *
 * Escape hatch (not recommended): SKIP_NODE_CHECK=1 pnpm dev
 */
const OK_MIN = 20;
const OK_MAX = 22;
const major = Number(process.versions.node.split(".")[0]);

if (process.env.SKIP_NODE_CHECK === "1") process.exit(0);

if (major < OK_MIN || major > OK_MAX) {
  const R = "\x1b[31m", B = "\x1b[1m", X = "\x1b[0m", Y = "\x1b[33m";
  console.error(`
${R}${B}✖ Wrong Node.js version for this project.${X}
  Needs ${B}Node ${OK_MIN}–${OK_MAX}${X} (see .nvmrc). You are on ${B}${R}v${process.versions.node}${X}.

  On Node 23/24 the Next.js dev server serves broken chunks —
  ${Y}/_next/static/*.js and *.css return 404${X} (blank/unstyled, dead pages).

  ${B}Fix:${X}
    ${Y}nvm use 20${X}     ${B}then confirm →${X} ${Y}node -v${X}  (must print v20.x)
    ${Y}pnpm clean${X}
    ${Y}pnpm dev${X}

  No nvm? Install Node 20 LTS from https://nodejs.org
  Bypass anyway (not recommended): ${Y}SKIP_NODE_CHECK=1 pnpm dev${X}
`);
  process.exit(1);
}
