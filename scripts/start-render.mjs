/**
 * Single-service launcher for Render — runs the NestJS API AND the Next.js web in ONE service,
 * so the whole app deploys as a single Render web service (no separate API service needed).
 *
 * The API listens on an INTERNAL port (4000); Next.js listens on Render's public $PORT and
 * proxies /api/* to the co-located API via API_ORIGIN=http://127.0.0.1:4000 (see
 * apps/web/next.config.mjs rewrites). If either process exits, we exit so Render restarts both.
 *
 * Render settings for this service:
 *   Build:  corepack enable && pnpm install --prod=false && pnpm --filter @workforceiq/shared build && pnpm --filter @workforceiq/api build && pnpm --filter @workforceiq/web build
 *   Start:  node scripts/start-render.mjs
 *   Env:    DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD/DB_SSL, JWT_SECRET, JWT_REFRESH_SECRET,
 *           (optional) REDIS_HOST/REDIS_PORT for notifications. API_ORIGIN is set here automatically.
 */
import { spawn } from "child_process";
import net from "net";

const PUBLIC_PORT = process.env.PORT || "10000";
const API_PORT = process.env.INTERNAL_API_PORT || "4000";

function launch(name, command, extraEnv) {
  const child = spawn(command, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  child.on("exit", (code, signal) => {
    console.error(`[start-render] "${name}" exited (code=${code} signal=${signal}) — shutting down so Render restarts the service.`);
    process.exit(code ?? 1);
  });
  return child;
}

function waitForPort(port, host = "127.0.0.1", tries = 120) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      const sock = net.createConnection({ port: Number(port), host });
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => {
        sock.destroy();
        if (n > 0) setTimeout(() => attempt(n - 1), 1000);
        else reject(new Error(`API never opened port ${port}`));
      });
    };
    attempt(tries);
  });
}

(async () => {
  console.log(`[start-render] launching API on :${API_PORT} …`);
  launch("api", "node apps/api/dist/main.js", { PORT: API_PORT, NODE_ENV: "production" });

  try {
    await waitForPort(API_PORT);
    console.log(`[start-render] API is up on :${API_PORT}; starting web on :${PUBLIC_PORT} …`);
  } catch (e) {
    console.error(`[start-render] ${e.message} — starting web anyway (it will retry the proxy).`);
  }

  launch("web", "pnpm --filter @workforceiq/web start", {
    PORT: PUBLIC_PORT,
    API_ORIGIN: "http://127.0.0.1:" + API_PORT,
    NODE_ENV: "production",
  });
})();
