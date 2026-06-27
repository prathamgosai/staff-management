# =============================================================
# WorkforceIQ - ONE-COMMAND clean start (no Docker).
# Ensures Postgres + Redis, frees ports 4000/3000 (so you NEVER
# hit EADDRINUSE), then launches the API and Web each in its own
# window. Safe to re-run anytime - it clears stale servers first.
#
#   Usage:  .\run-app.ps1
# =============================================================
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1) Backing services (Postgres + Redis)
& (Join-Path $root "start-services.ps1")

# 2) Free app ports - kill any stale API/Web so the new ones can bind
foreach ($port in 4000, 3000) {
  $ids = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
  foreach ($id in $ids) {
    try { Stop-Process -Id $id -Force; Write-Host "Freed port $port (stopped stale PID $id)" -ForegroundColor DarkYellow } catch {}
  }
}

# 3) Launch API (:4000) and Web (:3000), each in its own PowerShell window
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\apps\api'; pnpm dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\apps\web'; pnpm dev"

Write-Host ""
Write-Host "Launching API (:4000) and Web (:3000) in separate windows..." -ForegroundColor Cyan
Write-Host "When the Web window shows 'Ready', open:  http://localhost:3000" -ForegroundColor Cyan
