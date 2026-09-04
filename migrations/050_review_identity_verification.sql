ALTER TABLE review_sessions
  ADD COLUMN IF NOT EXISTS verified_email TEXT,
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS review_identity_challenges (
  id UUID PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES review_links(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_identity_challenges_link_email_created_idx
  ON review_identity_challenges(link_id, email, created_at DESC);
