-- ROLLBACK for 024_documents_allow_multiple_per_type.sql
-- Restores the one-active-document-per-(staff,type) rule.
--
-- WARNING: this CREATE UNIQUE INDEX FAILS if, while multiples were allowed, any staff member
-- accumulated more than one active document of the same type. Resolve duplicates first, e.g.
-- soft-delete or re-file the extras:
--   SELECT staff_id, document_type_id, count(*)
--     FROM staff_documents WHERE deleted_at IS NULL
--     GROUP BY staff_id, document_type_id HAVING count(*) > 1;
BEGIN;

DROP INDEX IF EXISTS idx_staff_documents_staff_type;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_documents_active_type
    ON staff_documents (staff_id, document_type_id) WHERE deleted_at IS NULL;

COMMIT;
