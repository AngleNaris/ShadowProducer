ALTER TABLE analysis_workflows
  ADD COLUMN IF NOT EXISTS approval_threshold integer NOT NULL DEFAULT 90;

ALTER TABLE analysis_workflows
  DROP CONSTRAINT IF EXISTS analysis_workflows_approval_policy_check;
ALTER TABLE analysis_workflows
  ADD CONSTRAINT analysis_workflows_approval_policy_check
  CHECK (approval_policy IN ('manual_confirmation', 'confidence_threshold'));

ALTER TABLE analysis_workflows
  DROP CONSTRAINT IF EXISTS analysis_workflows_approval_threshold_check;
ALTER TABLE analysis_workflows
  ADD CONSTRAINT analysis_workflows_approval_threshold_check
  CHECK (approval_threshold BETWEEN 0 AND 100);

ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS approval_policy text NOT NULL DEFAULT 'manual_confirmation';
ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS approval_threshold integer NOT NULL DEFAULT 90;

ALTER TABLE analysis_jobs
  DROP CONSTRAINT IF EXISTS analysis_jobs_approval_policy_check;
ALTER TABLE analysis_jobs
  ADD CONSTRAINT analysis_jobs_approval_policy_check
  CHECK (approval_policy IN ('manual_confirmation', 'confidence_threshold'));

ALTER TABLE analysis_jobs
  DROP CONSTRAINT IF EXISTS analysis_jobs_approval_threshold_check;
ALTER TABLE analysis_jobs
  ADD CONSTRAINT analysis_jobs_approval_threshold_check
  CHECK (approval_threshold BETWEEN 0 AND 100);

ALTER TABLE analysis_jobs
  DROP CONSTRAINT IF EXISTS analysis_jobs_manual_approval_check;
ALTER TABLE analysis_jobs
  ADD CONSTRAINT analysis_jobs_manual_approval_check
  CHECK (trigger_kind <> 'manual' OR approval_policy = 'manual_confirmation');
