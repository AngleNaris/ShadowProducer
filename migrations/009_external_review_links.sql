CREATE TABLE IF NOT EXISTS review_links (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  can_comment boolean NOT NULL DEFAULT false,
  can_compare boolean NOT NULL DEFAULT false,
  can_download boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  password_salt text,
  password_hash text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by_account_id text NOT NULL REFERENCES accounts(id),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by_account_id, project_id, idempotency_key),
  CHECK ((password_salt IS NULL) = (password_hash IS NULL))
);

CREATE TABLE IF NOT EXISTS review_link_files (
  link_id text NOT NULL REFERENCES review_links(id) ON DELETE CASCADE,
  file_id text NOT NULL REFERENCES review_files(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (link_id, file_id)
);

CREATE TABLE IF NOT EXISTS review_sessions (
  id text PRIMARY KEY,
  link_id text NOT NULL REFERENCES review_links(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  display_name text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(display_name)) > 0)
);

CREATE INDEX IF NOT EXISTS review_links_project_created
  ON review_links(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS review_sessions_link_active
  ON review_sessions(link_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS review_session_receipts (
  review_session_id text NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  domain text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_session_id, domain, idempotency_key)
);

ALTER TABLE audit_logs
  ALTER COLUMN actor_account_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS review_session_id text REFERENCES review_sessions(id) ON DELETE SET NULL;

ALTER TABLE review_comments
  ALTER COLUMN author_account_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS review_session_id text REFERENCES review_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS guest_display_name text;

CREATE UNIQUE INDEX IF NOT EXISTS review_comments_guest_idempotency
  ON review_comments(file_id, review_session_id, idempotency_key)
  WHERE review_session_id IS NOT NULL;

ALTER TABLE review_files
  ADD COLUMN IF NOT EXISTS approved_by_review_session_id text
    REFERENCES review_sessions(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'review_comments_review_session_id_fkey'
      AND confdeltype = 'n'
  ) THEN
    ALTER TABLE review_comments
      DROP CONSTRAINT review_comments_review_session_id_fkey,
      ADD CONSTRAINT review_comments_review_session_id_fkey
        FOREIGN KEY (review_session_id) REFERENCES review_sessions(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_actor_type_check'
  ) THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_actor_type_check
      CHECK (actor_type IN ('member', 'guest', 'agent', 'system'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_comments_author_check'
  ) THEN
    ALTER TABLE review_comments
      ADD CONSTRAINT review_comments_author_check
      CHECK (
        (author_account_id IS NOT NULL AND review_session_id IS NULL AND guest_display_name IS NULL)
        OR
        (author_account_id IS NULL AND review_session_id IS NOT NULL AND guest_display_name IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_files_approver_check'
  ) THEN
    ALTER TABLE review_files
      ADD CONSTRAINT review_files_approver_check
      CHECK (approved_by_account_id IS NULL OR approved_by_review_session_id IS NULL);
  END IF;
END $$;
