CREATE TABLE IF NOT EXISTS script_presence (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  version_id TEXT,
  cursor_start INTEGER CHECK (cursor_start IS NULL OR cursor_start >= 0),
  cursor_end INTEGER CHECK (cursor_end IS NULL OR cursor_end >= 0),
  editing BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, document_id, account_id),
  FOREIGN KEY (project_id, document_id)
    REFERENCES script_documents(project_id, id) ON DELETE CASCADE,
  CHECK (cursor_start IS NULL OR cursor_end IS NULL OR cursor_end >= cursor_start)
);

CREATE INDEX IF NOT EXISTS script_presence_scope_updated_idx
  ON script_presence(project_id, document_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_script_realtime_cursor_idx
  ON audit_logs(project_id, ((metadata ->> 'documentId')), id)
  WHERE action IN (
    'script.updated',
    'script.version.created',
    'script.comment.created',
    'script.comment.resolved',
    'script.comment.reopened'
  );
