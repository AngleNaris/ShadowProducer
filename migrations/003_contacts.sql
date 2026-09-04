CREATE TABLE IF NOT EXISTS personal_contacts (
  id text PRIMARY KEY,
  owner_account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS personal_contacts_owner_active
  ON personal_contacts(owner_account_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS contact_team_shares (
  contact_id text NOT NULL REFERENCES personal_contacts(id) ON DELETE CASCADE,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  shared_fields text[] NOT NULL,
  allow_project_link boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, team_id),
  CHECK (cardinality(shared_fields) > 0),
  CHECK (shared_fields <@ ARRAY['name', 'role', 'company', 'phone', 'email']::text[])
);

CREATE INDEX IF NOT EXISTS contact_team_shares_team
  ON contact_team_shares(team_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS team_contacts (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by_account_id text NOT NULL REFERENCES accounts(id),
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS team_contacts_team_active
  ON team_contacts(team_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS team_contact_projects (
  contact_id text NOT NULL REFERENCES team_contacts(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, project_id)
);
