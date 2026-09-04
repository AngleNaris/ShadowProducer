ALTER TABLE media_analysis_jobs
  ADD COLUMN IF NOT EXISTS provider TEXT;

ALTER TABLE media_analysis_jobs
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_tool_check,
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_kind_timecode_check,
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_provider_check;

-- Legacy local-tool values remain readable only for completed historical rows.
-- All runnable jobs are normalized below; application workers must never execute these tools.
UPDATE media_analysis_jobs
SET tool = CASE kind
  WHEN 'transcription' THEN 'openai_compatible_transcription_v1'
  WHEN 'ocr' THEN 'openai_compatible_vision_v1'
  ELSE tool
END
WHERE status IN ('queued', 'processing', 'failed')
  AND tool IN ('whisper_cpp_v1', 'tesseract_v1');

ALTER TABLE media_analysis_jobs
  ADD CONSTRAINT media_analysis_jobs_tool_check CHECK (
    tool IN (
      'ffmpeg_scene_v1',
      'ffmpeg_frame_v1',
      'openai_compatible_transcription_v1',
      'openai_compatible_vision_v1'
    )
    OR (
      tool IN ('whisper_cpp_v1', 'tesseract_v1')
      AND status IN ('awaiting_confirmation', 'completed', 'cancelled', 'expired')
    )
  ),
  ADD CONSTRAINT media_analysis_jobs_provider_check CHECK (
    provider IS NULL OR length(btrim(provider)) > 0
  ),
  ADD CONSTRAINT media_analysis_jobs_kind_timecode_check CHECK (
    (
      kind = 'shot_detection'
      AND tool = 'ffmpeg_scene_v1'
      AND requested_timecode_us IS NULL
    )
    OR
    (
      kind = 'frame_capture'
      AND tool = 'ffmpeg_frame_v1'
      AND requested_timecode_us >= 0
    )
    OR
    (
      kind = 'transcription'
      AND tool IN ('whisper_cpp_v1', 'openai_compatible_transcription_v1')
      AND requested_timecode_us IS NULL
    )
    OR
    (
      kind = 'ocr'
      AND tool IN ('tesseract_v1', 'openai_compatible_vision_v1')
      AND requested_timecode_us IS NULL
    )
  );

CREATE TABLE IF NOT EXISTS asset_embedding_jobs (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES team_assets(id) ON DELETE CASCADE,
  analysis_job_id TEXT NOT NULL UNIQUE REFERENCES media_analysis_jobs(id) ON DELETE CASCADE,
  source_revision INTEGER NOT NULL CHECK (source_revision > 0),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('transcription', 'ocr')),
  sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  content_text TEXT NOT NULL CHECK (length(btrim(content_text)) > 0),
  input_sha256 TEXT NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'succeeded', 'failed', 'expired')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  provider TEXT,
  model TEXT,
  dimensions INTEGER CHECK (dimensions > 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK (provider IS NULL OR length(btrim(provider)) > 0),
  CHECK (model IS NULL OR length(btrim(model)) > 0)
);

CREATE INDEX IF NOT EXISTS asset_embedding_jobs_claim_idx
  ON asset_embedding_jobs (status, available_at, created_at);
