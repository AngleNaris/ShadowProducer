ALTER TABLE agent_command_intents
  DROP CONSTRAINT IF EXISTS agent_command_intents_action_check;

ALTER TABLE agent_command_intents
  ADD CONSTRAINT agent_command_intents_action_check
  CHECK (
    action IN (
      'list_audit_logs',
      'list_tasks',
      'create_task',
      'update_task',
      'create_note',
      'create_calendar_event',
      'update_calendar_event',
      'create_execution_stage',
      'update_execution_stage',
      'update_breakdown',
      'confirm_breakdown',
      'create_shooting_day',
      'update_shooting_day',
      'create_call_sheet',
      'update_call_sheet',
      'publish_call_sheet',
      'create_script_version',
      'update_script_version',
      'create_review_comment',
      'update_review_comment',
      'create_review_link',
      'approve_review_file',
      'create_portfolio',
      'add_portfolio_content',
      'publish_portfolio'
    )
  );
