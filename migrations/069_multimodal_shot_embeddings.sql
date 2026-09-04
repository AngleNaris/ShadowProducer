ALTER TABLE media_analysis_jobs
  DROP CONSTRAINT IF EXISTS media_analysis_jobs_failure_stage_check;

ALTER TABLE media_analysis_jobs
  ADD CONSTRAINT media_analysis_jobs_failure_stage_check CHECK (
    failure_stage IN (
      'authorization',
      'download',
      'probe',
      'prepare',
      'detect',
      'transcribe',
      'ocr',
      'keyframe',
      'vision',
      'persist'
    )
  );

ALTER TABLE asset_embedding_jobs
  DROP CONSTRAINT IF EXISTS asset_embedding_jobs_analysis_job_id_key,
  DROP CONSTRAINT IF EXISTS asset_embedding_jobs_analysis_sequence_unique,
  DROP CONSTRAINT IF EXISTS asset_embedding_jobs_source_kind_check;

ALTER TABLE asset_embedding_jobs
  ADD CONSTRAINT asset_embedding_jobs_source_kind_check CHECK (
    source_kind IN ('transcription', 'ocr', 'vision')
  ),
  ADD CONSTRAINT asset_embedding_jobs_analysis_sequence_unique UNIQUE (
    analysis_job_id,
    sequence
  );
