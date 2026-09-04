CREATE TABLE IF NOT EXISTS call_sheet_publications (
  id text PRIMARY KEY,
  call_sheet_id text NOT NULL REFERENCES call_sheets(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  published_by_account_id text REFERENCES accounts(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_sheet_id, version)
);

CREATE INDEX IF NOT EXISTS call_sheet_publications_history
  ON call_sheet_publications(call_sheet_id, version DESC);

CREATE TABLE IF NOT EXISTS call_sheet_changes (
  id text PRIMARY KEY,
  call_sheet_id text NOT NULL REFERENCES call_sheets(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  base_publication_id text REFERENCES call_sheet_publications(id) ON DELETE RESTRICT,
  base_publication_version integer CHECK (base_publication_version > 0),
  summary text NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  changed_by_account_id text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(summary)) > 0)
);

CREATE INDEX IF NOT EXISTS call_sheet_changes_history
  ON call_sheet_changes(call_sheet_id, changed_at DESC);

INSERT INTO call_sheet_publications (
  id,
  call_sheet_id,
  project_id,
  version,
  snapshot,
  published_by_account_id,
  published_at
)
SELECT
  'legacy-' || sheet.id,
  sheet.id,
  sheet.project_id,
  1,
  jsonb_build_object(
    'id', sheet.id,
    'projectId', sheet.project_id,
    'date', sheet.date_label,
    'day', sheet.day_label,
    'title', sheet.title,
    'status', sheet.status,
    'crewCall', sheet.crew_call,
    'firstShot', sheet.first_shot,
    'wrap', sheet.wrap_time,
    'weather', sheet.weather,
    'sunrise', sheet.sunrise,
    'sunset', sheet.sunset,
    'basecamp', sheet.basecamp,
    'location', sheet.location,
    'hospital', sheet.hospital,
    'scenes', sheet.scenes,
    'cast', sheet.cast_members,
    'revision', sheet.revision,
    'updatedAt', sheet.updated_at
  ),
  NULL,
  sheet.updated_at
FROM call_sheets AS sheet
WHERE sheet.status = '已发布'
ON CONFLICT (call_sheet_id, version) DO NOTHING;
