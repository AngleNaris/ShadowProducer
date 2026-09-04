BEGIN;

CREATE TABLE IF NOT EXISTS review_folders (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_by_account_id text REFERENCES accounts(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS review_folders_project_name_unique
  ON review_folders (project_id, lower(name))
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS review_folders_project_updated_idx
  ON review_folders (project_id, updated_at DESC)
  WHERE archived_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM review_files AS file
    WHERE file.type = 'folder'
      AND (
        file.asset_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM review_comments AS comment WHERE comment.file_id = file.id)
        OR EXISTS (SELECT 1 FROM review_link_files AS link_file WHERE link_file.file_id = file.id)
        OR EXISTS (SELECT 1 FROM portfolio_items AS item WHERE item.review_file_id = file.id)
      )
  ) THEN
    RAISE EXCEPTION 'legacy review folder is still referenced';
  END IF;
END $$;

INSERT INTO review_folders (
  id,
  project_id,
  name,
  revision,
  created_at,
  updated_at
)
SELECT
  file.id,
  file.project_id,
  file.name,
  file.revision,
  file.created_at,
  file.updated_at
FROM review_files AS file
WHERE file.type = 'folder'
ON CONFLICT (id) DO NOTHING;

DELETE FROM review_files
WHERE type = 'folder';

ALTER TABLE review_files
  ADD COLUMN IF NOT EXISTS folder_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'review_files_folder_id_fkey'
  ) THEN
    ALTER TABLE review_files
      ADD CONSTRAINT review_files_folder_id_fkey
      FOREIGN KEY (folder_id) REFERENCES review_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE review_files DROP CONSTRAINT IF EXISTS review_files_type_check;
ALTER TABLE review_files
  ADD CONSTRAINT review_files_type_check CHECK (type = 'video');

CREATE INDEX IF NOT EXISTS review_files_project_folder_updated_idx
  ON review_files (project_id, folder_id, updated_at DESC);

COMMIT;
