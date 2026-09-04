BEGIN;

ALTER TABLE review_files
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS review_files_project_archived_updated_idx
  ON review_files (project_id, archived_at, updated_at DESC);

COMMIT;
