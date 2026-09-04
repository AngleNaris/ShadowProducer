ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS permission_assignments boolean NOT NULL DEFAULT true;
