CREATE TABLE IF NOT EXISTS permission_templates (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('team', 'project')),
  key text NOT NULL,
  name text NOT NULL,
  permissions jsonb NOT NULL CHECK (jsonb_typeof(permissions) = 'array'),
  is_system boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, scope, key)
);

ALTER TABLE team_memberships
  ADD COLUMN IF NOT EXISTS permission_template_id text
  REFERENCES permission_templates(id) ON DELETE SET NULL;

ALTER TABLE team_memberships
  ADD COLUMN IF NOT EXISTS permission_revision integer NOT NULL DEFAULT 1
  CHECK (permission_revision > 0);

ALTER TABLE project_memberships
  ADD COLUMN IF NOT EXISTS permission_template_id text
  REFERENCES permission_templates(id) ON DELETE SET NULL;

ALTER TABLE project_memberships
  ADD COLUMN IF NOT EXISTS permission_revision integer NOT NULL DEFAULT 1
  CHECK (permission_revision > 0);

CREATE INDEX IF NOT EXISTS team_memberships_permission_template_idx
  ON team_memberships (permission_template_id);

CREATE INDEX IF NOT EXISTS project_memberships_permission_template_idx
  ON project_memberships (permission_template_id);

INSERT INTO permission_templates (id, team_id, scope, key, name, permissions, is_system)
SELECT team.id || ':' || template.key,
       team.id,
       template.scope,
       template.key,
       template.name,
       template.permissions::jsonb,
       true
FROM teams AS team
CROSS JOIN (
  VALUES
    ('team', 'team-admin', '团队管理员', '["team.read","team.write","team.permissions.manage","team.recycle.manage","asset.write","portfolio.write","portfolio.publish"]'),
    ('team', 'team-member', '团队成员', '["team.read","team.write","asset.write","portfolio.write","portfolio.publish"]'),
    ('team', 'team-viewer', '团队访客', '["team.read"]'),
    ('project', 'project-manager', '项目负责人', '["project.read","project.write","script.write","production.write","call_sheet.publish","review.write","review.manage"]'),
    ('project', 'project-contributor', '项目协作者', '["project.read","project.write","script.write","production.write","review.write"]'),
    ('project', 'project-viewer', '项目查看者', '["project.read"]')
) AS template(scope, key, name, permissions)
ON CONFLICT (team_id, scope, key) DO NOTHING;

UPDATE team_memberships AS membership
SET permission_template_id = membership.team_id || ':' ||
  CASE
    WHEN membership.role = 'viewer' THEN 'team-viewer'
    WHEN membership.role IN ('owner', 'admin', 'producer', 'director') THEN 'team-admin'
    ELSE 'team-member'
  END
WHERE membership.permission_template_id IS NULL;

UPDATE project_memberships AS membership
SET permission_template_id = project.team_id || ':' ||
  CASE
    WHEN membership.role = 'viewer' THEN 'project-viewer'
    ELSE 'project-manager'
  END
FROM projects AS project
WHERE project.id = membership.project_id
  AND membership.permission_template_id IS NULL;
