ALTER TABLE breakdown_items
  ADD COLUMN IF NOT EXISTS parent_item_id text REFERENCES breakdown_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_into_item_id text REFERENCES breakdown_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS breakdown_items_parent_item
  ON breakdown_items(parent_item_id)
  WHERE parent_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS breakdown_items_merged_into_item
  ON breakdown_items(merged_into_item_id)
  WHERE merged_into_item_id IS NOT NULL;
