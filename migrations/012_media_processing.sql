CREATE TABLE IF NOT EXISTS asset_media (
  asset_id text PRIMARY KEY REFERENCES team_assets(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  duration_us bigint,
  width integer,
  height integer,
  frame_rate_numerator integer,
  frame_rate_denominator integer,
  video_codec text,
  audio_codec text,
  format_name text,
  rotation_degrees integer,
  is_vfr boolean,
  thumbnail_object_key text,
  review_proxy_object_key text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS media_processing_jobs (
  asset_id text PRIMARY KEY REFERENCES team_assets(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS media_processing_jobs_claim_idx
  ON media_processing_jobs(status, available_at, created_at);
