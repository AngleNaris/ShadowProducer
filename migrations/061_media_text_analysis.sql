CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE media_analysis_jobs
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_kind_check,
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_tool_check,
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_kind_timecode_check,
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_failure_stage_check;

ALTER TABLE media_analysis_jobs
  ADD CONSTRAINT media_analysis_jobs_kind_check
    CHECK (kind IN ('shot_detection', 'frame_capture', 'transcription', 'ocr')),
  ADD CONSTRAINT media_analysis_jobs_tool_check
    CHECK (tool IN ('ffmpeg_scene_v1', 'ffmpeg_frame_v1', 'whisper_cpp_v1', 'tesseract_v1')),
  ADD CONSTRAINT media_analysis_jobs_failure_stage_check
    CHECK (failure_stage IN (
      'authorization',
      'download',
      'probe',
      'prepare',
      'detect',
      'transcribe',
      'ocr',
      'keyframe',
      'persist'
    )),
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
      AND tool = 'whisper_cpp_v1'
      AND requested_timecode_us IS NULL
    )
    OR
    (
      kind = 'ocr'
      AND tool = 'tesseract_v1'
      AND requested_timecode_us IS NULL
    )
  ),
  ADD COLUMN IF NOT EXISTS result_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS result_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS input_object_key text,
  ADD COLUMN IF NOT EXISTS runtime_version text,
  ADD COLUMN IF NOT EXISTS model_name text,
  ADD COLUMN IF NOT EXISTS model_sha256 text,
  ADD COLUMN IF NOT EXISTS language text;

ALTER TABLE media_analysis_jobs
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_result_segments_check,
  ADD CONSTRAINT media_analysis_jobs_result_segments_check
    CHECK (jsonb_typeof(result_segments) = 'array');

CREATE INDEX IF NOT EXISTS media_analysis_jobs_result_text_trgm_idx
  ON media_analysis_jobs USING gin (result_text gin_trgm_ops)
  WHERE status = 'completed' AND result_text <> '';
