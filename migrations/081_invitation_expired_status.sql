-- 邀请新增 expired 终态：自然过期的 pending 邀请退出 pending 槽位，允许同邮箱重新邀请。
-- 允许同邮箱同作用域重新邀请（unique 索引只覆盖 status = 'pending'）。 lodged in 081.
ALTER TABLE onboarding_invitations
  DROP CONSTRAINT IF EXISTS onboarding_invitations_status_check;

ALTER TABLE onboarding_invitations
  DROP CONSTRAINT IF EXISTS onboarding_invitations_check;

ALTER TABLE onboarding_invitations
  DROP CONSTRAINT IF EXISTS onboarding_invitations_check1;

ALTER TABLE onboarding_invitations
  ADD CONSTRAINT onboarding_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'));

ALTER TABLE onboarding_invitations
  ADD CONSTRAINT onboarding_invitations_check CHECK (
    (status = 'pending' AND accepted_account_id IS NULL AND accepted_at IS NULL)
    OR (
      status = 'accepted'
      AND accepted_account_id IS NOT NULL
      AND accepted_at IS NOT NULL
    )
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (
      status = 'expired'
      AND accepted_account_id IS NULL
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    )
  );

UPDATE onboarding_invitations
SET status = 'expired', updated_at = now()
WHERE status = 'pending' AND expires_at <= now();
