ALTER TABLE team_portfolios
  ADD COLUMN IF NOT EXISTS theme_preset text NOT NULL DEFAULT 'editorial',
  ADD COLUMN IF NOT EXISTS seo_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seo_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS domain_verification_record text,
  ADD COLUMN IF NOT EXISTS domain_verification_status text,
  ADD COLUMN IF NOT EXISTS domain_verified_at timestamptz;

ALTER TABLE team_portfolios
  DROP CONSTRAINT IF EXISTS team_portfolios_theme_preset_check,
  ADD CONSTRAINT team_portfolios_theme_preset_check
    CHECK (theme_preset IN ('editorial', 'gallery', 'screening')),
  DROP CONSTRAINT IF EXISTS team_portfolios_domain_verification_status_check,
  ADD CONSTRAINT team_portfolios_domain_verification_status_check
    CHECK (domain_verification_status IS NULL OR domain_verification_status IN ('pending', 'verified')),
  DROP CONSTRAINT IF EXISTS team_portfolios_domain_verification_consistency_check,
  ADD CONSTRAINT team_portfolios_domain_verification_consistency_check CHECK (
    (custom_domain IS NULL AND domain_verification_record IS NULL AND domain_verification_status IS NULL AND domain_verified_at IS NULL)
    OR
    (custom_domain IS NOT NULL AND domain_verification_record IS NOT NULL AND domain_verification_status = 'pending' AND domain_verified_at IS NULL)
    OR
    (custom_domain IS NOT NULL AND domain_verification_record IS NOT NULL AND domain_verification_status = 'verified' AND domain_verified_at IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS team_portfolios_custom_domain_unique_idx
  ON team_portfolios (lower(custom_domain))
  WHERE custom_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS portfolio_daily_views (
  portfolio_id text NOT NULL REFERENCES team_portfolios(id) ON DELETE CASCADE,
  view_date date NOT NULL,
  views integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  unique_visitors integer NOT NULL DEFAULT 0 CHECK (unique_visitors >= 0),
  PRIMARY KEY (portfolio_id, view_date)
);

CREATE TABLE IF NOT EXISTS portfolio_daily_visitors (
  portfolio_id text NOT NULL REFERENCES team_portfolios(id) ON DELETE CASCADE,
  view_date date NOT NULL,
  visitor_hash text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (portfolio_id, view_date, visitor_hash)
);
