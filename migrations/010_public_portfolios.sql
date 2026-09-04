ALTER TABLE team_portfolios
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS team_portfolios_public_slug_unique
  ON team_portfolios(public_slug)
  WHERE public_slug IS NOT NULL;
