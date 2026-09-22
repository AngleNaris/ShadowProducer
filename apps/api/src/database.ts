import type {
  AgentCommandResult,
  AnalysisJob,
  AnalysisWorkflow,
  AssetFolder,
  BreakdownItem,
  CalendarEvent,
  CallSheet,
  CallSheetCast,
  CallSheetCatering,
  CallSheetDepartment,
  CallSheetEquipment,
  CallSheetKeyContact,
  CallSheetNextDayPreview,
  CallSheetSafety,
  CallSheetScene,
  CallSheetTransport,
  CreatedInvitation,
  ExecutionResourceType,
  ExecutionStageState,
  InvitationAcceptance,
  InvitationSummary,
  MediaAnalysisJob,
  MediaAnalysisShot,
  MediaAnalysisTextSegment,
  NotificationKind,
  OnboardingProject,
  OnboardingTeam,
  PermissionTemplate,
  PersonalContact,
  ReviewFile,
  ScriptDocument,
  ScriptVersion,
  TeamAsset,
  TeamContact,
  TeamPortfolio,
  TeamSupplier,
  WorkspaceNote,
  WorkspaceTask,
} from "@shadowproducer/contracts"
import {
  type ColumnType,
  type Generated,
  type JSONColumnType,
  Kysely,
  PostgresDialect,
} from "kysely"
import { Pool } from "pg"

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>
type Revision = ColumnType<number, number | undefined, number>

export type Database = {
  accounts: {
    id: string
    display_name: string
    email: string | null
  }
  teams: {
    id: string
    name: string
  }
  team_memberships: {
    team_id: string
    account_id: string
    role: string
    permission_template_id: ColumnType<
      string | null,
      string | null | undefined,
      string | null
    >
    permission_revision: Revision
  }
  projects: {
    id: string
    team_id: string
    name: string
    status: ColumnType<string, string | undefined, string>
    updated_at: Timestamp
  }
  project_memberships: {
    project_id: string
    account_id: string
    role: string
    permission_template_id: ColumnType<
      string | null,
      string | null | undefined,
      string | null
    >
    permission_revision: Revision
  }
  permission_templates: {
    id: string
    team_id: string
    scope: "team" | "project"
    key: string
    name: string
    permissions: JSONColumnType<string[], string, string>
    is_system: ColumnType<boolean, boolean | undefined, boolean>
    revision: Revision
    created_by_account_id: string | null
    created_at: Timestamp
    updated_at: Timestamp
  }
  script_documents: {
    id: string
    project_id: string
    title: string
    document_type: ColumnType<
      "script" | "storyboard",
      "script" | "storyboard" | undefined,
      "script" | "storyboard"
    >
    is_default: ColumnType<boolean, boolean | undefined, boolean>
    current_version_id: string
    created_at: Timestamp
  }
  script_versions: {
    project_id: string
    id: string
    document_id: string
    meta: string
    badge: "当前" | "历史"
    content: string
    revision: number
    is_current: boolean
    updated_at: Timestamp
  }
  script_comments: {
    id: string
    project_id: string
    version_id: string
    parent_comment_id: ColumnType<string | null, string | null | undefined, string | null>
    author_account_id: string
    text: string
    excerpt: string
    idempotency_key: string
    request_hash: ColumnType<string | null, string | null | undefined, string | null>
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    resolved_at: NullableTimestamp
  }
  script_write_receipts: {
    project_id: string
    version_id: string
    actor_account_id: string
    idempotency_key: string
    request_hash: string | null
    response: JSONColumnType<ScriptVersion, string, string>
    created_at: Timestamp
  }
  script_presence: {
    project_id: string
    document_id: string
    account_id: string
    version_id: ColumnType<string | null, string | null | undefined, string | null>
    cursor_start: ColumnType<number | null, number | null | undefined, number | null>
    cursor_end: ColumnType<number | null, number | null | undefined, number | null>
    editing: ColumnType<boolean, boolean | undefined, boolean>
    updated_at: Timestamp
  }
  script_presence_connections: {
    connection_id: string
    project_id: string
    document_id: string
    account_id: string
    instance_id: string
    lease_expires_at: Timestamp
    created_at: Timestamp
    updated_at: Timestamp
  }
  audit_logs: {
    id: Generated<number>
    actor_account_id: string | null
    actor_type: ColumnType<string, string | undefined, string>
    review_session_id: string | null
    team_id: ColumnType<string | null, string | null | undefined, string | null>
    project_id: ColumnType<string | null, string | null | undefined, string | null>
    action: string
    subject_id: string
    metadata: JSONColumnType<Record<string, unknown>, string, string>
    created_at: Timestamp
  }
  notification_preferences: {
    account_id: string
    team_id: string
    published_call_sheets: boolean
    important_call_sheet_changes: boolean
    permission_assignments: boolean
    portfolio_publications: boolean
    review_activity: ColumnType<boolean, boolean | undefined, boolean>
    contact_sharing: ColumnType<boolean, boolean | undefined, boolean>
  }
  notifications: {
    id: string
    recipient_account_id: string
    source_actor_account_id: string | null
    team_id: string
    project_id: ColumnType<string | null, string | null, string | null>
    kind: NotificationKind
    subject_id: string
    dedup_key: string
    title: string
    body: string
    metadata: JSONColumnType<Record<string, unknown>, string, string>
    read_at: NullableTimestamp
    acknowledged_at: NullableTimestamp
    created_at: Timestamp
  }
  command_receipts: {
    actor_account_id: string
    domain: string
    idempotency_key: string
    request_hash: string | null
    response: JSONColumnType<
      | WorkspaceTask
      | CalendarEvent
      | WorkspaceNote
      | PermissionTemplate
      | OnboardingTeam
      | OnboardingProject
      | CreatedInvitation
      | InvitationAcceptance
      | InvitationSummary
      | PersonalContact
      | TeamContact
      | TeamContact[]
      | TeamSupplier
      | TeamSupplier[]
      | CallSheet
      | ReviewFile
      | TeamAsset
      | AssetFolder
      | TeamPortfolio
      | ScriptDocument
      | AnalysisJob
      | AnalysisWorkflow
      | BreakdownItem[],
      string,
      string
    >
    created_at: Timestamp
  }
  onboarding_invitations: {
    id: string
    team_id: string
    project_id: string | null
    scope: "team" | "project"
    email: string
    token_hash: string
    permission_template_id: string
    role: ColumnType<string, string | undefined, string>
    status: ColumnType<
      "pending" | "accepted" | "revoked" | "expired",
      "pending" | "accepted" | "revoked" | "expired" | undefined,
      "pending" | "accepted" | "revoked" | "expired"
    >
    invited_by_account_id: string
    accepted_account_id: ColumnType<
      string | null,
      string | null | undefined,
      string | null
    >
    expires_at: Timestamp
    accepted_at: NullableTimestamp
    revoked_at: NullableTimestamp
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  agent_command_intents: {
    id: string
    actor_account_id: string
    action:
      | "list_audit_logs"
      | "list_team_resources"
      | "semantic_search_assets"
      | "list_personal_contacts"
      | "create_personal_contact"
      | "update_personal_contact"
      | "share_personal_contact"
      | "unshare_personal_contact"
      | "delete_personal_contact"
      | "restore_personal_contact"
      | "create_team_contact"
      | "create_team_supplier"
      | "list_tasks"
      | "list_execution_schedule"
      | "create_task"
      | "update_task"
      | "create_note"
      | "update_note"
      | "create_calendar_event"
      | "update_calendar_event"
      | "create_execution_stage"
      | "update_execution_stage"
      | "update_breakdown"
      | "confirm_breakdown"
      | "create_shooting_day"
      | "update_shooting_day"
      | "create_call_sheet"
      | "update_call_sheet"
      | "publish_call_sheet"
      | "create_script_version"
      | "update_script_version"
      | "create_script_breakdown_analysis"
      | "create_media_analysis"
      | "list_review_feedback"
      | "create_review_file"
      | "create_review_comment"
      | "update_review_comment"
      | "approve_review_file"
      | "create_review_link"
      | "create_portfolio"
      | "add_portfolio_content"
      | "publish_portfolio"
    risk: "read" | "write" | "high"
    team_id: string
    project_id: string | null
    command: JSONColumnType<Record<string, unknown>, string, string>
    request_hash: string
    summary: string
    status: "pending" | "confirmed" | "consumed"
    expires_at: Timestamp
    confirmed_at: NullableTimestamp
    consumed_at: NullableTimestamp
    result: JSONColumnType<
      AgentCommandResult | null,
      string | null | undefined,
      string | null
    >
    created_at: Timestamp
  }
  workspace_tasks: {
    id: string
    team_id: string
    project_id: string | null
    assignee_account_id: string
    created_by_account_id: string
    title: string
    due_date: ColumnType<
      Date | string | null,
      Date | string | null | undefined,
      Date | string | null
    >
    status: "待开始" | "进行中" | "等待他人" | "已完成"
    target_view: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    deleted_at: NullableTimestamp
  }
  calendar_events: {
    id: string
    team_id: string
    project_id: string | null
    owner_account_id: string
    title: string
    starts_at: Timestamp
    ends_at: Timestamp | null
    original_timezone: string
    all_day: boolean
    visibility: "private" | "team" | "project"
    target_view: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    deleted_at: NullableTimestamp
  }
  workspace_notes: {
    id: string
    team_id: string
    project_id: string | null
    owner_account_id: string
    title: string
    body: string
    kind: "note" | "sticky"
    pinned: boolean
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    deleted_at: NullableTimestamp
  }
  personal_contacts: {
    id: string
    owner_account_id: string
    name: string
    role: string
    company: string
    phone: string
    email: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    deleted_at: NullableTimestamp
  }
  contact_team_shares: {
    contact_id: string
    team_id: string
    shared_fields: string[]
    allow_project_link: boolean
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  team_contacts: {
    id: string
    team_id: string
    created_by_account_id: string
    name: string
    role: string
    company: string
    phone: string
    email: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    deleted_at: NullableTimestamp
  }
  team_contact_projects: {
    contact_id: string
    project_id: string
    created_at: Timestamp
  }
  suppliers: {
    id: string
    team_id: string
    created_by_account_id: string
    name: string
    category: string
    services: string
    phone: string
    email: string
    address: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    deleted_at: NullableTimestamp
  }
  supplier_projects: {
    supplier_id: string
    project_id: string
    created_at: Timestamp
  }
  supplier_contacts: {
    supplier_id: string
    contact_source: "team" | "member-shared"
    contact_id: string
    created_at: Timestamp
  }
  asset_folders: {
    id: string
    team_id: string
    parent_id: string | null
    name: string
    created_by_account_id: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    archived_at: NullableTimestamp
  }
  team_assets: {
    id: string
    team_id: string
    project_id: string | null
    folder_id: ColumnType<string | null, string | null | undefined, string | null>
    name: string
    kind: "视频" | "图片" | "音频" | "文档"
    mime_type: string
    size_bytes: number
    object_key: string | null
    checksum_sha256: string | null
    status: "uploading" | "ready" | "failed"
    favorite: boolean
    rating: number
    tags: string[]
    note: string
    thumbnail_url: string | null
    created_by_account_id: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    archived_at: NullableTimestamp
  }
  asset_embeddings: {
    id: string
    asset_id: string
    source_revision: number
    source_kind: "metadata" | "transcription" | "ocr" | "vision"
    sequence: number
    content_text: string
    input_sha256: string
    provider: string
    model: string
    dimensions: number
    embedding: string
    created_at: Timestamp
    updated_at: Timestamp
  }
  asset_embedding_jobs: {
    id: string
    asset_id: string
    analysis_job_id: string
    source_revision: number
    source_kind: "transcription" | "ocr" | "vision"
    sequence: number
    content_text: string
    input_sha256: string
    status: "queued" | "processing" | "succeeded" | "failed" | "expired"
    attempts: Generated<number>
    max_attempts: Generated<number>
    available_at: Timestamp
    locked_by: string | null
    lease_expires_at: NullableTimestamp
    provider: ColumnType<string | null, string | null | undefined, string | null>
    model: string | null
    dimensions: number | null
    last_error: string | null
    created_at: Timestamp
    updated_at: Timestamp
    completed_at: NullableTimestamp
  }
  asset_multipart_uploads: {
    asset_id: string
    upload_id: string
    part_size_bytes: number
    total_parts: number
    created_at: Timestamp
    updated_at: Timestamp
    completed_at: NullableTimestamp
  }
  asset_media: {
    asset_id: string
    status: "pending" | "processing" | "ready" | "failed"
    duration_us: string | null
    width: number | null
    height: number | null
    frame_rate_numerator: number | null
    frame_rate_denominator: number | null
    video_codec: string | null
    audio_codec: string | null
    format_name: string | null
    rotation_degrees: number | null
    is_vfr: boolean | null
    thumbnail_object_key: string | null
    review_proxy_object_key: string | null
    error_message: string | null
    created_at: Timestamp
    updated_at: Timestamp
    processed_at: NullableTimestamp
  }
  media_processing_jobs: {
    asset_id: string
    status: "pending" | "processing" | "succeeded" | "failed"
    attempts: Generated<number>
    max_attempts: Generated<number>
    available_at: Timestamp
    locked_by: string | null
    lease_expires_at: NullableTimestamp
    last_error: string | null
    created_at: Timestamp
    updated_at: Timestamp
    completed_at: NullableTimestamp
  }
  media_analysis_jobs: {
    id: string
    asset_id: string
    kind: MediaAnalysisJob["kind"]
    tool: MediaAnalysisJob["tool"]
    provider: ColumnType<string | null, string | null | undefined, string | null>
    trigger_kind: "manual"
    status: MediaAnalysisJob["status"]
    triggered_by_account_id: string
    source_asset_name: string
    source_checksum_sha256: string
    source_object_key: string
    source_revision: number
    requested_timecode_us: string | null
    attempts: Generated<number>
    max_attempts: Generated<number>
    available_at: Timestamp
    locked_by: string | null
    lease_expires_at: NullableTimestamp
    failure_stage: MediaAnalysisJob["failureStage"]
    last_error: string | null
    shot_count: Generated<number>
    result_text: Generated<string>
    result_segments: JSONColumnType<MediaAnalysisTextSegment[]>
    input_object_key: string | null
    runtime_version: string | null
    model_name: string | null
    model_sha256: string | null
    language: string | null
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    processed_at: NullableTimestamp
    completed_at: NullableTimestamp
  }
  media_analysis_shots: {
    id: string
    job_id: string
    sequence: number
    start_us: string
    end_us: string
    keyframe_us: string
    keyframe_object_key: string
    state: MediaAnalysisShot["state"]
    created_at: Timestamp
  }
  team_portfolios: {
    id: string
    team_id: string
    title: string
    category: string
    year: string
    description: string
    theme_preset: ColumnType<
      TeamPortfolio["themePreset"],
      TeamPortfolio["themePreset"] | undefined,
      TeamPortfolio["themePreset"]
    >
    seo_title: ColumnType<string, string | undefined, string>
    seo_description: ColumnType<string, string | undefined, string>
    custom_domain: string | null
    domain_verification_record: string | null
    domain_verification_status: "pending" | "verified" | null
    domain_verified_at: NullableTimestamp
    state: "团队可见" | "待发布" | "已公开"
    created_by_account_id: string
    published_by_account_id: string | null
    revision: Revision
    public_slug: string | null
    published_at: NullableTimestamp
    created_at: Timestamp
    updated_at: Timestamp
    archived_at: NullableTimestamp
  }
  portfolio_daily_views: {
    portfolio_id: string
    view_date: ColumnType<string, string, string>
    views: number
    unique_visitors: number
  }
  portfolio_daily_visitors: {
    portfolio_id: string
    view_date: ColumnType<string, string, string>
    visitor_hash: string
    first_seen_at: Timestamp
  }
  portfolio_items: {
    id: string
    portfolio_id: string
    asset_id: string
    review_file_id: string
    title: string
    kind: "主片"
    caption: string
    featured: boolean
    sort_order: number
    created_at: Timestamp
    updated_at: Timestamp
  }
  analysis_jobs: {
    id: string
    project_id: string
    kind: "script_breakdown"
    tool: "deterministic_rules_v1"
    trigger_kind: AnalysisJob["triggerKind"]
    approval_policy: AnalysisJob["approvalPolicy"]
    approval_threshold: number
    status: AnalysisJob["status"]
    triggered_by_account_id: string
    source_document_id: string
    source_document_title: string
    source_version_id: string
    source_version_meta: string
    source_revision: number
    source_content: string
    attempts: Generated<number>
    max_attempts: Generated<number>
    available_at: Timestamp
    locked_by: string | null
    lease_expires_at: NullableTimestamp
    failure_stage: AnalysisJob["failureStage"]
    last_error: string | null
    candidate_count: Generated<number>
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    processed_at: NullableTimestamp
    completed_at: NullableTimestamp
    cancelled_at: NullableTimestamp
  }
  analysis_workflows: {
    project_id: string
    enabled: boolean
    source_document_id: string | null
    trigger_kind: "script_version_updated"
    approval_policy: AnalysisWorkflow["approvalPolicy"]
    approval_threshold: number
    configured_by_account_id: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  breakdown_items: {
    id: string
    project_id: string
    category: string
    item: string
    requirement_type: string
    specification: string
    quantity: string
    preparation: string
    department: string
    agent_assessment: string
    source_document: string
    source_version: string
    source_location: string
    source: string
    excerpt: string
    confidence: number
    state: BreakdownItem["state"]
    parent_item_id: ColumnType<string | null, string | null | undefined, string | null>
    merged_into_item_id: ColumnType<
      string | null,
      string | null | undefined,
      string | null
    >
    analysis_job_id: ColumnType<string | null, string | null | undefined, string | null>
    responsible_account_id: ColumnType<
      string | null,
      string | null | undefined,
      string | null
    >
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  breakdown_item_suppliers: {
    breakdown_item_id: string
    supplier_id: string
    created_at: Timestamp
  }
  breakdown_item_tasks: {
    breakdown_item_id: string
    task_id: string
    created_at: Timestamp
  }
  breakdown_item_contacts: {
    breakdown_item_id: string
    contact_source: "team" | "member-shared"
    contact_id: string
    created_at: Timestamp
  }
  breakdown_item_shooting_days: {
    breakdown_item_id: string
    shooting_day_id: string
    created_at: Timestamp
  }
  breakdown_item_call_sheets: {
    breakdown_item_id: string
    call_sheet_id: string
    created_at: Timestamp
  }
  shooting_days: {
    id: string
    project_id: string
    shoot_date: string
    day_number: number
    title: string
    status: "草稿" | "已确认" | "拍摄中" | "已完成" | "已取消"
    original_timezone: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  call_sheets: {
    id: string
    project_id: string
    shooting_day_id: ColumnType<string | null, string | null | undefined, string | null>
    date_label: string
    day_label: string
    title: string
    status: "草稿" | "待确认" | "已发布"
    crew_call: string
    first_shot: string
    wrap_time: string
    weather: string
    sunrise: string
    sunset: string
    basecamp: string
    location: string
    hospital: string
    scenes: JSONColumnType<CallSheetScene[], string, string>
    cast_members: JSONColumnType<CallSheetCast[], string, string>
    departments: JSONColumnType<CallSheetDepartment[], string, string>
    equipment: JSONColumnType<CallSheetEquipment[], string, string>
    safety: JSONColumnType<CallSheetSafety[], string, string>
    transport: JSONColumnType<CallSheetTransport[], string, string>
    catering: JSONColumnType<CallSheetCatering[], string, string>
    key_contacts: JSONColumnType<CallSheetKeyContact[], string, string>
    next_day_preview: JSONColumnType<CallSheetNextDayPreview, string, string>
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  call_sheet_publications: {
    id: string
    call_sheet_id: string
    project_id: string
    version: number
    snapshot: JSONColumnType<CallSheet, string, never>
    published_by_account_id: string | null
    published_at: Timestamp
  }
  call_sheet_publication_recipients: {
    id: string
    publication_id: string
    call_sheet_id: string
    project_id: string
    recipient_account_id: ColumnType<
      string | null,
      string | null | undefined,
      string | null
    >
    notification_id: ColumnType<string | null, string | null | undefined, string | null>
    recipient_snapshot: JSONColumnType<
      { displayName: string; email: string | null; projectRole: string },
      string,
      never
    >
    delivered_at: Timestamp
    created_at: Timestamp
  }
  call_sheet_changes: {
    id: string
    call_sheet_id: string
    project_id: string
    base_publication_id: string | null
    base_publication_version: number | null
    summary: string
    before_snapshot: JSONColumnType<CallSheet, string, never>
    after_snapshot: JSONColumnType<CallSheet, string, never>
    changed_by_account_id: string
    changed_at: Timestamp
  }
  execution_schedule_items: {
    id: string
    project_id: string
    name: string
    starts_at: Timestamp
    ends_at: Timestamp
    original_timezone: string
    progress: number
    owner_name: string
    state: ExecutionStageState
    note: string
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  execution_schedule_resources: {
    schedule_item_id: string
    resource_type: ExecutionResourceType
    resource_id: string
    resource_name: string
  }
  review_files: {
    id: string
    project_id: string
    folder_id: string | null
    name: string
    version: string
    type: "video"
    status: "待审阅" | "审阅中" | "已通过" | "处理中"
    duration: string | null
    asset_id: string | null
    approved_by_account_id: string | null
    approved_by_review_session_id: string | null
    approved_at: NullableTimestamp
    archived_at: NullableTimestamp
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  review_folders: {
    id: string
    project_id: string
    name: string
    created_by_account_id: string | null
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    archived_at: NullableTimestamp
  }
  review_comments: {
    id: string
    project_id: string
    file_id: string
    parent_comment_id: ColumnType<string | null, string | null | undefined, string | null>
    version: string
    author_account_id: string | null
    review_session_id: string | null
    guest_display_name: string | null
    timecode: string
    text: string
    state: "open" | "resolved"
    idempotency_key: string
    request_hash: string | null
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
  }
  review_comment_links: {
    id: string
    project_id: string
    comment_a_id: string
    comment_b_id: string
    created_by_account_id: string
    removed_by_account_id: string | null
    revision: Revision
    created_at: Timestamp
    updated_at: Timestamp
    removed_at: NullableTimestamp
  }
  review_links: {
    id: string
    token_hash: string
    project_id: string
    can_comment: boolean
    can_compare: boolean
    can_download: boolean
    can_approve: boolean
    password_salt: string | null
    password_hash: string | null
    expires_at: Timestamp
    revoked_at: NullableTimestamp
    created_by_account_id: string
    idempotency_key: string
    request_hash: string
    created_at: Timestamp
    updated_at: Timestamp
  }
  review_link_files: {
    link_id: string
    file_id: string
    sort_order: number
  }
  review_sessions: {
    id: string
    link_id: string
    token_hash: string
    display_name: string
    verified_email: string | null
    identity_verified_at: NullableTimestamp
    expires_at: Timestamp
    revoked_at: NullableTimestamp
    last_seen_at: Timestamp
    created_at: Timestamp
  }
  review_identity_challenges: {
    id: string
    link_id: string
    display_name: string
    email: string
    code_hash: string
    expires_at: Timestamp
    attempt_count: Generated<number>
    consumed_at: NullableTimestamp
    created_at: Timestamp
  }
  review_session_receipts: {
    review_session_id: string
    domain: string
    idempotency_key: string
    request_hash: string
    response: JSONColumnType<Record<string, unknown>, string, string>
    created_at: Timestamp
  }
}

export const defaultDatabaseUrl =
  "postgres://shadowproducer:shadowproducer-dev@127.0.0.1:5433/shadowproducer"

export function createDatabase(
  databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl,
  pool = new Pool({ connectionString: databaseUrl }),
) {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool,
    }),
  })
}
