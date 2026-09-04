import { randomUUID } from "node:crypto"

import type { AgentCommandIntent } from "@shadowproducer/application"
import { Pool } from "pg"
import { afterAll, describe, expect, it } from "vitest"

import { createDatabase, defaultDatabaseUrl } from "./database"
import { PostgresAgentCommandRepository } from "./postgres-agent-command-repository"

const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl,
  max: 4,
})
const database = createDatabase(undefined, pool)

afterAll(async () => {
  await database.destroy()
})

describe("Postgres Agent command execution", () => {
  it("records preview, confirmation and execution as Agent actions", async () => {
    const repository = new PostgresAgentCommandRepository(database)
    const commandId = `pg-agent-audit-${randomUUID()}`
    const now = new Date()
    const intent: AgentCommandIntent = {
      id: commandId,
      actorId: "account-fanxing",
      action: "list_tasks",
      risk: "high",
      teamId: "north",
      projectId: "winter-coffee",
      command: {
        action: "list_tasks",
        teamId: "north",
        projectId: "winter-coffee",
      },
      requestHash: commandId,
      summary: "列出项目任务",
      status: "pending",
      expiresAt: new Date(now.getTime() + 60_000),
      confirmedAt: null,
      consumedAt: null,
      result: null,
      createdAt: now,
    }

    try {
      await repository.create(intent)
      await repository.confirm(intent.actorId, commandId)
      await repository.consume(intent.actorId, commandId, {
        kind: "task_list",
        items: [],
      })

      expect(
        await database
          .selectFrom("audit_logs")
          .select(["actor_account_id", "actor_type", "action", "subject_id"])
          .where("subject_id", "=", commandId)
          .orderBy("id", "asc")
          .execute(),
      ).toEqual([
        {
          actor_account_id: intent.actorId,
          actor_type: "agent",
          action: "agent.previewed",
          subject_id: commandId,
        },
        {
          actor_account_id: intent.actorId,
          actor_type: "agent",
          action: "agent.confirmed",
          subject_id: commandId,
        },
        {
          actor_account_id: intent.actorId,
          actor_type: "agent",
          action: "agent.executed",
          subject_id: commandId,
        },
      ])
    } finally {
      await database
        .deleteFrom("audit_logs")
        .where("subject_id", "=", commandId)
        .execute()
      await database
        .deleteFrom("agent_command_intents")
        .where("id", "=", commandId)
        .execute()
    }
  })

  it("serializes the same actor and command across repository instances", async () => {
    const first = new PostgresAgentCommandRepository(database)
    const second = new PostgresAgentCommandRepository(database)
    let active = 0
    let maximumActive = 0
    const execute = (repository: PostgresAgentCommandRepository) =>
      repository.withExecutionLock("actor", "command", async () => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise((resolve) => setTimeout(resolve, 25))
        active -= 1
      })

    await Promise.all([execute(first), execute(second)])

    expect(maximumActive).toBe(1)
  })
})
