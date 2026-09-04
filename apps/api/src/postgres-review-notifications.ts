import { randomUUID } from "node:crypto"

import { accessAllows } from "@shadowproducer/application"
import type { NotificationKind } from "@shadowproducer/contracts"
import type { Kysely, Transaction } from "kysely"

import type { Database } from "./database"
import { listProjectMemberAccesses } from "./postgres-access"

type DatabaseExecutor = Kysely<Database> | Transaction<Database>

export async function writeReviewActivityNotifications(
  database: DatabaseExecutor,
  input: {
    projectId: string
    sourceActorAccountId: string | null
    sourceActorName: string
    kind: Extract<
      NotificationKind,
      "review_comment_created" | "review_comment_replied" | "review_file_approved"
    >
    subjectId: string
    dedupKey: string
    title: string
    body: string
    metadata: Record<string, unknown>
  },
) {
  const project = await database
    .selectFrom("projects")
    .select("team_id")
    .where("id", "=", input.projectId)
    .executeTakeFirstOrThrow()
  const members = (await listProjectMemberAccesses(database, input.projectId)).filter(
    (member) =>
      member.accountId !== input.sourceActorAccountId &&
      accessAllows(member.access, "project.read", "read") &&
      (accessAllows(member.access, "review.write", "write") ||
        accessAllows(member.access, "review.manage", "write")),
  )
  if (!members.length) return

  const preferences = await database
    .selectFrom("notification_preferences")
    .select(["account_id", "review_activity"])
    .where(
      "account_id",
      "in",
      members.map((member) => member.accountId),
    )
    .where("team_id", "=", project.team_id)
    .execute()
  const disabled = new Set(
    preferences
      .filter((preference) => !preference.review_activity)
      .map((item) => item.account_id),
  )
  const recipients = members.filter((member) => !disabled.has(member.accountId))
  if (!recipients.length) return

  await database
    .insertInto("notifications")
    .values(
      recipients.map((recipient) => ({
        id: randomUUID(),
        recipient_account_id: recipient.accountId,
        source_actor_account_id: input.sourceActorAccountId,
        team_id: project.team_id,
        project_id: input.projectId,
        kind: input.kind,
        subject_id: input.subjectId,
        dedup_key: input.dedupKey,
        title: input.title,
        body: input.body,
        metadata: JSON.stringify({
          ...input.metadata,
          sourceActorName: input.sourceActorName,
        }),
      })),
    )
    .onConflict((conflict) =>
      conflict.columns(["recipient_account_id", "dedup_key"]).doNothing(),
    )
    .execute()
}
