ALTER TABLE review_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id text REFERENCES review_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS review_comments_parent_idx
  ON review_comments(file_id, parent_comment_id, created_at);

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
