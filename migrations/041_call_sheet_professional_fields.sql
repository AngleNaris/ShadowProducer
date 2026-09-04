ALTER TABLE call_sheets
  ADD COLUMN IF NOT EXISTS departments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS safety jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transport jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS catering jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS key_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_day_preview jsonb NOT NULL DEFAULT
    '{"date":"","title":"","scenes":"","cast":"","note":""}'::jsonb;

UPDATE call_sheet_publications
SET snapshot = snapshot || jsonb_build_object(
  'departments', COALESCE(snapshot->'departments', '[]'::jsonb),
  'equipment', COALESCE(snapshot->'equipment', '[]'::jsonb),
  'safety', COALESCE(snapshot->'safety', '[]'::jsonb),
  'transport', COALESCE(snapshot->'transport', '[]'::jsonb),
  'catering', COALESCE(snapshot->'catering', '[]'::jsonb),
  'keyContacts', COALESCE(snapshot->'keyContacts', '[]'::jsonb),
  'nextDayPreview', COALESCE(
    snapshot->'nextDayPreview',
    '{"date":"","title":"","scenes":"","cast":"","note":""}'::jsonb
  )
);

UPDATE call_sheet_changes
SET
  before_snapshot = before_snapshot || jsonb_build_object(
    'departments', COALESCE(before_snapshot->'departments', '[]'::jsonb),
    'equipment', COALESCE(before_snapshot->'equipment', '[]'::jsonb),
    'safety', COALESCE(before_snapshot->'safety', '[]'::jsonb),
    'transport', COALESCE(before_snapshot->'transport', '[]'::jsonb),
    'catering', COALESCE(before_snapshot->'catering', '[]'::jsonb),
    'keyContacts', COALESCE(before_snapshot->'keyContacts', '[]'::jsonb),
    'nextDayPreview', COALESCE(
      before_snapshot->'nextDayPreview',
      '{"date":"","title":"","scenes":"","cast":"","note":""}'::jsonb
    )
  ),
  after_snapshot = after_snapshot || jsonb_build_object(
    'departments', COALESCE(after_snapshot->'departments', '[]'::jsonb),
    'equipment', COALESCE(after_snapshot->'equipment', '[]'::jsonb),
    'safety', COALESCE(after_snapshot->'safety', '[]'::jsonb),
    'transport', COALESCE(after_snapshot->'transport', '[]'::jsonb),
    'catering', COALESCE(after_snapshot->'catering', '[]'::jsonb),
    'keyContacts', COALESCE(after_snapshot->'keyContacts', '[]'::jsonb),
    'nextDayPreview', COALESCE(
      after_snapshot->'nextDayPreview',
      '{"date":"","title":"","scenes":"","cast":"","note":""}'::jsonb
    )
  );

UPDATE command_receipts
SET response = response || jsonb_build_object(
  'departments', COALESCE(response->'departments', '[]'::jsonb),
  'equipment', COALESCE(response->'equipment', '[]'::jsonb),
  'safety', COALESCE(response->'safety', '[]'::jsonb),
  'transport', COALESCE(response->'transport', '[]'::jsonb),
  'catering', COALESCE(response->'catering', '[]'::jsonb),
  'keyContacts', COALESCE(response->'keyContacts', '[]'::jsonb),
  'nextDayPreview', COALESCE(
    response->'nextDayPreview',
    '{"date":"","title":"","scenes":"","cast":"","note":""}'::jsonb
  )
)
WHERE domain LIKE 'call-sheet.create:%';

UPDATE command_receipts
SET response = jsonb_set(
  jsonb_set(
    response,
    '{item}',
    response->'item' || jsonb_build_object(
      'departments', COALESCE(response->'item'->'departments', '[]'::jsonb),
      'equipment', COALESCE(response->'item'->'equipment', '[]'::jsonb),
      'safety', COALESCE(response->'item'->'safety', '[]'::jsonb),
      'transport', COALESCE(response->'item'->'transport', '[]'::jsonb),
      'catering', COALESCE(response->'item'->'catering', '[]'::jsonb),
      'keyContacts', COALESCE(response->'item'->'keyContacts', '[]'::jsonb),
      'nextDayPreview', COALESCE(
        response->'item'->'nextDayPreview',
        '{"date":"","title":"","scenes":"","cast":"","note":""}'::jsonb
      )
    )
  ),
  '{publication,snapshot}',
  response->'publication'->'snapshot' || jsonb_build_object(
    'departments', COALESCE(response->'publication'->'snapshot'->'departments', '[]'::jsonb),
    'equipment', COALESCE(response->'publication'->'snapshot'->'equipment', '[]'::jsonb),
    'safety', COALESCE(response->'publication'->'snapshot'->'safety', '[]'::jsonb),
    'transport', COALESCE(response->'publication'->'snapshot'->'transport', '[]'::jsonb),
    'catering', COALESCE(response->'publication'->'snapshot'->'catering', '[]'::jsonb),
    'keyContacts', COALESCE(response->'publication'->'snapshot'->'keyContacts', '[]'::jsonb),
    'nextDayPreview', COALESCE(
      response->'publication'->'snapshot'->'nextDayPreview',
      '{"date":"","title":"","scenes":"","cast":"","note":""}'::jsonb
    )
  )
)
WHERE domain LIKE 'call-sheet.publish:%';
