CREATE TABLE IF NOT EXISTS breakdown_item_call_sheets (
  breakdown_item_id text NOT NULL REFERENCES breakdown_items(id) ON DELETE CASCADE,
  call_sheet_id text NOT NULL REFERENCES call_sheets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (breakdown_item_id, call_sheet_id)
);

CREATE INDEX IF NOT EXISTS breakdown_item_call_sheets_call_sheet_idx
  ON breakdown_item_call_sheets(call_sheet_id);
