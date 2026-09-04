ALTER TABLE agent_command_intents
  DROP CONSTRAINT IF EXISTS agent_command_intents_action_check;

ALTER TABLE agent_command_intents
  ADD CONSTRAINT agent_command_intents_action_check
  CHECK (
    action IN (
      'list_tasks',
      'create_task',
      'create_note',
      'create_calendar_event',
      'update_calendar_event',
      'create_execution_stage',
      'create_call_sheet',
      'publish_call_sheet',
      'create_review_comment',
      'update_review_comment',
      'create_portfolio',
      'add_portfolio_content',
      'publish_portfolio'
    )
  ) NOT VALID;
