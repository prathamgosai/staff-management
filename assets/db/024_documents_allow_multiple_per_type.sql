-- 024_documents_allow_multiple_per_type.sql
-- Allow MULTIPLE active documents of the SAME type per staff member.
--
-- Migration 019 added a partial UNIQUE index (uq_staff_documents_active_type) enforcing at most
-- one active (deleted_at IS NULL) document per (staff_id, document_type_id). That made every
-- re-upload of a type archive the prior file as a version instead of listing both — so a staff
-- member could only ever hold ONE Aadhaar, ONE "Other", ONE Education Certificate, etc.
--
-- Per product decision, each upload should be its own listed document (multiples allowed);
-- creating a new *version* of a specific document is now an explicit action (the API passes
-- replaceDocumentId). Dropping the unique index enables that. Everything else is unchanged:
-- the non-unique lookup index on (document_type_id, status) still serves "documents of type X".
--
-- ADDITIVE-COMPATIBLE + idempotent. Safe to run more than once. Reversible via the _ROLLBACK file
-- (which can only re-create the constraint if no duplicates exist by then).
BEGIN;

DROP INDEX IF EXISTS uq_staff_documents_active_type;

-- Keep a plain (non-unique) index on the same columns so per-(staff,type) lookups stay fast
-- now that the unique one is gone.
CREATE INDEX IF NOT EXISTS idx_staff_documents_staff_type
    ON staff_documents (staff_id, document_type_id) WHERE deleted_at IS NULL;

COMMIT;
