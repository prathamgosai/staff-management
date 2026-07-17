-- 028_position_playbook_seed_ROLLBACK.sql
-- Removes ONLY the seeded drafts — rows still flagged is_draft = TRUE and never touched by a
-- manager. Anything approved (is_draft = FALSE) or edited is left alone: those are your
-- team's words, not the seed's, and must survive a rollback of the seed.
BEGIN;

DELETE FROM position_kpis WHERE is_draft = TRUE AND updated_by IS NULL;
DELETE FROM position_sops WHERE is_draft = TRUE AND updated_by IS NULL;

COMMIT;
