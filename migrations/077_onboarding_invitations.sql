CREATE TABLE IF NOT EXISTS onboarding_invitations (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('team', 'project')),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  permission_template_id text NOT NULL REFERENCES permission_templates(id),
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by_account_id text NOT NULL REFERENCES accounts(id),
  accepted_account_id text REFERENCES accounts(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'team' AND project_id IS NULL) OR (scope = 'project' AND project_id IS NOT NULL)),
  CHECK (
    (status = 'pending' AND accepted_account_id IS NULL AND accepted_at IS NULL)
    OR (
      status = 'accepted'
      AND accepted_account_id IS NOT NULL
      AND accepted_at IS NOT NULL
    )
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS onboarding_invitations_team_created_idx
  ON onboarding_invitations (team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS onboarding_invitations_pending_email_idx
  ON onboarding_invitations (team_id, email)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_invitations_team_pending_uidx
  ON onboarding_invitations (team_id, email)
  WHERE status = 'pending' AND scope = 'team';

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_invitations_project_pending_uidx
  ON onboarding_invitations (project_id, email)
  WHERE status = 'pending' AND scope = 'project';

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'call_sheet_published',
      'call_sheet_changed',
      'team_permission_assigned',
      'project_permission_assigned',
      'portfolio_published',
      'portfolio_unpublished',
      'review_comment_created',
      'review_comment_replied',
      'review_file_approved',
      'contact_share_updated',
      'contact_share_revoked',
      'team_invitation_accepted',
      'project_invitation_accepted'
    )
  );
