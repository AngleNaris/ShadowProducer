CREATE TABLE IF NOT EXISTS breakdown_items (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category text NOT NULL,
  item text NOT NULL,
  specification text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  source text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  confidence integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  state text NOT NULL DEFAULT '待确认' CHECK (state IN ('待确认', '已确认')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(item)) > 0),
  CHECK (length(trim(source)) > 0)
);

CREATE INDEX IF NOT EXISTS breakdown_items_project_category
  ON breakdown_items(project_id, category, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS call_sheets (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date_label text NOT NULL,
  day_label text NOT NULL DEFAULT '待安排',
  title text NOT NULL,
  status text NOT NULL DEFAULT '草稿' CHECK (status IN ('草稿', '待确认', '已发布')),
  crew_call text NOT NULL DEFAULT '待定',
  first_shot text NOT NULL DEFAULT '待定',
  wrap_time text NOT NULL DEFAULT '待定',
  weather text NOT NULL DEFAULT '待更新',
  sunrise text NOT NULL DEFAULT '待更新',
  sunset text NOT NULL DEFAULT '待更新',
  basecamp text NOT NULL DEFAULT '待安排',
  location text NOT NULL DEFAULT '待安排',
  hospital text NOT NULL DEFAULT '待更新',
  scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  cast_members jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(date_label)) > 0),
  CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS call_sheets_project_date
  ON call_sheets(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review_files (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  version text NOT NULL,
  type text NOT NULL CHECK (type IN ('folder', 'video')),
  status text NOT NULL CHECK (status IN ('待审阅', '审阅中', '已通过', '处理中')),
  duration text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS review_files_project_updated
  ON review_files(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS review_comments (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id text NOT NULL REFERENCES review_files(id) ON DELETE CASCADE,
  version text NOT NULL,
  author_account_id text NOT NULL REFERENCES accounts(id),
  timecode text NOT NULL,
  text text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'resolved')),
  idempotency_key text NOT NULL,
  request_hash text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, author_account_id, idempotency_key),
  CHECK (length(trim(text)) > 0)
);

CREATE INDEX IF NOT EXISTS review_comments_file_time
  ON review_comments(file_id, created_at ASC);
