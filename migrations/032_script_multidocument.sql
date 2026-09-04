ALTER TABLE script_documents
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'script',
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'script_documents_document_type_check'
  ) THEN
    ALTER TABLE script_documents
      ADD CONSTRAINT script_documents_document_type_check
      CHECK (document_type IN ('script', 'storyboard'));
  END IF;
END $$;

UPDATE script_documents AS document
SET is_default = true
WHERE document.id = (
  SELECT candidate.id
  FROM script_documents AS candidate
  WHERE candidate.project_id = document.project_id
  ORDER BY candidate.created_at, candidate.id
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM script_documents AS existing
  WHERE existing.project_id = document.project_id
    AND existing.is_default
);

ALTER TABLE script_documents
  DROP CONSTRAINT IF EXISTS script_documents_project_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS script_documents_one_default
  ON script_documents(project_id) WHERE is_default;

DROP INDEX IF EXISTS script_versions_one_current;

CREATE UNIQUE INDEX IF NOT EXISTS script_versions_one_current
  ON script_versions(document_id) WHERE is_current;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM script_documents AS document
    LEFT JOIN script_versions AS version
      ON version.document_id = document.id
      AND version.id = document.current_version_id
      AND version.is_current
    WHERE version.id IS NULL
  ) THEN
    RAISE EXCEPTION 'script document has an invalid current version';
  END IF;
END $$;
