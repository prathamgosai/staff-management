# Go‑live runbook — finish the Render deployment

Everything code‑side is done and pushed to `prathamgosai/staff-management` `main`.
These are the **4 remaining steps only you can do** (they need Supabase / Render
access). Do them in order. Step 1 is the one that actually lets you log in.

---

## ✅ Step 1 — Reset the admin password (unblocks login) · ~1 min

Supabase → your project → **SQL Editor** → **New query** → replace
`CHOOSE_A_STRONG_PASSWORD` with a password you pick → paste → **Run**:

```sql
UPDATE users
SET password_hash        = crypt('CHOOSE_A_STRONG_PASSWORD', gen_salt('bf', 12)),
    must_change_password = false,
    is_active            = true,
    password_updated_at  = now()
WHERE email = 'admin@workforceiq.app';
```

Expect **`Success. 1 row affected.`** (If you get `function crypt does not exist`,
run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` once, then re‑run.)

Then log in at **https://staff-management-yf21.onrender.com/login**
- Email: `admin@workforceiq.app`
- Password: the one you just chose
- If it says "too many attempts", wait 60 s and try **once**. If the first try
  after idle is slow/errors, wait ~1 min (the API is waking) and retry.

---

## ✅ Step 2 — Make the API fixes live (health route + faster login after idle)

Your API (`bookends-shiftly`) still deploys from the old repo. Point it at the
one with the fixes:

Render → **`bookends-shiftly`** service → **Settings → Build & Deploy → Repository**
→ change to **`prathamgosai/staff-management`**, branch **`main`** →
**Manual Deploy → Deploy latest commit** → set **Auto‑Deploy = On**.

Verify (should return JSON, not a 404):
`https://bookends-shiftly.onrender.com/api/v1/health` → `{"status":"ok", ...}`

---

## ✅ Step 3 — Rotate the database password (security) · important

The current Supabase DB password is weak and the endpoint is public.

1. Supabase → **Settings → Database → Reset database password** → use 32+ random
   chars (e.g. run `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`).
2. Update `DB_PASSWORD` in **both** the Render `bookends-shiftly` service
   (Environment, `sync:false`) **and** your local `.env`.
3. Enable Supabase **network restrictions / IP allow‑list**.

Details: [SUPABASE-WIRING.md](SUPABASE-WIRING.md) §5.

---

## ✅ Step 4 — Stop the cold starts (optional) · keep‑warm

Free services sleep after 15 min → slow/502 first load. Either:
- **Free:** a pinger (UptimeRobot / cron‑job.org), 2 monitors every 5–10 min:
  `…/api/v1/health` (API) and `/` (web). ⚠️ Pinging both 24/7 can exhaust the
  free monthly hours — ping only during active hours, **or**
- **Reliable:** upgrade the API to a paid Starter instance (~$7/mo, never sleeps).

---

### Where things stand
| Item | State |
|---|---|
| Web app (login page, cold‑start messages) | ✅ live |
| API health route + DB keep‑warm/latency fix | ⏳ needs Step 2 |
| Admin login | ⏳ needs Step 1 |
| DB password security | ⏳ needs Step 3 |
| Cold starts | ⏳ needs Step 4 |
