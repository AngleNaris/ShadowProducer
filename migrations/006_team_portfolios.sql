ALTER TABLE review_files
  ADD COLUMN IF NOT EXISTS asset_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_files_asset_id_fkey'
  ) THEN
    ALTER TABLE review_files
      ADD CONSTRAINT review_files_asset_id_fkey
      FOREIGN KEY (asset_id) REFERENCES team_assets(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS review_files_asset_version_unique
  ON review_files(asset_id)
  WHERE asset_id IS NOT NULL AND type = 'video';

CREATE TABLE IF NOT EXISTS team_portfolios (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  year text NOT NULL,
  description text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '团队可见'
    CHECK (state IN ('团队可见', '待发布', '已公开')),
  created_by_account_id text NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  published_by_account_id text REFERENCES accounts(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (length(trim(title)) > 0),
  CHECK (length(trim(category)) > 0),
  CHECK (length(trim(year)) > 0)
);

CREATE INDEX IF NOT EXISTS team_portfolios_team_updated_idx
  ON team_portfolios(team_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS portfolio_items (
  id text PRIMARY KEY,
  portfolio_id text NOT NULL REFERENCES team_portfolios(id) ON DELETE CASCADE,
  asset_id text NOT NULL REFERENCES team_assets(id) ON DELETE RESTRICT,
  review_file_id text NOT NULL REFERENCES review_files(id) ON DELETE RESTRICT,
  title text NOT NULL,
  kind text NOT NULL DEFAULT '主片' CHECK (kind = '主片'),
  caption text NOT NULL DEFAULT '',
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, review_file_id),
  CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS portfolio_items_portfolio_order_idx
  ON portfolio_items(portfolio_id, sort_order, created_at);
