CREATE TABLE IF NOT EXISTS asset_folders (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  parent_id text REFERENCES asset_folders(id) ON DELETE RESTRICT,
  name text NOT NULL,
  created_by_account_id text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS asset_folders_team_parent_name_unique
  ON asset_folders (team_id, COALESCE(parent_id, ''), lower(name))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS asset_folders_team_parent_idx
  ON asset_folders (team_id, parent_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS team_assets (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  folder_id text REFERENCES asset_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('视频', '图片', '音频', '文档')),
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  object_key text UNIQUE,
  checksum_sha256 text,
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'ready', 'failed')),
  favorite boolean NOT NULL DEFAULT false,
  rating integer NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  tags text[] NOT NULL DEFAULT '{}',
  note text NOT NULL DEFAULT '',
  thumbnail_url text,
  created_by_account_id text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS team_assets_team_updated_idx
  ON team_assets (team_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS team_assets_team_folder_idx
  ON team_assets (team_id, folder_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS team_assets_team_project_idx
  ON team_assets (team_id, project_id, updated_at DESC)
  WHERE archived_at IS NULL;
