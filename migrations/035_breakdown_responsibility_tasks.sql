ALTER TABLE breakdown_items
  ADD COLUMN IF NOT EXISTS responsible_account_id text
    REFERENCES accounts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS breakdown_item_tasks (
  breakdown_item_id text NOT NULL REFERENCES breakdown_items(id) ON DELETE CASCADE,
  task_id text NOT NULL REFERENCES workspace_tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (breakdown_item_id, task_id)
);

CREATE INDEX IF NOT EXISTS breakdown_item_tasks_task_idx
  ON breakdown_item_tasks(task_id);
