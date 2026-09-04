CREATE TABLE IF NOT EXISTS breakdown_item_contacts (
  breakdown_item_id text NOT NULL REFERENCES breakdown_items(id) ON DELETE CASCADE,
  contact_source text NOT NULL CHECK (contact_source IN ('team', 'member-shared')),
  contact_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (breakdown_item_id, contact_source, contact_id)
);

CREATE INDEX IF NOT EXISTS breakdown_item_contacts_contact_idx
  ON breakdown_item_contacts(contact_source, contact_id);
