CREATE TABLE IF NOT EXISTS media_analysis_jobs (
  id text PRIMARY KEY,
  asset_id text NOT NULL REFERENCES team_assets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind = 'shot_detection'),
  tool text NOT NULL CHECK (tool = 'ffmpeg_scene_v1'),
  trigger_kind text NOT NULL CHECK (trigger_kind = 'manual'),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued',
      'processing',
      'awaiting_confirmation',
      'completed',
      'failed',
      'cancelled',
      'expired'
    )
  ),
  triggered_by_account_id text NOT NULL REFERENCES accounts(id),
  source_asset_name text NOT NULL,
  source_checksum_sha256 text NOT NULL,
  source_object_key text NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  lease_expires_at timestamptz,
  failure_stage text CHECK (
    failure_stage IN ('authorization', 'download', 'probe', 'detect', 'keyframe', 'persist')
  ),
  last_error text,
  shot_count integer NOT NULL DEFAULT 0 CHECK (shot_count >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  completed_at timestamptz,
  CHECK (length(trim(source_asset_name)) > 0),
  CHECK (length(source_checksum_sha256) = 64),
  CHECK (length(trim(source_object_key)) > 0)
);

CREATE INDEX IF NOT EXISTS media_analysis_jobs_claim
  ON media_analysis_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS media_analysis_jobs_asset_created
  ON media_analysis_jobs(asset_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS media_analysis_jobs_one_active
  ON media_analysis_jobs(asset_id, kind, tool)
  WHERE status IN ('queued', 'processing');

CREATE TABLE IF NOT EXISTS media_analysis_shots (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES media_analysis_jobs(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  start_us bigint NOT NULL CHECK (start_us >= 0),
  end_us bigint NOT NULL CHECK (end_us > start_us),
  keyframe_us bigint NOT NULL CHECK (keyframe_us >= start_us AND keyframe_us < end_us),
  keyframe_object_key text NOT NULL,
  state text NOT NULL DEFAULT 'candidate' CHECK (state IN ('candidate', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequence),
  CHECK (length(trim(keyframe_object_key)) > 0)
);

CREATE INDEX IF NOT EXISTS media_analysis_shots_job_sequence
  ON media_analysis_shots(job_id, sequence);
