ALTER TABLE script_write_receipts
  ADD COLUMN IF NOT EXISTS request_hash text;
