CREATE TABLE IF NOT EXISTS agent_command_intents (
  id text PRIMARY KEY,
  actor_account_id text NOT NULL REFERENCES accounts(id),
  action text NOT NULL CHECK (action IN ('list_tasks', 'create_task', 'publish_portfolio')),
  risk text NOT NULL CHECK (risk IN ('read', 'write', 'high')),
  team_id text NOT NULL REFERENCES teams(id),
  project_id text REFERENCES projects(id),
  command jsonb NOT NULL,
  request_hash text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'consumed')),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  consumed_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_command_intents_actor_expiry_idx
  ON agent_command_intents(actor_account_id, expires_at DESC);
