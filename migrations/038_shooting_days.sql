CREATE TABLE IF NOT EXISTS shooting_days (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  shoot_date date NOT NULL,
  day_number integer NOT NULL CHECK (day_number > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  status text NOT NULL DEFAULT '草稿'
    CHECK (status IN ('草稿', '已确认', '拍摄中', '已完成', '已取消')),
  original_timezone text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, shoot_date),
  UNIQUE (project_id, day_number)
);

CREATE INDEX IF NOT EXISTS shooting_days_project_date_idx
  ON shooting_days(project_id, shoot_date, day_number);

ALTER TABLE call_sheets
  ADD COLUMN IF NOT EXISTS shooting_day_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'call_sheets_shooting_day_id_fkey'
  ) THEN
    ALTER TABLE call_sheets
      ADD CONSTRAINT call_sheets_shooting_day_id_fkey
      FOREIGN KEY (shooting_day_id) REFERENCES shooting_days(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS call_sheets_shooting_day_idx
  ON call_sheets(shooting_day_id, created_at);

UPDATE call_sheet_publications AS publication
SET snapshot = jsonb_set(
  publication.snapshot,
  '{shootingDayId}',
  COALESCE(to_jsonb(sheet.shooting_day_id), 'null'::jsonb),
  true
)
FROM call_sheets AS sheet
WHERE sheet.id = publication.call_sheet_id;

UPDATE call_sheet_changes AS change
SET
  before_snapshot = jsonb_set(
    change.before_snapshot,
    '{shootingDayId}',
    COALESCE(to_jsonb(sheet.shooting_day_id), 'null'::jsonb),
    true
  ),
  after_snapshot = jsonb_set(
    change.after_snapshot,
    '{shootingDayId}',
    COALESCE(to_jsonb(sheet.shooting_day_id), 'null'::jsonb),
    true
  )
FROM call_sheets AS sheet
WHERE sheet.id = change.call_sheet_id;

CREATE TABLE IF NOT EXISTS breakdown_item_shooting_days (
  breakdown_item_id text NOT NULL REFERENCES breakdown_items(id) ON DELETE CASCADE,
  shooting_day_id text NOT NULL REFERENCES shooting_days(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (breakdown_item_id, shooting_day_id)
);

CREATE INDEX IF NOT EXISTS breakdown_item_shooting_days_day_idx
  ON breakdown_item_shooting_days(shooting_day_id, breakdown_item_id);
