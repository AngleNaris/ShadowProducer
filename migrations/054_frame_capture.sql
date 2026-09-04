ALTER TABLE media_analysis_jobs
  ADD COLUMN IF NOT EXISTS requested_timecode_us bigint;

ALTER TABLE media_analysis_jobs
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_kind_check,
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_tool_check,
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_kind_timecode_check;

ALTER TABLE media_analysis_jobs
  ADD CONSTRAINT media_analysis_jobs_kind_check
    CHECK (kind IN ('shot_detection', 'frame_capture')),
  ADD CONSTRAINT media_analysis_jobs_tool_check
    CHECK (tool IN ('ffmpeg_scene_v1', 'ffmpeg_frame_v1')),
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
  );
