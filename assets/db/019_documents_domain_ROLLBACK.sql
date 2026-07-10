-- 019_documents_domain_ROLLBACK.sql
-- Reverses 019_documents_domain.sql. Drops the new document tables/columns/permissions and
-- restores the 016 staff_documents shape (base64 vault). NOTE: any document numbers stored
-- app-encrypted, any Supabase Storage objects, and any version/audit history added under 019
-- are lost by this rollback (Storage objects must be pruned out-of-band).
BEGIN;

-- Permissions
DELETE FROM role_permissions WHERE permission IN ('documents:reveal','documents:status');

-- Audit + versions
DROP TABLE IF EXISTS document_access_logs;
DROP TABLE IF EXISTS staff_document_versions;

-- staff_documents extensions
DROP INDEX IF EXISTS uq_staff_documents_active_type;
DROP INDEX IF EXISTS idx_staff_documents_tenant_del;
DROP INDEX IF EXISTS idx_staff_documents_expires;
DROP INDEX IF EXISTS idx_staff_documents_type_status;
DROP TRIGGER IF EXISTS trg_staff_documents_updated_at ON staff_documents;

ALTER TABLE staff_documents
    DROP COLUMN IF EXISTS document_type_id,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS current_version,
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS doc_number_encrypted,
    DROP COLUMN IF EXISTS storage_key,
    DROP COLUMN IF EXISTS content_encrypted,
    DROP COLUMN IF EXISTS updated_by,
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS deleted_at;

-- Restore the 016 constraints. Re-adding NOT NULL will fail if any Storage-backed rows left
-- content_base64 NULL — clear those first if you truly need the strict 016 shape.
ALTER TABLE staff_documents ALTER COLUMN content_base64 SET NOT NULL;
ALTER TABLE staff_documents ADD CONSTRAINT staff_documents_doc_type_check
    CHECK (doc_type IN ('aadhaar','pan','bank_passbook','driving_license','passport',
                        'voter_id','police_verification','contract','other'));

-- Lookup
DROP TRIGGER IF EXISTS trg_document_types_updated_at ON document_types;
DROP TABLE IF EXISTS document_types;

COMMIT;
