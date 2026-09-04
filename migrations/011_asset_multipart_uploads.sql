CREATE TABLE IF NOT EXISTS asset_multipart_uploads (
  asset_id text PRIMARY KEY REFERENCES team_assets(id) ON DELETE CASCADE,
  upload_id text NOT NULL UNIQUE,
  part_size_bytes integer NOT NULL CHECK (part_size_bytes >= 5 * 1024 * 1024),
  total_parts integer NOT NULL CHECK (total_parts > 0 AND total_parts <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

