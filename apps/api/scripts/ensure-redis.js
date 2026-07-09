/* Ensures Redis is reachable BEFORE the API boots.
 *
 * Why this exists: the API registers a Bull (Redis-backed) repeatable job during
 * `onApplicationBootstrap` (see notification.reminder.ts). When Redis is DOWN,
 * ioredis queues that command indefinitely instead of failing, so the awaited
 * `queue.add(...)` never settles — bootstrap HANGS after mapping routes and the
 * API never binds :4000. The web app then loads but every login/data call fails,
 * making the whole site look dead. This guard turns that silent hang into either
 * (a) an auto-started local Redis, or (b) a loud, actionable error.
 *
 * Runs automatically before `pnpm dev` (chained ahead of free-port + ts-node).
 * NOT used by the production `start` script — prod points at managed Redis.
 *
 * Dependency-free. Reads REDIS_* from the environment, falling back to the repo
 * root .env, falling back to 127.0.0.1:6379.
 *
 * Usage: node scripts/ensure-redis.js
 */
const net = require("net");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

// --- resolve host/port from env, then repo .env, then defaults -------------
function fromDotEnv() {
  const out = {};
  try {
    const raw = fs.readFileSync(path.join(REPO_ROOT, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*(REDIS_HOST|REDIS_PORT|REDIS_TLS)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* no .env — defaults are fine */
  }
  return out;
}

const env = fromDotEnv();
const host = process.env.REDIS_HOST || env.REDIS_HOST || "127.0.0.1";
const port = Number(process.env.REDIS_PORT || env.REDIS_PORT || 6379);
const tls = (process.env.REDIS_TLS || env.REDIS_TLS) === "true";

const isLocal = ["127.0.0.1", "localhost", "::1", "0.0.0.0"].includes(host);
const isManaged = tls || /\.upstash\.io$/i.test(host) || /\.redns\.redis-cloud\.com$/i.test(host);

// --- TCP reachability probe (PING → +PONG, else fall back to "connected") ---
function probe(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    let settled = false;
    const done = (up) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(up);
    };
    sock.setTimeout(timeoutMs);
    sock.on("connect", () => sock.write("PING\r\n"));
    sock.on("data", (buf) => done(/PONG/i.test(buf.toString()) || true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (await probe()) {
    console.log(`[ensure-redis] Redis reachable at ${host}:${port}`);
    return 0;
  }

  // Not reachable. We can only auto-start a LOCAL, non-managed Redis on Windows
  // via the portable binary shipped under .services/redis/.
  const redisDir = path.join(REPO_ROOT, ".services", "redis");
  const exe = path.join(redisDir, "redis-server.exe");
  const conf = path.join(redisDir, "redis.windows.conf");
  const canAutoStart =
    isLocal && !isManaged && process.platform === "win32" && fs.existsSync(exe);

  if (!canAutoStart) {
    const why = isManaged || !isLocal
      ? `Redis at ${host}:${port} is remote/managed and cannot be auto-started from here.`
      : process.platform !== "win32"
        ? `Auto-start only supports the bundled Windows Redis; start your local Redis manually.`
        : `Bundled Redis not found at ${exe}.`;
    console.error(
      `\n[ensure-redis] ✖ Redis is NOT reachable at ${host}:${port}.\n` +
        `  ${why}\n` +
        `  The API will HANG on startup without Redis, so aborting instead.\n` +
        `  → Start Redis, then re-run \`pnpm dev\`.\n`,
    );
    return 1;
  }

  console.log(`[ensure-redis] Redis down — starting bundled redis-server…`);
  const child = spawn(exe, [conf], {
    cwd: redisDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  // Poll for readiness (up to ~12s).
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    if (await probe()) {
      console.log(`[ensure-redis] ✔ Redis is up at ${host}:${port}`);
      return 0;
    }
  }

  console.error(
    `\n[ensure-redis] ✖ Started redis-server but it never became reachable at ${host}:${port}.\n` +
      `  Check ${path.join(redisDir, "redis-err.log")}. Aborting so the API doesn't hang.\n`,
  );
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`[ensure-redis] unexpected error: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
