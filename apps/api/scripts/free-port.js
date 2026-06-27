/* Frees a TCP port by stopping whatever process is LISTENING on it.
 * Runs automatically before `pnpm dev` so you never hit EADDRINUSE.
 * Usage: node scripts/free-port.js 4000
 * Dependency-free; works on Windows (netstat/taskkill) and Unix (lsof/kill).
 */
const { execSync } = require("child_process");
const port = process.argv[2] || "4000";

function run(cmd) {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return ""; }
}

const pids = new Set();

if (process.platform === "win32") {
  const out = run("netstat -ano -p tcp");
  const re = new RegExp(`[:.]${port}\\b`);
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    const local = cols[1] || "";
    if (!re.test(local)) continue;            // match the LOCAL address only
    const pid = cols[cols.length - 1];
    if (/^\d+$/.test(pid) && pid !== "0") pids.add(pid);
  }
  for (const pid of pids) { run(`taskkill /F /PID ${pid}`); console.log(`[free-port] freed :${port} (stopped PID ${pid})`); }
} else {
  const out = run(`lsof -ti tcp:${port}`);
  for (const pid of out.split(/\s+/).filter(Boolean)) { run(`kill -9 ${pid}`); console.log(`[free-port] freed :${port} (stopped PID ${pid})`); }
}

if (pids.size === 0) console.log(`[free-port] :${port} was already free`);
