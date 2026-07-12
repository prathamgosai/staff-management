# Owner Actions — Hardening Roadmap

These are the roadmap items that **cannot be done in code** — they need you to act on
Supabase, Render, or GitHub. Ordered by priority. The code-side work (batches A–E) is
already committed on branch `feat/roadmap-hardening`; this file covers the rest.

> Context: the live **web** app deploys from `prathamgosai/staff-management` (Render
> `staff-management-yf21`); the **API** deploys from a *different, diverged* repo
> (`bookendskg/Bookends-Shiftly`). The DB is external Supabase (Sydney). See the
> project's deploy notes.

---

## 1. Lock down the database (irreversible-loss risk — do first)

- [ ] **Rotate the DB password** to a 32+ char random string. The public endpoint, DB
      name, and owner-level `postgres.<ref>` user are in a public repo, so the password is
      the only barrier. Update `DB_PASSWORD` in Render (API service) after rotating.
- [ ] **Enable Supabase network restrictions** (allow only Render's egress + your IP).
- [ ] **Confirm backups / PITR.** On the free tier there is no point-in-time recovery and
      the project auto-pauses after ~7 days idle. Move to a paid tier for daily backups +
      PITR, **or** add a scheduled off-site `pg_dump` (e.g. a nightly GitHub Action).
- [ ] **Create a least-privilege app role** (SELECT/INSERT/UPDATE/DELETE on the app schema
      only) and point the API at it instead of the owner `postgres` user.

## 2. Apply the pending migrations (run once in the Supabase SQL editor)

Run in this order, each is idempotent:

- [ ] `docs/APPLY-024-multiple-docs.sql` — enables multiple documents of the same type per
      staff member (the API already expects this; until applied, a same-type re-upload 500s).
- [ ] `docs/APPLY-025-perf-and-integrity.sql` — login/refresh indexes, divisor CHECK
      constraints, and reconciles the out-of-band `users.pending_approval` / `ticket_number`
      columns.

After running, the verify `SELECT`s at the bottom of `APPLY-025` should list all four
`idx_*` and five `chk_*` objects.

## 3. Set the document encryption key (before real PII)

- [ ] Generate a 32-byte key: `openssl rand -base64 32`
- [ ] Set `DOCUMENT_ENCRYPTION_KEY` in the API's Render env. Without it, uploaded document
      bytes/numbers are stored **unencrypted** (the service logs a warning on boot).

## 4. Collapse the two-repo split-brain (do AFTER steps 2 & 3)

The API lagging in a separate repo means every fix needs a manual cross-org push, and that
repo is documented as "missing the entire documents feature."

- [ ] In Render, re-point the API service (`bookends-shiftly`) to
      **`prathamgosai/staff-management`**, branch `main`, auto-deploy on.
- [ ] Confirm the API build command matches `render.yaml`.
- [ ] Delete the local `bookends` git remote once the API deploys cleanly from the main repo.
- [ ] **Sequence matters:** apply migrations (step 2) and set `DOCUMENT_ENCRYPTION_KEY`
      (step 3) *first*, or the first build from the consolidated repo 500s on the document
      endpoints / new columns.

## 5. Turn the CI gate on

- [ ] `.github/workflows/ci.yml` is committed (lint → typecheck → test → build). In GitHub
      → Settings → Branches, add a **branch protection rule** on `main` requiring the
      `verify` check to pass before merge.

## 6. Set the timezone env (optional — code already defaults to IST)

- [ ] The API now pins Node + DB session TZ to `Asia/Kolkata` by default. To be explicit,
      set `APP_TZ=Asia/Kolkata` (and optionally `TZ=Asia/Kolkata`) in Render. Override only
      if you operate outlets in another timezone.

## 7. Stand up a staging tier (reduces "test in prod")

- [ ] Add a Render preview environment per-PR, **or** a long-lived staging API+web pair
      pointed at a *separate* Supabase project. This makes the repo-consolidation and any
      future migration deployable with confidence instead of validating against the sole
      live DB of 248 staff.

---

## Still pending in code (branch `feat/roadmap-hardening`)

Done & verified: **A** (CI, migration 025, dark-mode tokens, week-key test), **B**
(fail-closed global auth guard, pg-aware error filter, `assignStaff` batching, divisor
guards), **C1** (RBAC outlet-scoping + permission gates + atomic `reviewTransfer`), **E2/E3**
(IST timezone bucketing, slow-query logging).

Also done since: **D1** (set-based schedule generation), **D2** (staffing read-cache),
**E1** (audit logging), **C2** (class-validator DTOs for all inline `@Body()` handlers),
**F2** (RBAC scope contract tests).

### F1 — accessible modals (foundation shipped, per-page rollout needs browser QA)

`apps/web/src/components/ui/modal.tsx` is a new accessible `Modal` wrapper over the radix
`Dialog` primitive, with the same `open` / `onClose` / `title` API the 7 hand-rolled modals
already use — so each migration is a small, safe diff that adds a focus trap, Escape-to-close,
`aria-modal`, scroll-lock and focus restoration.

Rollout (do on a **Node 20** dev server so you can eyeball each one):

```tsx
// before
{isOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/40" onClick={onClose} />
    <div className="relative bg-card …"> …header… …form… …footer… </div>
  </div>
)}
// after
<Modal open={isOpen} onClose={onClose} title="…" description="…">
  …form… …footer…
</Modal>
```

Files with hand-rolled overlays to migrate + re-test (open / submit / close) one at a time:
`outlets/page.tsx`, `staff/page.tsx`, `staff/[id]/page.tsx`, `accounts/page.tsx`,
`allocation/page.tsx`, `leave/page.tsx`, `dashboard/page.tsx`. I stopped short of migrating
these blind because the web dev server can't run here (Node 24) and the visual/interaction
result must be verified in a browser.

### Full app-boot e2e (DONE — runnable)

`apps/api/test/rbac.e2e-spec.ts` boots the REAL app (AppModule — global guards live) against a
local Postgres, seeds an isolated throwaway tenant with two outlets + an outlet-A-scoped
head_of_house + an admin, and asserts through the full HTTP stack: unauthenticated → 401,
in-scope read → 200, **head_of_house approving a cross-outlet transfer → 403 (staff NOT moved)**,
admin approve → 200 (staff atomically moved). It cleans up the tenant afterwards and NEVER
touches the live `.env` DB (self-skips if the local DB isn't reachable).

To run it:
```
# 1. start the bundled portable Postgres on 5433 (has the app schema) + local Redis
.services/pgsql/bin/pg_ctl -D .services/pgdata -o "-p 5433" -l .services/pg.log start
node apps/api/scripts/ensure-redis.js
# 2.
pnpm --filter @workforceiq/api test:e2e
```
Override the target with `E2E_DB_HOST/E2E_DB_PORT/E2E_DB_NAME/E2E_DB_USER/E2E_DB_PASSWORD`.
It stays OUT of `pnpm test` (unit) / CI, since it needs a live DB.

> **Deploy note:** this branch is intentionally **not merged to `main` yet** — `main`
> auto-deploys the live web app. Review the diff, then merge when ready (ideally after the
> CI gate in step 5 is enforcing).
