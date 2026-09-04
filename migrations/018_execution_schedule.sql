CREATE TABLE IF NOT EXISTS execution_schedule_items (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  original_timezone text NOT NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  owner_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('未开始', '进行中', '已完成', '已暂停')),
  note text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS execution_schedule_resources (
  schedule_item_id text NOT NULL REFERENCES execution_schedule_items(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('cast', 'crew', 'location', 'equipment')),
  resource_id text NOT NULL,
  resource_name text NOT NULL,
  PRIMARY KEY (schedule_item_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS execution_schedule_items_project_time_idx
  ON execution_schedule_items(project_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS execution_schedule_resources_lookup_idx
  ON execution_schedule_resources(resource_type, resource_id, schedule_item_id);
