# Starts the WorkforceIQ API locally against the BUNDLED LOCAL Postgres (.services/pgdata on 5433).
# Safe: never touches the production Supabase DB. Run this in its own terminal, alongside the web
# (`cd apps/web; pnpm dev`). Needed because on Node 24 the root `pnpm dev` version-guard blocks the
# combined dev command, and the API's .env points at PRODUCTION.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "1/4 starting local Postgres on 5433..." -ForegroundColor Cyan
& "$root\.services\pgsql\bin\pg_ctl" -D "$root\.services\pgdata" -o "-p 5433" -l "$root\.services\pg.log" start 2>$null
Start-Sleep -Seconds 2

Write-Host "2/4 ensuring Redis..." -ForegroundColor Cyan
node "$root\apps\api\scripts\ensure-redis.js"

Write-Host "3/4 building API (if needed)..." -ForegroundColor Cyan
Set-Location "$root\apps\api"
if (-not (Test-Path "dist\main.js")) { & ".\node_modules\.bin\nest" build }

Write-Host "4/4 starting API on http://localhost:4000 (LOCAL db)..." -ForegroundColor Green
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "5433"
$env:DB_NAME = "workforceiq"
$env:DB_USER = "postgres"
$env:DB_PASSWORD = ""
$env:DB_SSL = "false"
$env:PORT = "4000"
node dist\main.js
