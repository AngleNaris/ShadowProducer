ALTER TABLE review_files
  ADD COLUMN IF NOT EXISTS approved_by_account_id text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_files_approved_by_account_id_fkey'
  ) THEN
    ALTER TABLE review_files
      ADD CONSTRAINT review_files_approved_by_account_id_fkey
      FOREIGN KEY (approved_by_account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
  END IF;
END $$;
