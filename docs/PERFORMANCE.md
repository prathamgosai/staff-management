# Performance — why the app feels slow, and how to fix it

_Last profiled: 2026-07-06_

## TL;DR

The app is slow for **one dominant reason: the database is in Sydney
(`ap-southeast-2`) and every query is a long, jittery network round-trip.**
Measured on 2026-07-06:

| Thing measured | Result |
| --- | --- |
| Single DB round-trip to Sydney | **~470 ms avg, ranging 300–981 ms** (very jittery) |
| Heaviest dashboard query (`staff-hierarchy`) **server-side** | **4.2 ms** |
| Same query **over the network** | 1.3–1.6 s |
| Login request (before fix) | ~1.7–2.4 s (4 sequential round-trips) |

The database does its actual work in **single-digit milliseconds**. Essentially
**all** of every request's wall-clock time is the trip to Sydney. Tables are
small (staff: 260, shift_assignments: ~5.9k) and **every hot column is already
indexed**, so there is nothing to gain from more indexes or query rewrites.

## What has already been done (code)

These are permanent wins and are already in the codebase:

1. **Login: 4 blocking round-trips → 2.** In `apps/api/src/modules/auth/auth.service.ts`:
   - Dropped a redundant `must_change_password` SELECT (that column was already
     in the user row we fetch to check the password).
   - Made the `last_login_at` UPDATE fire-and-forget (a non-critical audit field
     shouldn't hold up the login response).
   - Run the refresh-token INSERT and the role-permissions lookup concurrently
     with `Promise.all` instead of one after the other.
2. **Pool `keepAlive: true`** in `apps/api/src/database/database.module.ts` so
   idle sockets aren't dropped and forced to pay a cold TLS reconnect to Sydney.

The rest of the API is already well-architected for latency: endpoints use
single queries or `Promise.all`, and the web dashboard fetches all its panels in
parallel via React Query. There is **no meaningful low-hanging fruit left** on
the code side — the remaining cost is physical distance.

## The real fix: move the database to a region near the users (~10×)

The users are in India; the DB is ~11,000 km away in Sydney. Moving the database
to **Supabase Mumbai (`ap-south-1`)** would take every query from ~470 ms to
~30–50 ms — a **roughly 10× speedup across the entire app**, not just login.
No code change can beat this, because no code change can shorten the wire.

Supabase can't relocate a project in place, so the plan is: stand up a new
project in Mumbai, copy the data, and cut over the connection settings.

### Step-by-step

1. **Create a new Supabase project** in region **South Asia (Mumbai) `ap-south-1`**.
   Note its project ref, database password, and connection details.

2. **Dump the current (Sydney) database.** Use the **direct** connection
   (`db.<ref>.supabase.co:5432`), _not_ the pooler — pgbouncer can't stream a
   full dump:
   ```bash
   pg_dump \
     "postgresql://postgres:<OLD_PW>@db.ypgkyytgpszlfhosolec.supabase.co:5432/postgres?sslmode=require" \
     --no-owner --no-privileges -Fc -f workforceiq_sydney.dump
   ```

3. **Restore into the Mumbai project** (again the direct connection of the *new* project):
   ```bash
   pg_restore \
     --no-owner --no-privileges --clean --if-exists \
     -d "postgresql://postgres:<NEW_PW>@db.<NEW_REF>.supabase.co:5432/postgres?sslmode=require" \
     workforceiq_sydney.dump
   ```

4. **Verify row counts match** before cutting over (run against both, compare):
   ```sql
   SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;
   ```
   Confirm the 33 tables and their counts line up with the Sydney source.

5. **Update the connection settings** to point at Mumbai — in the root `.env`
   **and** in the Render service's environment (they must match):
   ```
   DB_HOST=aws-1-ap-south-1.pooler.supabase.com   # Mumbai session pooler host
   DB_USER=postgres.<NEW_REF>
   DB_PASSWORD=<NEW_PW>
   # DB_PORT=5432, DB_NAME=postgres, DB_SSL=true stay the same
   ```
   (Confirm the exact pooler host in the new project's **Connect** dialog.)

6. **Restart the API** and re-run the profiler (below). Round-trips should drop
   from ~470 ms to ~30–50 ms.

7. Once verified in production, **pause/delete the old Sydney project** so writes
   can't accidentally split-brain across two databases.

> ⚠️ Do this during a quiet window. Between the dump and the cut-over, any writes
> made to Sydney won't be in Mumbai. For a near-zero-downtime move, put the app in
> read-only/maintenance mode during the copy, or dump at a known-quiet time.

### Re-measure after the move

```bash
# round-trip latency (run from apps/api with the new .env in place)
node -e "const{Pool}=require('pg');const p=new Pool({/* new Mumbai creds, ssl:{rejectUnauthorized:false} */});(async()=>{await p.query('SELECT 1');const t=process.hrtime.bigint();await p.query('SELECT 1');console.log('round-trip ms:',Number(process.hrtime.bigint()-t)/1e6);await p.end();})()"
```

## Secondary levers (small, only worth it after the region move)

- **Production build for the web app.** `next dev` compiles each route on first
  visit, so the first navigation to any page is always slow in development. The
  deployed `next build` output does not have this cost — dev-mode first-hit
  slowness is not representative of production.
- **Redis.** It's currently not running locally; background job queues (Bull)
  need it, but login and the core app work fine without it. Only queue-based
  features (some notifications/async jobs) are affected.
- **Per-endpoint round-trip trims.** A couple of employee-facing `/me` endpoints
  resolve the caller's `staff_id` in one round-trip and then run the main query
  in a second. These could be collapsed into a single query with a subselect,
  but it only saves ~one round-trip on employee-only screens — not worth the
  churn until the DB is close, at which point it barely matters.
