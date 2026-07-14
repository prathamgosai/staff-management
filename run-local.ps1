# Runs the WHOLE app locally in PRODUCTION mode on http://localhost:3000.
# Use this on Node 24, where `next dev` serves broken 404 chunks — `next start` (production)
# works fine. One command: local Postgres + a production build + the API and web together.
# (Downside vs `next dev`: no hot-reload — re-run after code changes. For hot-reload, use Node 20.)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "1/4  starting local Postgres (:5433)..." -ForegroundColor Cyan
& "$root\.services\pgsql\bin\pg_ctl" -D "$root\.services\pgdata" -o "-p 5433" -l "$root\.services\pg.log" start 2>$null
Start-Sleep -Seconds 2

# Local DB + co-located API config (API_ORIGIN is baked into the web at build time below).
$env:DB_HOST = "127.0.0.1"; $env:DB_PORT = "5433"; $env:DB_NAME = "workforceiq"
$env:DB_USER = "postgres"; $env:DB_PASSWORD = ""; $env:DB_SSL = "false"
$env:JWT_SECRET = "local-dev-secret-change-me"; $env:JWT_REFRESH_SECRET = "local-dev-refresh-change-me"
$env:API_ORIGIN = "http://127.0.0.1:4000"; $env:INTERNAL_API_PORT = "4000"
$env:PORT = "3000"; $env:NODE_ENV = "production"

Set-Location $root
Write-Host "2/4  building shared + api..." -ForegroundColor Cyan
corepack enable 2>$null
pnpm --filter @workforceiq/shared build
pnpm --filter @workforceiq/api build
Write-Host "3/4  building web (API_ORIGIN baked = $($env:API_ORIGIN))..." -ForegroundColor Cyan
pnpm --filter @workforceiq/web build

Write-Host "4/4  starting API + web -> http://localhost:3000  (Ctrl+C to stop)" -ForegroundColor Green
node scripts/start-render.mjs
