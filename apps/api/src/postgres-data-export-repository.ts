import { accessAllows, type DataExportRepository } from "@shadowproducer/application"
import type { TeamDataExport } from "@shadowproducer/contracts"
import { type Kysely, sql } from "kysely"

import type { Database } from "./database"
import { resolveTeamAccess } from "./postgres-access"

const exclusions = [
  "账号邮箱、密码、认证账号、登录会话与验证凭据",
  "外部审片链接、访问令牌、客户会话与身份验证码",
  "命令回执、幂等键、请求哈希与 Agent 待执行命令",
  "实时协作 presence、上传分片与后台任务锁",
  "未共享的个人联系人及成员未授权共享字段",
  "媒体二进制、对象存储键、代理文件与关键帧存储键",
]

function camelCaseKey(value: string) {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

function isSensitiveKey(value: string) {
  return /(password|token|secret|salt|requesthash|idempotencykey|objectkey|codehash|apikey)/i.test(
    value.replaceAll("_", ""),
  )
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Date || value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(sanitizeValue)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, item]) => [key, sanitizeValue(item)]),
  )
}

function normalizeRow(row: unknown) {
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, value]) => [camelCaseKey(key), sanitizeValue(value)]),
  )
}

export class PostgresDataExportRepository implements DataExportRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async createTeamDataExport(actorId: string, teamId: string) {
    return this.database
      .transaction()
      .setIsolationLevel("repeatable read")
      .execute(async (transaction) => {
        const teamAccess = await resolveTeamAccess(transaction, actorId, teamId)
        if (!accessAllows(teamAccess, "team.read", "read")) return null

        const team = await transaction
          .selectFrom("teams")
          .select(["id", "name"])
          .where("id", "=", teamId)
          .executeTakeFirstOrThrow()
        const projects = await transaction
          .selectFrom("project_memberships as membership")
          .innerJoin("projects as project", "project.id", "membership.project_id")
          .select([
            "project.id",
            "project.team_id",
            "project.name",
            "project.status",
            "project.updated_at",
            "membership.role",
            "membership.permission_template_id",
            "membership.permission_revision",
          ])
          .where("membership.account_id", "=", actorId)
          .where("project.team_id", "=", teamId)
          .orderBy("project.updated_at", "desc")
          .execute()
        const projectIds = projects.map((project) => project.id)
        const projectSet = new Set(projectIds)
        const visibleScope = (projectId: string | null) =>
          projectId === null || projectSet.has(projectId)

        const teamMembers = await transaction
          .selectFrom("team_memberships as membership")
          .innerJoin("accounts as account", "account.id", "membership.account_id")
          .select([
            "membership.account_id",
            "account.display_name",
            "membership.role",
            "membership.permission_template_id",
            "membership.permission_revision",
          ])
          .where("membership.team_id", "=", teamId)
          .orderBy("account.display_name", "asc")
          .execute()
        const permissionTemplates = await transaction
          .selectFrom("permission_templates")
          .select([
            "id",
            "scope",
            "key",
            "name",
            "permissions",
            "is_system",
            "revision",
            "created_at",
            "updated_at",
          ])
          .where("team_id", "=", teamId)
          .orderBy("scope", "asc")
          .orderBy("name", "asc")
          .execute()
        const projectMembers = projectIds.length
          ? await transaction
              .selectFrom("project_memberships as membership")
              .innerJoin("accounts as account", "account.id", "membership.account_id")
              .select([
                "membership.project_id",
                "membership.account_id",
                "account.display_name",
                "membership.role",
                "membership.permission_template_id",
                "membership.permission_revision",
              ])
              .where("membership.project_id", "in", projectIds)
              .orderBy("membership.project_id", "asc")
              .orderBy("account.display_name", "asc")
              .execute()
          : []

        const workspaceTasks = (
          await transaction
            .selectFrom("workspace_tasks")
            .select([
              "id",
              "team_id",
              "project_id",
              "assignee_account_id",
              "created_by_account_id",
              "title",
              "due_date",
              "status",
              "target_view",
              "revision",
              "created_at",
              "updated_at",
              "deleted_at",
            ])
            .where("team_id", "=", teamId)
            .where("assignee_account_id", "=", actorId)
            .execute()
        ).filter((item) => visibleScope(item.project_id))
        const calendarEvents = (
          await transaction
            .selectFrom("calendar_events")
            .select([
              "id",
              "team_id",
              "project_id",
              "owner_account_id",
              "title",
              "starts_at",
              "ends_at",
              "original_timezone",
              "all_day",
              "visibility",
              "target_view",
              "revision",
              "created_at",
              "updated_at",
              "deleted_at",
            ])
            .where("team_id", "=", teamId)
            .where("owner_account_id", "=", actorId)
            .execute()
        ).filter((item) => visibleScope(item.project_id))
        const workspaceNotes = (
          await transaction
            .selectFrom("workspace_notes")
            .select([
              "id",
              "team_id",
              "project_id",
              "owner_account_id",
              "title",
              "body",
              "kind",
              "pinned",
              "revision",
              "created_at",
              "updated_at",
              "deleted_at",
            ])
            .where("team_id", "=", teamId)
            .where("owner_account_id", "=", actorId)
            .execute()
        ).filter((item) => visibleScope(item.project_id))
        const notifications = (
          await transaction
            .selectFrom("notifications")
            .select([
              "id",
              "source_actor_account_id",
              "team_id",
              "project_id",
              "kind",
              "subject_id",
              "title",
              "body",
              "metadata",
              "read_at",
              "acknowledged_at",
              "created_at",
            ])
            .where("team_id", "=", teamId)
            .where("recipient_account_id", "=", actorId)
            .execute()
        ).filter((item) => visibleScope(item.project_id))
        const notificationPreferences = await transaction
          .selectFrom("notification_preferences")
          .select([
            "team_id",
            "published_call_sheets",
            "important_call_sheet_changes",
            "permission_assignments",
            "portfolio_publications",
            "review_activity",
            "contact_sharing",
          ])
          .where("team_id", "=", teamId)
          .where("account_id", "=", actorId)
          .execute()

        const teamContacts = await transaction
          .selectFrom("team_contacts")
          .select([
            "id",
            "team_id",
            "created_by_account_id",
            "name",
            "role",
            "company",
            "phone",
            "email",
            "revision",
            "created_at",
            "updated_at",
            "deleted_at",
          ])
          .where("team_id", "=", teamId)
          .execute()
        const sharedContactRows = await transaction
          .selectFrom("contact_team_shares as share")
          .innerJoin("personal_contacts as contact", "contact.id", "share.contact_id")
          .innerJoin("accounts as owner", "owner.id", "contact.owner_account_id")
          .select([
            "contact.id",
            "owner.display_name as owner_name",
            "contact.name",
            "contact.role",
            "contact.company",
            "contact.phone",
            "contact.email",
            "share.shared_fields",
            "share.allow_project_link",
            "share.revision",
            "share.created_at",
            "share.updated_at",
          ])
          .where("share.team_id", "=", teamId)
          .where("contact.deleted_at", "is", null)
          .execute()
        const sharedContacts = sharedContactRows.map((contact) => {
          const fields = new Set(contact.shared_fields)
          return {
            id: contact.id,
            owner_name: contact.owner_name,
            name: fields.has("name") ? contact.name : null,
            role: fields.has("role") ? contact.role : null,
            company: fields.has("company") ? contact.company : null,
            phone: fields.has("phone") ? contact.phone : null,
            email: fields.has("email") ? contact.email : null,
            shared_fields: contact.shared_fields,
            allow_project_link: contact.allow_project_link,
            revision: contact.revision,
            created_at: contact.created_at,
            updated_at: contact.updated_at,
          }
        })
        const teamContactProjects = projectIds.length
          ? await transaction
              .selectFrom("team_contact_projects")
              .select(["contact_id", "project_id", "created_at"])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const suppliers = await transaction
          .selectFrom("suppliers")
          .select([
            "id",
            "team_id",
            "created_by_account_id",
            "name",
            "category",
            "services",
            "phone",
            "email",
            "address",
            "revision",
            "created_at",
            "updated_at",
            "deleted_at",
          ])
          .where("team_id", "=", teamId)
          .execute()
        const supplierIds = suppliers.map((supplier) => supplier.id)
        const supplierProjects = projectIds.length
          ? await transaction
              .selectFrom("supplier_projects")
              .select(["supplier_id", "project_id", "created_at"])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const visibleContactIds = new Set([
          ...teamContacts.map((contact) => contact.id),
          ...sharedContacts.map((contact) => contact.id),
        ])
        const supplierContacts = supplierIds.length
          ? (
              await transaction
                .selectFrom("supplier_contacts")
                .select(["supplier_id", "contact_source", "contact_id", "created_at"])
                .where("supplier_id", "in", supplierIds)
                .execute()
            ).filter((item) => visibleContactIds.has(item.contact_id))
          : []

        const assetFolders = await transaction
          .selectFrom("asset_folders")
          .select([
            "id",
            "team_id",
            "parent_id",
            "name",
            "created_by_account_id",
            "revision",
            "created_at",
            "updated_at",
            "archived_at",
          ])
          .where("team_id", "=", teamId)
          .execute()
        const assets = (
          await transaction
            .selectFrom("team_assets")
            .select([
              "id",
              "team_id",
              "project_id",
              "folder_id",
              "name",
              "kind",
              "mime_type",
              "size_bytes",
              "checksum_sha256",
              "status",
              "favorite",
              "rating",
              "tags",
              "note",
              "created_by_account_id",
              "revision",
              "created_at",
              "updated_at",
              "archived_at",
            ])
            .where("team_id", "=", teamId)
            .execute()
        ).filter((item) => visibleScope(item.project_id))
        const assetIds = assets.map((asset) => asset.id)
        const assetMedia = assetIds.length
          ? await transaction
              .selectFrom("asset_media")
              .select([
                "asset_id",
                "status",
                "duration_us",
                "width",
                "height",
                "frame_rate_numerator",
                "frame_rate_denominator",
                "video_codec",
                "audio_codec",
                "format_name",
                "rotation_degrees",
                "is_vfr",
                "created_at",
                "updated_at",
                "processed_at",
              ])
              .where("asset_id", "in", assetIds)
              .execute()
          : []
        const mediaAnalysisJobs = assetIds.length
          ? await transaction
              .selectFrom("media_analysis_jobs")
              .select([
                "id",
                "asset_id",
                "kind",
                "tool",
                "provider",
                "trigger_kind",
                "status",
                "triggered_by_account_id",
                "source_asset_name",
                "source_checksum_sha256",
                "source_revision",
                "requested_timecode_us",
                "failure_stage",
                "shot_count",
                "result_text",
                "result_segments",
                "runtime_version",
                "model_name",
                "model_sha256",
                "language",
                "revision",
                "created_at",
                "updated_at",
                "processed_at",
                "completed_at",
              ])
              .where("asset_id", "in", assetIds)
              .execute()
          : []
        const assetEmbeddings = assetIds.length
          ? await transaction
              .selectFrom("asset_embeddings")
              .select([
                "id",
                "asset_id",
                "source_revision",
                "source_kind",
                "sequence",
                "content_text",
                "input_sha256",
                "provider",
                "model",
                "dimensions",
                "created_at",
                "updated_at",
              ])
              .where("asset_id", "in", assetIds)
              .execute()
          : []
        const mediaAnalysisJobIds = mediaAnalysisJobs.map((job) => job.id)
        const mediaAnalysisShots = mediaAnalysisJobIds.length
          ? await transaction
              .selectFrom("media_analysis_shots")
              .select([
                "id",
                "job_id",
                "sequence",
                "start_us",
                "end_us",
                "keyframe_us",
                "state",
                "created_at",
              ])
              .where("job_id", "in", mediaAnalysisJobIds)
              .execute()
          : []

        const scriptDocuments = projectIds.length
          ? await transaction
              .selectFrom("script_documents")
              .select([
                "id",
                "project_id",
                "title",
                "document_type",
                "is_default",
                "current_version_id",
                "created_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const scriptVersions = projectIds.length
          ? await transaction
              .selectFrom("script_versions")
              .select([
                "project_id",
                "id",
                "document_id",
                "meta",
                "badge",
                "content",
                "revision",
                "is_current",
                "updated_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const scriptComments = projectIds.length
          ? await transaction
              .selectFrom("script_comments")
              .select([
                "id",
                "project_id",
                "version_id",
                "parent_comment_id",
                "author_account_id",
                "text",
                "excerpt",
                "revision",
                "created_at",
                "updated_at",
                "resolved_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const analysisWorkflows = projectIds.length
          ? await transaction
              .selectFrom("analysis_workflows")
              .select([
                "project_id",
                "enabled",
                "source_document_id",
                "trigger_kind",
                "approval_policy",
                "approval_threshold",
                "configured_by_account_id",
                "revision",
                "created_at",
                "updated_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const analysisJobs = projectIds.length
          ? await transaction
              .selectFrom("analysis_jobs")
              .select([
                "id",
                "project_id",
                "kind",
                "tool",
                "trigger_kind",
                "approval_policy",
                "approval_threshold",
                "status",
                "triggered_by_account_id",
                "source_document_id",
                "source_document_title",
                "source_version_id",
                "source_version_meta",
                "source_revision",
                "source_content",
                "failure_stage",
                "candidate_count",
                "revision",
                "created_at",
                "updated_at",
                "processed_at",
                "completed_at",
                "cancelled_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const breakdownItems = projectIds.length
          ? await transaction
              .selectFrom("breakdown_items")
              .select([
                "id",
                "project_id",
                "category",
                "item",
                "requirement_type",
                "specification",
                "quantity",
                "preparation",
                "department",
                "agent_assessment",
                "source_document",
                "source_version",
                "source_location",
                "source",
                "excerpt",
                "confidence",
                "state",
                "parent_item_id",
                "merged_into_item_id",
                "analysis_job_id",
                "responsible_account_id",
                "revision",
                "created_at",
                "updated_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const breakdownIds = breakdownItems.map((item) => item.id)
        const breakdownSuppliers = breakdownIds.length
          ? await transaction
              .selectFrom("breakdown_item_suppliers")
              .select(["breakdown_item_id", "supplier_id", "created_at"])
              .where("breakdown_item_id", "in", breakdownIds)
              .execute()
          : []
        const breakdownTasks = breakdownIds.length
          ? await transaction
              .selectFrom("breakdown_item_tasks")
              .select(["breakdown_item_id", "task_id", "created_at"])
              .where("breakdown_item_id", "in", breakdownIds)
              .execute()
          : []
        const breakdownContacts = breakdownIds.length
          ? (
              await transaction
                .selectFrom("breakdown_item_contacts")
                .select([
                  "breakdown_item_id",
                  "contact_source",
                  "contact_id",
                  "created_at",
                ])
                .where("breakdown_item_id", "in", breakdownIds)
                .execute()
            ).filter((item) => visibleContactIds.has(item.contact_id))
          : []
        const breakdownShootingDays = breakdownIds.length
          ? await transaction
              .selectFrom("breakdown_item_shooting_days")
              .select(["breakdown_item_id", "shooting_day_id", "created_at"])
              .where("breakdown_item_id", "in", breakdownIds)
              .execute()
          : []
        const breakdownCallSheets = breakdownIds.length
          ? await transaction
              .selectFrom("breakdown_item_call_sheets")
              .select(["breakdown_item_id", "call_sheet_id", "created_at"])
              .where("breakdown_item_id", "in", breakdownIds)
              .execute()
          : []
        const shootingDays = projectIds.length
          ? await transaction
              .selectFrom("shooting_days")
              .select([
                "id",
                "project_id",
                "shoot_date",
                "day_number",
                "title",
                "status",
                "original_timezone",
                "revision",
                "created_at",
                "updated_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const callSheets = projectIds.length
          ? await transaction
              .selectFrom("call_sheets")
              .select([
                "id",
                "project_id",
                "shooting_day_id",
                "date_label",
                "day_label",
                "title",
                "status",
                "crew_call",
                "first_shot",
                "wrap_time",
                "weather",
                "sunrise",
                "sunset",
                "basecamp",
                "location",
                "hospital",
                "scenes",
                "cast_members",
                "departments",
                "equipment",
                "safety",
                "transport",
                "catering",
                "key_contacts",
                "next_day_preview",
                "revision",
                "created_at",
                "updated_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const callSheetIds = callSheets.map((item) => item.id)
        const callSheetPublications = projectIds.length
          ? await transaction
              .selectFrom("call_sheet_publications")
              .select([
                "id",
                "call_sheet_id",
                "project_id",
                "version",
                "snapshot",
                "published_by_account_id",
                "published_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const publicationIds = callSheetPublications.map((item) => item.id)
        const callSheetRecipients = publicationIds.length
          ? (
              await transaction
                .selectFrom("call_sheet_publication_recipients")
                .select([
                  "id",
                  "publication_id",
                  "call_sheet_id",
                  "project_id",
                  "recipient_account_id",
                  "recipient_snapshot",
                  "delivered_at",
                  "created_at",
                ])
                .where("publication_id", "in", publicationIds)
                .execute()
            ).map((item) => ({
              ...item,
              recipient_snapshot: {
                displayName: item.recipient_snapshot.displayName,
                projectRole: item.recipient_snapshot.projectRole,
              },
            }))
          : []
        const callSheetChanges = callSheetIds.length
          ? await transaction
              .selectFrom("call_sheet_changes")
              .select([
                "id",
                "call_sheet_id",
                "project_id",
                "base_publication_id",
                "base_publication_version",
                "summary",
                "before_snapshot",
                "after_snapshot",
                "changed_by_account_id",
                "changed_at",
              ])
              .where("call_sheet_id", "in", callSheetIds)
              .execute()
          : []
        const executionStages = projectIds.length
          ? await transaction
              .selectFrom("execution_schedule_items")
              .select([
                "id",
                "project_id",
                "name",
                "starts_at",
                "ends_at",
                "original_timezone",
                "progress",
                "owner_name",
                "state",
                "note",
                "revision",
                "created_at",
                "updated_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const executionStageIds = executionStages.map((item) => item.id)
        const executionResources = executionStageIds.length
          ? await transaction
              .selectFrom("execution_schedule_resources")
              .select([
                "schedule_item_id",
                "resource_type",
                "resource_id",
                "resource_name",
              ])
              .where("schedule_item_id", "in", executionStageIds)
              .execute()
          : []

        const reviewFolders = projectIds.length
          ? await transaction
              .selectFrom("review_folders")
              .select([
                "id",
                "project_id",
                "name",
                "created_by_account_id",
                "revision",
                "created_at",
                "updated_at",
                "archived_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const reviewFiles = projectIds.length
          ? await transaction
              .selectFrom("review_files")
              .select([
                "id",
                "project_id",
                "folder_id",
                "name",
                "version",
                "type",
                "status",
                "duration",
                "asset_id",
                "approved_by_account_id",
                "approved_at",
                "archived_at",
                "revision",
                "created_at",
                "updated_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const reviewComments = projectIds.length
          ? await transaction
              .selectFrom("review_comments")
              .select([
                "id",
                "project_id",
                "file_id",
                "parent_comment_id",
                "version",
                "author_account_id",
                "guest_display_name",
                "timecode",
                "text",
                "state",
                "revision",
                "created_at",
                "updated_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []
        const reviewCommentLinks = projectIds.length
          ? await transaction
              .selectFrom("review_comment_links")
              .select([
                "id",
                "project_id",
                "comment_a_id",
                "comment_b_id",
                "created_by_account_id",
                "removed_by_account_id",
                "revision",
                "created_at",
                "updated_at",
                "removed_at",
              ])
              .where("project_id", "in", projectIds)
              .execute()
          : []

        const portfolios = await transaction
          .selectFrom("team_portfolios")
          .select([
            "id",
            "team_id",
            "title",
            "category",
            "year",
            "description",
            "theme_preset",
            "seo_title",
            "seo_description",
            "custom_domain",
            "domain_verification_record",
            "domain_verification_status",
            "domain_verified_at",
            "state",
            "created_by_account_id",
            "published_by_account_id",
            "revision",
            "public_slug",
            "published_at",
            "created_at",
            "updated_at",
            "archived_at",
          ])
          .where("team_id", "=", teamId)
          .execute()
        const portfolioIds = portfolios.map((item) => item.id)
        const portfolioItems = portfolioIds.length
          ? await transaction
              .selectFrom("portfolio_items")
              .select([
                "id",
                "portfolio_id",
                "asset_id",
                "review_file_id",
                "title",
                "kind",
                "caption",
                "featured",
                "sort_order",
                "created_at",
                "updated_at",
              ])
              .where("portfolio_id", "in", portfolioIds)
              .execute()
          : []
        const portfolioDailyViews = portfolioIds.length
          ? await transaction
              .selectFrom("portfolio_daily_views")
              .select([
                "portfolio_id",
                sql<string>`view_date::text`.as("view_date"),
                "views",
                "unique_visitors",
              ])
              .where("portfolio_id", "in", portfolioIds)
              .orderBy("view_date", "asc")
              .execute()
          : []
        const auditLogs = (
          await transaction
            .selectFrom("audit_logs")
            .select([
              "id",
              "actor_account_id",
              "actor_type",
              "team_id",
              "project_id",
              "action",
              "subject_id",
              "metadata",
              "created_at",
            ])
            .where("team_id", "=", teamId)
            .orderBy("created_at", "asc")
            .orderBy("id", "asc")
            .execute()
        ).filter((item) => visibleScope(item.project_id))

        const rawData: Record<string, unknown[]> = {
          team: [team],
          teamMembers,
          permissionTemplates,
          projects,
          projectMembers,
          workspaceTasks,
          calendarEvents,
          workspaceNotes,
          notifications,
          notificationPreferences,
          teamContacts,
          sharedContacts,
          teamContactProjects,
          suppliers,
          supplierProjects,
          supplierContacts,
          assetFolders,
          assets,
          assetMedia,
          mediaAnalysisJobs,
          mediaAnalysisShots,
          assetEmbeddings,
          portfolios,
          portfolioItems,
          portfolioDailyViews,
          scriptDocuments,
          scriptVersions,
          scriptComments,
          analysisWorkflows,
          analysisJobs,
          breakdownItems,
          breakdownSuppliers,
          breakdownTasks,
          breakdownContacts,
          breakdownShootingDays,
          breakdownCallSheets,
          shootingDays,
          callSheets,
          callSheetPublications,
          callSheetRecipients,
          callSheetChanges,
          executionStages,
          executionResources,
          reviewFolders,
          reviewFiles,
          reviewComments,
          reviewCommentLinks,
          auditLogs,
        }
        const data = Object.fromEntries(
          Object.entries(rawData).map(([name, rows]) => [name, rows.map(normalizeRow)]),
        )
        const snapshot = {
          format: "shadowproducer-business-data",
          version: 1,
          generatedAt: new Date().toISOString(),
          scope: {
            teamId,
            teamName: team.name,
            projectIds,
          },
          manifest: {
            sections: Object.entries(data).map(([name, rows]) => ({
              name,
              count: rows.length,
            })),
            exclusions,
          },
          data,
        } satisfies TeamDataExport

        await transaction
          .insertInto("audit_logs")
          .values({
            actor_account_id: actorId,
            team_id: teamId,
            project_id: null,
            action: "team-data.exported",
            subject_id: teamId,
            metadata: JSON.stringify({
              format: snapshot.format,
              version: snapshot.version,
              projectCount: snapshot.scope.projectIds.length,
              sectionCounts: Object.fromEntries(
                snapshot.manifest.sections.map((section) => [
                  section.name,
                  section.count,
                ]),
              ),
            }),
          })
          .execute()
        return snapshot
      })
  }
}
