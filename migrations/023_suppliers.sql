CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by_account_id text NOT NULL REFERENCES accounts(id),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  category text NOT NULL DEFAULT '',
  services text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS suppliers_team_active_idx
  ON suppliers(team_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS supplier_projects (
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, project_id)
);

CREATE TABLE IF NOT EXISTS supplier_contacts (
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  contact_source text NOT NULL CHECK (contact_source IN ('team', 'member-shared')),
  contact_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, contact_source, contact_id)
);

CREATE INDEX IF NOT EXISTS supplier_contacts_reference_idx
  ON supplier_contacts(contact_source, contact_id);

CREATE TABLE IF NOT EXISTS breakdown_item_suppliers (
  breakdown_item_id text NOT NULL REFERENCES breakdown_items(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (breakdown_item_id, supplier_id)
);
