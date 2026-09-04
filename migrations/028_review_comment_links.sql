CREATE TABLE IF NOT EXISTS review_comment_links (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  comment_a_id text NOT NULL REFERENCES review_comments(id) ON DELETE CASCADE,
  comment_b_id text NOT NULL REFERENCES review_comments(id) ON DELETE CASCADE,
  created_by_account_id text NOT NULL REFERENCES accounts(id),
  removed_by_account_id text REFERENCES accounts(id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  CONSTRAINT review_comment_links_canonical_pair CHECK (comment_a_id < comment_b_id),
  CONSTRAINT review_comment_links_unique_pair UNIQUE (project_id, comment_a_id, comment_b_id)
);

CREATE INDEX IF NOT EXISTS review_comment_links_project_active
  ON review_comment_links (project_id, removed_at);
