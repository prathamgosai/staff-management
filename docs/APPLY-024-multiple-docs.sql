-- APPLY-024-multiple-docs.sql
-- Run this ONCE in the Supabase SQL Editor to enable MULTIPLE documents of the same type per
-- staff member. Until it runs, the app still works but a same-type re-upload collapses into a
-- new version (the old one-per-type behavior) instead of listing both. Safe to run more than once.
--
-- After this, the app behaves as: every "Upload" = a new listed document (multiples allowed);
-- the ↻ button on a document adds a new *version* of that specific document.

BEGIN;

-- Remove the one-active-document-per-(staff,type) constraint …
DROP INDEX IF EXISTS uq_staff_documents_active_type;

-- … and keep a plain (non-unique) index for fast per-(staff,type) lookups.
CREATE INDEX IF NOT EXISTS idx_staff_documents_staff_type
    ON staff_documents (staff_id, document_type_id) WHERE deleted_at IS NULL;

COMMIT;

-- ── verify ───────────────────────────────────────────────────────────────────
-- Expect: uq_staff_documents_active_type ABSENT, idx_staff_documents_staff_type PRESENT.
SELECT indexname
  FROM pg_indexes
 WHERE tablename = 'staff_documents'
   AND indexname IN ('uq_staff_documents_active_type', 'idx_staff_documents_staff_type')
 ORDER BY indexname;
