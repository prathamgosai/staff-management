# =============================================================
# WorkforceIQ - start local backing services WITHOUT Docker
# Starts native PostgreSQL 16 (port 5432) and Redis (port 6379).
# Run this, then: pnpm dev
# =============================================================
$ErrorActionPreference = "Stop"
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$svc    = Join-Path $root ".services"
$pgBin  = Join-Path $svc  "pgsql\bin"
$pgData = Join-Path $svc  "pgdata"
$pgLog  = Join-Path $svc  "pg.log"
$redis  = Join-Path $svc  "redis"

if (-not (Test-Path $pgBin)) { Write-Host "Missing $pgBin - is the .services folder set up?" -ForegroundColor Red; exit 1 }

# --- PostgreSQL ---
& "$pgBin\pg_ctl.exe" -D $pgData status *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "PostgreSQL already running on :5432" -ForegroundColor Green
} else {
  & "$pgBin\pg_ctl.exe" -D $pgData -l $pgLog -o "-p 5432" start | Out-Null
  Write-Host "PostgreSQL started on :5432" -ForegroundColor Green
}

# --- Redis ---
$redisUp = Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue
if ($redisUp) {
  Write-Host "Redis already running on :6379" -ForegroundColor Green
} else {
  Start-Process -FilePath "$redis\redis-server.exe" -ArgumentList '--port 6379' -WorkingDirectory $redis -WindowStyle Hidden
  Start-Sleep -Seconds 1
  Write-Host "Redis started on :6379" -ForegroundColor Green
}

Write-Host ""
Write-Host "Backing services are up. Now run:  pnpm dev" -ForegroundColor Cyan
