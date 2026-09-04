ALTER TABLE notifications
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'call_sheet_published',
      'call_sheet_changed',
      'team_permission_assigned',
      'project_permission_assigned'
    )
  );
