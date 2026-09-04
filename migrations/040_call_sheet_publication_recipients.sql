CREATE TABLE IF NOT EXISTS call_sheet_publication_recipients (
  id text PRIMARY KEY,
  publication_id text NOT NULL REFERENCES call_sheet_publications(id) ON DELETE CASCADE,
  call_sheet_id text NOT NULL REFERENCES call_sheets(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  recipient_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  notification_id text REFERENCES notifications(id) ON DELETE SET NULL,
  recipient_snapshot jsonb NOT NULL,
  delivered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_id, recipient_account_id)
);

CREATE INDEX IF NOT EXISTS call_sheet_publication_recipients_history
  ON call_sheet_publication_recipients(publication_id, created_at);
