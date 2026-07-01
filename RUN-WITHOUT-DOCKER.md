# Running WorkforceIQ without Docker

The app no longer needs Docker. The backing services run **natively on Windows**:

| Service    | How it runs                                   | Port |
|------------|-----------------------------------------------|------|
| PostgreSQL | Portable PostgreSQL 16 in `.services\pgsql`   | 5432 |
| Redis      | Portable Redis (Windows) in `.services\redis` | 6379 |
| MinIO      | **Not used** — profile photos are stored in the DB | —    |
| ML service | Optional (Python FastAPI); not needed for the web app | 8000 |

Everything lives in the git-ignored `.services\` folder (binaries + data). The
`.env` already points at `localhost:5432` / `localhost:6379`, so no config changes are needed.

## Start it (easiest — one command)

```powershell
.\run-app.ps1
```

This ensures Postgres + Redis are running, **frees ports 4000/3000 so you never get `EADDRINUSE`**, and launches the API and Web each in its own window. Safe to re-run anytime. When the Web window says `Ready`, open http://localhost:3000 and sign in as the seeded admin (`admin@workforceiq.app`).

> **First login forces a password change.** The seeded admin ships with a bootstrap password that the app requires you to replace on first sign-in (the account is flagged `must_change_password`). For a fresh database, set/reset the bootstrap password yourself before going live — never rely on a shared default. See [Secrets & credentials](#secrets--credentials) below.

### Or start things manually
```powershell
.\start-services.ps1      # starts PostgreSQL + Redis (idempotent)
# then, in TWO separate terminals:
cd apps\api ; pnpm dev    # API  -> http://localhost:4000
cd apps\web ; pnpm dev    # Web  -> http://localhost:3000
```

> **`EADDRINUSE: :::4000` means an API is already running** — you don't need a second one.
> Don't run `pnpm dev` again in a folder whose server is already up. To force-free a port:
> `Get-NetTCPConnection -LocalPort 4000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`

> If PowerShell blocks a script with an execution-policy error, run:
> `powershell -ExecutionPolicy Bypass -File .\run-app.ps1`

## Stop it

```powershell
.\stop-services.ps1       # stops PostgreSQL + Redis
```

(Stopping `pnpm dev` is just Ctrl+C in its terminal.)

## After a reboot

The services are **not** installed as auto-start Windows services, so after a
reboot just run `.\start-services.ps1` again before `pnpm dev`.

## Notes

- **Data**: The database was migrated from the old Docker volume, so all real
  staff, users, and edits are preserved. The data directory is `.services\pgdata`.
- **TimescaleDB**: Not installed. It only powered the "PAX Prediction (coming soon)"
  feature. `assets/db/001_schema.sql` now enables TimescaleDB *optionally*, so the
  schema also loads cleanly on vanilla PostgreSQL.
- **Old Docker setup**: still intact (containers stopped, volumes kept) if you ever
  want it back: `docker compose up -d postgres redis`. To reclaim that disk space
  later: `docker compose down -v`.
- **Database credentials**: the app connects as the `workforceiq_user` role using
  the password in `.env` (`DB_PASSWORD`). Don't hardcode it anywhere or paste it
  into docs — see [Secrets & credentials](#secrets--credentials).

## Secrets & credentials

All secrets live in the git-ignored `.env` (never committed). `.env.example` holds
placeholders only.

- **Generate strong secrets** (run once, paste into `.env`):
  ```powershell
  node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
  node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
  node -e "console.log('DB_PASSWORD=' + require('crypto').randomBytes(24).toString('base64url'))"
  ```
- **Rotate the database password** (must match `.env` `DB_PASSWORD`):
  ```sql
  ALTER USER workforceiq_user PASSWORD '<new-strong-password>';
  ```
  Then restart the API so it reconnects with the new value.
- **Admin password**: set by reseeding or via the super-admin “reset password” action.
  First login always forces a change. There is no shared default password.

