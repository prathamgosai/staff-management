-- 016_staff_documents_ROLLBACK.sql
-- Reverses 016_staff_documents.sql: removes the staff:documents permission grants and
-- restores the original 001_schema staff_documents scaffold (external file_url model).
-- NOTE: any documents uploaded under 016 are lost — their bytes lived only in this table.
BEGIN;

DELETE FROM role_permissions WHERE permission = 'staff:documents';

DROP TABLE IF EXISTS staff_documents;

-- Recreate the original 001_schema shape.
CREATE TABLE staff_documents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    type         VARCHAR(30) NOT NULL,
    name         VARCHAR(200) NOT NULL,
    file_url     TEXT NOT NULL,
    expiry_date  DATE,
    uploaded_by  UUID REFERENCES users(id),
    uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;
