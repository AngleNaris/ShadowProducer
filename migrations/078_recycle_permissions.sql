-- Add the shared recycle-bin capability to existing system administrator templates.
UPDATE permission_templates
SET permissions = CASE
  WHEN NOT (permissions @> '["team.recycle.manage"]'::jsonb)
    THEN permissions || '["team.recycle.manage"]'::jsonb
  ELSE permissions
END,
revision = revision + 1,
updated_at = now()
WHERE scope = 'team'
  AND key = 'team-admin';
