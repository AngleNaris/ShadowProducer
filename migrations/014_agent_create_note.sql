ALTER TABLE agent_command_intents
  DROP CONSTRAINT IF EXISTS agent_command_intents_action_check;

ALTER TABLE agent_command_intents
  ADD CONSTRAINT agent_command_intents_action_check
  CHECK (action IN ('list_tasks', 'create_task', 'create_note', 'publish_portfolio')) NOT VALID;
