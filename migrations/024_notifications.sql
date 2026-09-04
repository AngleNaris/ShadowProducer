CREATE TABLE IF NOT EXISTS notification_preferences (
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  published_call_sheets boolean NOT NULL DEFAULT true,
  important_call_sheet_changes boolean NOT NULL DEFAULT true,
  PRIMARY KEY (account_id, team_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  recipient_account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_actor_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('call_sheet_published', 'call_sheet_changed')),
  subject_id text NOT NULL,
  dedup_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_account_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS notifications_recipient_team_created_idx
  ON notifications (recipient_account_id, team_id, created_at DESC);
