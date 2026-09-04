import type {
  AgentCommandIntent,
  AgentCommandRepository,
  AgentStoredCommand,
} from "@shadowproducer/application"
import type { AgentCommandResult } from "@shadowproducer/contracts"
import { type Kysely, type Selectable, sql, type Transaction } from "kysely"

import type { Database } from "./database"

type AgentIntentRow = Selectable<Database["agent_command_intents"]>
type DatabaseExecutor = Kysely<Database> | Transaction<Database>

function mapIntent(row: AgentIntentRow): AgentCommandIntent {
  return {
    id: row.id,
    actorId: row.actor_account_id,
    action: row.action,
    risk: row.risk,
    teamId: row.team_id,
    projectId: row.project_id,
    command: row.command as AgentStoredCommand,
    requestHash: row.request_hash,
    summary: row.summary,
    status: row.status,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    consumedAt: row.consumed_at,
    result: row.result,
    createdAt: row.created_at,
  }
}

export class PostgresAgentCommandRepository implements AgentCommandRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async create(intent: AgentCommandIntent) {
    await this.database.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("agent_command_intents")
        .values({
          id: intent.id,
          actor_account_id: intent.actorId,
          action: intent.action,
          risk: intent.risk,
          team_id: intent.teamId,
          project_id: intent.projectId,
          command: JSON.stringify(intent.command),
          request_hash: intent.requestHash,
          summary: intent.summary,
          status: intent.status,
          expires_at: intent.expiresAt,
          confirmed_at: null,
          consumed_at: null,
          result: null,
          created_at: intent.createdAt,
        })
        .execute()
      await this.writeAudit(transaction, intent, "agent.previewed", {
        action: intent.action,
        risk: intent.risk,
        requestHash: intent.requestHash,
      })
    })
  }

  async get(actorId: string, commandId: string) {
    const row = await this.database
      .selectFrom("agent_command_intents")
      .selectAll()
      .where("id", "=", commandId)
      .where("actor_account_id", "=", actorId)
      .executeTakeFirst()
    return row ? mapIntent(row) : null
  }

  async confirm(actorId: string, commandId: string) {
    return this.database.transaction().execute(async (transaction) => {
      const row = await transaction
        .updateTable("agent_command_intents")
        .set({ status: "confirmed", confirmed_at: new Date() })
        .where("id", "=", commandId)
        .where("actor_account_id", "=", actorId)
        .where("status", "=", "pending")
        .where("expires_at", ">", new Date())
        .returningAll()
        .executeTakeFirst()
      if (!row) return null
      const intent = mapIntent(row)
      await this.writeAudit(transaction, intent, "agent.confirmed", {
        action: intent.action,
        risk: intent.risk,
      })
      return intent
    })
  }

  async withExecutionLock<T>(
    actorId: string,
    commandId: string,
    callback: () => Promise<T>,
  ) {
    return this.database.transaction().execute(async (transaction) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${`agent-command:${actorId}:${commandId}`}, 0))`.execute(
        transaction,
      )
      return callback()
    })
  }

  async consume(actorId: string, commandId: string, result: AgentCommandResult) {
    return this.database.transaction().execute(async (transaction) => {
      const row = await transaction
        .updateTable("agent_command_intents")
        .set({
          status: "consumed",
          consumed_at: new Date(),
          result: JSON.stringify(result),
        })
        .where("id", "=", commandId)
        .where("actor_account_id", "=", actorId)
        .where("status", "in", ["pending", "confirmed"])
        .returningAll()
        .executeTakeFirst()
      if (!row) return null
      const intent = mapIntent(row)
      await this.writeAudit(transaction, intent, "agent.executed", {
        action: intent.action,
        risk: intent.risk,
        resultKind: result.kind,
      })
      return intent
    })
  }

  private async writeAudit(
    database: DatabaseExecutor,
    intent: AgentCommandIntent,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await database
      .insertInto("audit_logs")
      .values({
        actor_account_id: intent.actorId,
        actor_type: "agent",
        team_id: intent.teamId,
        project_id: intent.projectId,
        action,
        subject_id: intent.id,
        metadata: JSON.stringify(metadata),
      })
      .execute()
  }
}
