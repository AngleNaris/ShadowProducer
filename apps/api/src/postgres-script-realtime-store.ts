import type { ScriptPresence } from "@shadowproducer/contracts"
import { type Kysely, sql } from "kysely"

import type { Database } from "./database"

export type ScriptRealtimeEvent = {
  id: number
  event: "script.version.updated" | "script.comment.updated"
  data: Record<string, unknown>
}

export type ScriptPresenceConnection = {
  connectionId: string
  projectId: string
  documentId: string
  accountId: string
  instanceId: string
  leaseExpiresAt: Date
}

export type ScriptRealtimeStore = {
  latestEventId(projectId: string, documentId: string): Promise<number>
  listEvents(
    projectId: string,
    documentId: string,
    afterId: number,
  ): Promise<ScriptRealtimeEvent[]>
  connectPresence(connection: ScriptPresenceConnection): Promise<void>
  disconnectPresence(connection: ScriptPresenceConnection, activeAt: Date): Promise<void>
  updatePresence(
    projectId: string,
    documentId: string,
    presence: ScriptPresence,
    activeAfter: Date,
  ): Promise<boolean>
  touchPresence(connectionId: string, leaseExpiresAt: Date): Promise<void>
  listPresence(
    projectId: string,
    documentId: string,
    activeAfter: Date,
  ): Promise<ScriptPresence[]>
}

const collaborationActions = [
  "script.updated",
  "script.version.created",
  "script.comment.created",
  "script.comment.resolved",
  "script.comment.reopened",
]

export class PostgresScriptRealtimeStore implements ScriptRealtimeStore {
  constructor(private readonly database: Kysely<Database>) {}

  async latestEventId(projectId: string, documentId: string) {
    const row = await this.eventQuery(projectId, documentId)
      .select((expression) => expression.fn.max<number>("id").as("id"))
      .executeTakeFirst()
    return Number(row?.id ?? 0)
  }

  async listEvents(projectId: string, documentId: string, afterId: number) {
    const rows = await this.eventQuery(projectId, documentId)
      .select(["id", "action", "subject_id", "metadata"])
      .where("id", ">", afterId)
      .orderBy("id", "asc")
      .limit(200)
      .execute()

    const events: ScriptRealtimeEvent[] = []
    for (const row of rows) {
      const metadata = row.metadata
      if (row.action === "script.updated" || row.action === "script.version.created") {
        events.push({
          id: Number(row.id),
          event: "script.version.updated",
          data: { versionId: row.subject_id, revision: metadata.revision },
        })
        continue
      }
      if (row.action === "script.comment.created") {
        events.push({
          id: Number(row.id),
          event: "script.comment.updated",
          data: {
            commentId: row.subject_id,
            versionId: metadata.versionId,
            action: "created",
          },
        })
        continue
      }
      if (
        row.action === "script.comment.resolved" ||
        row.action === "script.comment.reopened"
      ) {
        events.push({
          id: Number(row.id),
          event: "script.comment.updated",
          data: {
            commentId: row.subject_id,
            versionId: metadata.versionId,
            action: row.action === "script.comment.resolved" ? "resolved" : "reopened",
          },
        })
      }
    }
    return events
  }

  async connectPresence(connection: ScriptPresenceConnection) {
    await this.database.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("script_presence")
        .values({
          project_id: connection.projectId,
          document_id: connection.documentId,
          account_id: connection.accountId,
          version_id: null,
          cursor_start: null,
          cursor_end: null,
          editing: false,
          updated_at: new Date(),
        })
        .onConflict((conflict) =>
          conflict.columns(["project_id", "document_id", "account_id"]).doNothing(),
        )
        .execute()
      await transaction
        .selectFrom("script_presence")
        .select("account_id")
        .where("project_id", "=", connection.projectId)
        .where("document_id", "=", connection.documentId)
        .where("account_id", "=", connection.accountId)
        .forUpdate()
        .executeTakeFirstOrThrow()
      await transaction
        .deleteFrom("script_presence_connections")
        .where("project_id", "=", connection.projectId)
        .where("document_id", "=", connection.documentId)
        .where("account_id", "=", connection.accountId)
        .where("lease_expires_at", "<", new Date())
        .execute()
      await transaction
        .insertInto("script_presence_connections")
        .values({
          connection_id: connection.connectionId,
          project_id: connection.projectId,
          document_id: connection.documentId,
          account_id: connection.accountId,
          instance_id: connection.instanceId,
          lease_expires_at: connection.leaseExpiresAt,
          updated_at: new Date(),
        })
        .execute()
    })
  }

  async disconnectPresence(connection: ScriptPresenceConnection, activeAt: Date) {
    await this.database.transaction().execute(async (transaction) => {
      await transaction
        .selectFrom("script_presence")
        .select("account_id")
        .where("project_id", "=", connection.projectId)
        .where("document_id", "=", connection.documentId)
        .where("account_id", "=", connection.accountId)
        .forUpdate()
        .executeTakeFirst()
      await transaction
        .deleteFrom("script_presence_connections")
        .where("connection_id", "=", connection.connectionId)
        .where("project_id", "=", connection.projectId)
        .where("document_id", "=", connection.documentId)
        .where("account_id", "=", connection.accountId)
        .execute()
      const activeConnection = await transaction
        .selectFrom("script_presence_connections")
        .select("connection_id")
        .where("project_id", "=", connection.projectId)
        .where("document_id", "=", connection.documentId)
        .where("account_id", "=", connection.accountId)
        .where("lease_expires_at", ">=", activeAt)
        .executeTakeFirst()
      if (activeConnection) return
      await transaction
        .deleteFrom("script_presence")
        .where("project_id", "=", connection.projectId)
        .where("document_id", "=", connection.documentId)
        .where("account_id", "=", connection.accountId)
        .execute()
    })
  }

  async updatePresence(
    projectId: string,
    documentId: string,
    presence: ScriptPresence,
    activeAfter: Date,
  ) {
    const row = await this.database
      .updateTable("script_presence")
      .set({
        version_id: presence.versionId,
        cursor_start: presence.cursorStart,
        cursor_end: presence.cursorEnd,
        editing: presence.editing,
        updated_at: new Date(presence.updatedAt),
      })
      .where("project_id", "=", projectId)
      .where("document_id", "=", documentId)
      .where("account_id", "=", presence.collaboratorId)
      .where((expression) =>
        expression.exists(
          expression
            .selectFrom("script_presence_connections as connection")
            .select("connection.connection_id")
            .whereRef("connection.project_id", "=", "script_presence.project_id")
            .whereRef("connection.document_id", "=", "script_presence.document_id")
            .whereRef("connection.account_id", "=", "script_presence.account_id")
            .where("connection.lease_expires_at", ">=", activeAfter),
        ),
      )
      .returning("account_id")
      .executeTakeFirst()
    return Boolean(row)
  }

  async touchPresence(connectionId: string, leaseExpiresAt: Date) {
    await this.database
      .updateTable("script_presence_connections")
      .set({ lease_expires_at: leaseExpiresAt, updated_at: new Date() })
      .where("connection_id", "=", connectionId)
      .execute()
  }

  async listPresence(projectId: string, documentId: string, activeAfter: Date) {
    const rows = await this.database
      .selectFrom("script_presence")
      .select([
        "account_id",
        "version_id",
        "cursor_start",
        "cursor_end",
        "editing",
        "updated_at",
      ])
      .where("project_id", "=", projectId)
      .where("document_id", "=", documentId)
      .where((expression) =>
        expression.exists(
          expression
            .selectFrom("script_presence_connections as connection")
            .select("connection.connection_id")
            .whereRef("connection.project_id", "=", "script_presence.project_id")
            .whereRef("connection.document_id", "=", "script_presence.document_id")
            .whereRef("connection.account_id", "=", "script_presence.account_id")
            .where("connection.lease_expires_at", ">=", activeAfter),
        ),
      )
      .orderBy("account_id", "asc")
      .execute()
    return rows.map((row) => ({
      collaboratorId: row.account_id,
      versionId: row.version_id,
      cursorStart: row.cursor_start,
      cursorEnd: row.cursor_end,
      editing: row.editing,
      updatedAt: row.updated_at.toISOString(),
    }))
  }

  private eventQuery(projectId: string, documentId: string) {
    return this.database
      .selectFrom("audit_logs")
      .where("project_id", "=", projectId)
      .where("action", "in", collaborationActions)
      .where(sql<boolean>`metadata ->> 'documentId' = ${documentId}`)
  }
}
