CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  display_name text NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS team_memberships (
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role text NOT NULL,
  PRIMARY KEY (team_id, account_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS project_memberships (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role text NOT NULL,
  PRIMARY KEY (project_id, account_id)
);

CREATE TABLE IF NOT EXISTS script_documents (
  id text PRIMARY KEY,
  project_id text NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  current_version_id text NOT NULL
);

CREATE TABLE IF NOT EXISTS script_versions (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  id text NOT NULL,
  document_id text NOT NULL REFERENCES script_documents(id) ON DELETE CASCADE,
  meta text NOT NULL,
  badge text NOT NULL CHECK (badge IN ('当前', '历史')),
  content text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  is_current boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS script_versions_one_current
  ON script_versions(project_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS script_comments (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  version_id text NOT NULL,
  author_account_id text NOT NULL REFERENCES accounts(id),
  text text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (project_id, version_id)
    REFERENCES script_versions(project_id, id) ON DELETE CASCADE,
  UNIQUE (project_id, author_account_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS script_write_receipts (
  project_id text NOT NULL,
  version_id text NOT NULL,
  actor_account_id text NOT NULL REFERENCES accounts(id),
  idempotency_key text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, actor_account_id, idempotency_key),
  FOREIGN KEY (project_id, version_id)
    REFERENCES script_versions(project_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_account_id text NOT NULL REFERENCES accounts(id),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  subject_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
