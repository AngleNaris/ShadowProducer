ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS trigger_kind text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE
      conname = 'analysis_jobs_trigger_kind_check'
      AND conrelid = 'analysis_jobs'::regclass
  ) THEN
    ALTER TABLE analysis_jobs
      ADD CONSTRAINT analysis_jobs_trigger_kind_check
      CHECK (trigger_kind IN ('manual', 'script_version_updated'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS analysis_jobs_auto_source
  ON analysis_jobs(
    project_id,
    source_document_id,
    source_version_id,
    source_revision,
    kind,
    tool
  )
  WHERE trigger_kind = 'script_version_updated';

CREATE UNIQUE INDEX IF NOT EXISTS script_documents_project_id_id
  ON script_documents(project_id, id);

CREATE TABLE IF NOT EXISTS analysis_workflows (
  project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  source_document_id text,
  trigger_kind text NOT NULL DEFAULT 'script_version_updated'
    CHECK (trigger_kind = 'script_version_updated'),
  approval_policy text NOT NULL DEFAULT 'manual_confirmation'
    CHECK (approval_policy = 'manual_confirmation'),
  configured_by_account_id text NOT NULL REFERENCES accounts(id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analysis_workflows_project_document_fkey
    FOREIGN KEY (project_id, source_document_id)
    REFERENCES script_documents(project_id, id) ON DELETE CASCADE
);

ALTER TABLE analysis_workflows
  DROP CONSTRAINT IF EXISTS analysis_workflows_source_document_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE
      conname = 'analysis_workflows_project_document_fkey'
      AND conrelid = 'analysis_workflows'::regclass
  ) THEN
    ALTER TABLE analysis_workflows
      ADD CONSTRAINT analysis_workflows_project_document_fkey
      FOREIGN KEY (project_id, source_document_id)
      REFERENCES script_documents(project_id, id) ON DELETE CASCADE;
  END IF;
END;
$$;
