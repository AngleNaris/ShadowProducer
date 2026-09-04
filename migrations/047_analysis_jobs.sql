CREATE TABLE IF NOT EXISTS analysis_jobs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind = 'script_breakdown'),
  tool text NOT NULL CHECK (tool = 'deterministic_rules_v1'),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued',
      'processing',
      'awaiting_confirmation',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  triggered_by_account_id text NOT NULL REFERENCES accounts(id),
  source_document_id text NOT NULL REFERENCES script_documents(id) ON DELETE CASCADE,
  source_document_title text NOT NULL,
  source_version_id text NOT NULL,
  source_version_meta text NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  source_content text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  lease_expires_at timestamptz,
  failure_stage text CHECK (failure_stage IN ('claim', 'extract', 'persist')),
  last_error text,
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  FOREIGN KEY (project_id, source_version_id)
    REFERENCES script_versions(project_id, id) ON DELETE CASCADE,
  CHECK (length(trim(source_document_title)) > 0),
  CHECK (length(trim(source_content)) > 0)
);

CREATE INDEX IF NOT EXISTS analysis_jobs_claim
  ON analysis_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS analysis_jobs_project_created
  ON analysis_jobs(project_id, created_at DESC);

ALTER TABLE breakdown_items
  ADD COLUMN IF NOT EXISTS analysis_job_id text
    REFERENCES analysis_jobs(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS breakdown_items_analysis_output;
CREATE UNIQUE INDEX breakdown_items_analysis_output
  ON breakdown_items(analysis_job_id, category, item, source_location);

CREATE OR REPLACE FUNCTION complete_analysis_job_after_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    NEW.analysis_job_id IS NOT NULL
    AND OLD.state = '待确认'
    AND NEW.state <> '待确认'
  THEN
    UPDATE analysis_jobs AS job
    SET
      status = 'completed',
      completed_at = now(),
      updated_at = now(),
      revision = revision + 1
    WHERE
      job.id = NEW.analysis_job_id
      AND job.status = 'awaiting_confirmation'
      AND NOT EXISTS (
        SELECT 1
        FROM breakdown_items AS item
        WHERE
          item.analysis_job_id = NEW.analysis_job_id
          AND item.state = '待确认'
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS breakdown_items_complete_analysis_job ON breakdown_items;
CREATE TRIGGER breakdown_items_complete_analysis_job
AFTER UPDATE OF state ON breakdown_items
FOR EACH ROW
EXECUTE FUNCTION complete_analysis_job_after_review();
