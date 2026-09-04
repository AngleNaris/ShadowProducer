CREATE TABLE IF NOT EXISTS script_presence_connections (
  connection_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  instance_id TEXT NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id, document_id)
    REFERENCES script_documents(project_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS script_presence_connections_scope_active_idx
  ON script_presence_connections(
    project_id,
    document_id,
    account_id,
    lease_expires_at DESC
  );
