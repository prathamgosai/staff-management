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

## Start it

```powershell
.\start-services.ps1      # starts PostgreSQL + Redis (idempotent)
pnpm dev                  # starts API (:4000) and Web (:3000)
```

Then open http://localhost:3000 and sign in with `admin@workforceiq.app` / `Admin@123`.

> If PowerShell blocks the script with an execution-policy error, run:
> `powershell -ExecutionPolicy Bypass -File .\start-services.ps1`

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
- **Superuser**: the local Postgres superuser is `postgres` / `postgres`; the app
  connects as `workforceiq_user` / `change_me_in_production` (matches `.env`).
```
