# Phase 1 — Employee Documents Module (F1 + F7 docs tables)

> Part of the Workforce Intelligence extension (see `docs/PLAN.md`). Extends the existing 016
> staff-document vault into a compliance-grade module. **Additive & reversible. No existing
> module was rewritten.** Branch: `perf/login-latency`.

## What shipped

**Migration `019_documents_domain.sql` (+ `_ROLLBACK`)** — additive:
- `document_types` lookup (14 seeded: Aadhaar…Other) with `is_mandatory` / `requires_number`
  / `requires_expiry`. Mandatory (company-wide) = Aadhaar, PAN, Bank Passbook.
- `staff_documents` extended: `document_type_id`, `status` (valid/expired/pending),
  `current_version`, `notes`, `doc_number_encrypted`, `storage_key`, `content_encrypted`,
  `updated_by/at`, `deleted_at`; `content_base64` relaxed to nullable; the 016 `doc_type`
  CHECK dropped (HR-defined types now allowed); indexes on `(type,status)`, `(expires_on)`,
  `(tenant,deleted_at)`, and a unique active `(staff, type)`.
- `staff_document_versions` (DocumentHistory) — replace archives the prior file, never deletes.
- `document_access_logs` — immutable, insert-only (upload/view/download/reveal/replace/delete/denied).
- Permissions seeded: `documents:reveal` (admin/hr), `documents:status` (admin/hr/head_of_house/chef).

**API** (`modules/staff-documents`):
- `DocumentCryptoService` — AES-256-GCM for bytes + numbers; HMAC short-lived signed-download tokens.
- `DocumentStorageService` — Supabase Storage (private bucket, REST via axios); encrypted-in-DB fallback.
- `file-signature.ts` — magic-byte + extension validation (rejects a `.png` carrying PDF bytes).
- `document-rules.ts` — pure `deriveStatus` / `maskNumber`.
- Endpoints: `POST/GET/DELETE /staff/:id/documents`, `GET …/:docId/content`;
  `GET /documents/:id/versions`, `GET /documents/:id/download` (signed URL, rate-limited),
  `POST /documents/:id/reveal-number` (documents:reveal, audited incl. denials, rate-limited),
  `GET /documents/:id/file?token=` (token-gated, no JWT), `GET /documents/expiring|missing|widgets`,
  `CRUD /settings/document-types`.
- `DocumentExpiryScheduler` — daily `@Cron(01:15 Asia/Kolkata)` flips past-expiry docs → expired (idempotent).
- `main.ts` JSON body limit → `MAX_JSON_BODY` (default 16mb) for 10 MB uploads.

**Web**:
- `DocumentsCard` (staff profile + read-only `/profile`): dynamic types, 4-state status pill,
  **embedded PDF `<iframe>` + image lightbox**, reveal-number, signed download, version history drawer.
- `/documents` compliance page: expiring/missing/recently-uploaded widgets + Missing (Aadhaar/PAN/Bank) and Expiring (30/60/90) filters.
- `/settings/document-types` manager. Compact dashboard `DocumentsWidget`. Nav entries added.

**Tests** (Jest, API): `file-signature.spec`, `document-rules.spec`, `document-crypto.service.spec` — 27 tests (magic-byte spoof rejection, status edge cases incl. expiry = today, mask forms, AES round-trip + GCM tamper detection, signed-token expiry/tamper).

## DoD status
`tsc --noEmit` clean (api + web) · `pnpm lint` 0 errors · `pnpm test` 29/29 · `pnpm build` ✓ · existing `auth.service.spec` still green · RBAC server-side + immutable audit log · loading/empty/error states on every new screen.

## Acceptance criteria → evidence
- **Upload → preview → replace → history shows v1 & v2 (actors/timestamps)** — versioning in `replaceInto`; `VersionsDrawer` renders `replacedAt`. *(e2e needs 019 applied.)*
- **"Missing PAN" returns exactly the right staff** — `GET /documents/missing?type=pan` (active staff, no active PAN doc, outlet-scoped).
- **30-day widget matches DB truth** — `GET /documents/widgets` counts via IST `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`.
- **Supervisor opening an Aadhaar is denied + audit-logged** — reveal/content authorize in-service; denials write a `denied` access-log row.
- **Crafted `.png` with PDF magic bytes is rejected** — `validateSignature` → 400 (unit-tested).

## Human-ops steps to activate (in order)
1. Apply migrations **013→018** (still pending on live), then **`019_documents_domain.sql`**.
2. Set **`DOCUMENT_ENCRYPTION_KEY`** (32 bytes hex/base64) — without it, bytes/numbers store UNENCRYPTED (dev only). Optionally `DOCUMENT_SIGN_SECRET`.
3. Create a **private Supabase Storage bucket** `staff-documents` and set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (+ `SUPABASE_DOCUMENTS_BUCKET`). Without these, bytes fall back to encrypted-in-DB.
4. Re-grant permissions: 019 seeds `documents:reveal`/`documents:status`; admin/hr already have rows so the seed is what grants them on live.

## Known limitations / notes
- **Aadhaar full number is now stored encrypted** (reveal-capable), reversing 016's masked-only stance — gated by `documents:reveal` + audited. Veto per-type by leaving `docNumber` blank or setting `requires_number=false`.
- Version history is **metadata-only** in the UI (actors/timestamps); fetching an old version's bytes is a later nice-to-have.
- On a mid-insert failure a Storage object can orphan (best-effort; no txn across Storage+DB).
