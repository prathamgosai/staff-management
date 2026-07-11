# Go-Live Runbook — Staff Documents (upload fix + multiple documents)

All code is committed and pushed to **prathamgosai/staff-management** (`origin/main` = the web repo).
Three steps remain — they need YOUR hands because the auto-mode assistant is blocked from pushing
to the `bookends` org and from touching the live Supabase DB / Render env.

Do them in this order. ~5 minutes total.

---

## 1. Deploy the API code (required — without this, uploads 404 on Render)

The live API (`bookends-shiftly.onrender.com`) runs from **bookendskg/Bookends-Shiftly** and is missing
the entire documents feature. Push the code (clean fast-forward, no force):

```bash
git push bookends perf/login-latency:main
```

Render auto-builds `bookends-shiftly` on that push. Watch the deploy finish in the Render dashboard
(first request after may cold-start ~30–60 s on the free tier).

> Alternative (one-time): re-point the `bookends-shiftly` Render service to deploy from
> **prathamgosai/staff-management** instead, so future fixes flow without this manual push.

---

## 2. Apply migration 024 (required to list multiple docs of the same type)

Open the **Supabase SQL Editor** and paste the contents of **`docs/APPLY-024-multiple-docs.sql`**, then Run.
It drops the one-per-type unique index and adds a plain lookup index. Safe to run more than once.

Verify (the query at the bottom of that file) shows:
- `idx_staff_documents_staff_type` — PRESENT
- `uq_staff_documents_active_type` — ABSENT

> Migrations 016–023 are already applied. 024 is the only new one.
> Before 024 runs, uploads still work but a same-type re-upload versions the old file instead of
> listing both; the ↻ "replace" button works either way.

---

## 3. Encrypt document bytes on the live API (strongly recommended)

Without an encryption key, the API stores document files/numbers **unencrypted** in the DB. Set these on
the **`bookends-shiftly` Render service → Environment**, then redeploy:

| Env var | Value |
|---|---|
| `DOCUMENT_ENCRYPTION_KEY` | a 32-byte secret — generate with `openssl rand -hex 32` (run it yourself; never commit it) |
| `SUPABASE_URL` | your Supabase project URL (already used elsewhere) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (for private document Storage) |
| `SUPABASE_DOCUMENTS_BUCKET` | `staff-documents` (create this **private** bucket in Supabase Storage) |

If Storage envs are omitted, bytes fall back to **encrypted-in-DB** (fine, just larger rows). If the
key is omitted too, bytes are **plaintext** — avoid for real PII.

---

## Verify (after 1–3)

On `staff-management-yf21.onrender.com`, open any staff profile → Documents:

1. **Upload** an Aadhaar (image or PDF) → appears in the list. ✅ (this is the original bug — must succeed now)
2. **Upload** a second file of the SAME type → it appears as a **separate** document (not a hidden version). ✅ (needs step 2)
3. Click **↻** on a document, upload a new file → the old one moves to **Version history**. ✅
4. **Preview** and **Download** a document → opens correctly with the right file extension. ✅

## Rollback

- Migration 024: run `assets/db/024_documents_allow_multiple_per_type_ROLLBACK.sql` (recreates the unique
  index — will fail if duplicates already exist; de-dupe first, query included in the file).
- Code: the API repo can be reset to `5212cf6` if needed, but the changes are additive and backward-compatible.
