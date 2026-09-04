ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT '筹备中',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE audit_logs
  ALTER COLUMN project_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS team_id text REFERENCES teams(id) ON DELETE CASCADE;

UPDATE audit_logs AS audit
SET team_id = project.team_id
FROM projects AS project
WHERE audit.team_id IS NULL AND audit.project_id = project.id;

CREATE TABLE IF NOT EXISTS command_receipts (
  actor_account_id text NOT NULL REFERENCES accounts(id),
  domain text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_account_id, domain, idempotency_key)
);

ALTER TABLE command_receipts
  ADD COLUMN IF NOT EXISTS request_hash text;

CREATE TABLE IF NOT EXISTS workspace_tasks (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  assignee_account_id text NOT NULL REFERENCES accounts(id),
  created_by_account_id text NOT NULL REFERENCES accounts(id),
  title text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT '待开始'
    CHECK (status IN ('待开始', '进行中', '等待他人', '已完成')),
  target_view text NOT NULL DEFAULT 'project',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS workspace_tasks_actor_team_active
  ON workspace_tasks(assignee_account_id, team_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS calendar_events (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  owner_account_id text NOT NULL REFERENCES accounts(id),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  original_timezone text NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'team', 'project')),
  target_view text NOT NULL DEFAULT 'calendar',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (length(trim(title)) > 0),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS calendar_events_actor_team_active
  ON calendar_events(owner_account_id, team_id, starts_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS workspace_notes (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  owner_account_id text NOT NULL REFERENCES accounts(id),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('note', 'sticky')),
  pinned boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (length(trim(title)) > 0),
  CHECK ((kind = 'note' AND project_id IS NOT NULL) OR kind = 'sticky')
);

CREATE INDEX IF NOT EXISTS workspace_notes_actor_team_active
  ON workspace_notes(owner_account_id, team_id, kind, pinned DESC, updated_at DESC)
  WHERE deleted_at IS NULL;
