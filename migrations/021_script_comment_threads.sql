ALTER TABLE script_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id text REFERENCES script_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS script_comments_parent_idx
  ON script_comments(project_id, parent_comment_id, created_at);
