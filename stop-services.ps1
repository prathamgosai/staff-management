# =============================================================
# WorkforceIQ - stop the local (non-Docker) backing services.
# =============================================================
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$svc    = Join-Path $root ".services"
$pgBin  = Join-Path $svc  "pgsql\bin"
$pgData = Join-Path $svc  "pgdata"
$redis  = Join-Path $svc  "redis"

# --- PostgreSQL ---
& "$pgBin\pg_ctl.exe" -D $pgData stop -m fast *> $null
if ($LASTEXITCODE -eq 0) { Write-Host "PostgreSQL stopped." -ForegroundColor Yellow }
else { Write-Host "PostgreSQL was not running." -ForegroundColor DarkGray }

# --- Redis ---
try {
  & "$redis\redis-cli.exe" -p 6379 shutdown nosave *> $null
  Write-Host "Redis stopped." -ForegroundColor Yellow
} catch {
  Write-Host "Redis was not running." -ForegroundColor DarkGray
}
