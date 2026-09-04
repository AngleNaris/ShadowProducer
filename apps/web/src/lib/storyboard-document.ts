import type { StoryboardContent, StoryboardShot } from "@shadowproducer/contracts"

export type SequencedStoryboardShot = StoryboardShot & { start: number; end: number }

const textFields = [
  "id",
  "type",
  "dialogue",
  "lens",
  "movement",
  "content",
  "note",
  "source",
  "objectPosition",
] as const
const storyboardFields = new Set<string>([...textFields, "seconds"])
storyboardFields.add("assetId")

export function parseStoryboardContent(content: string): StoryboardShot[] | null {
  if (!content.trim()) return []
  try {
    const value = JSON.parse(content) as Partial<StoryboardContent>
    if (
      Object.keys(value).some(
        (field) => field !== "schemaVersion" && field !== "shots",
      ) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.shots)
    )
      return null
    if (value.shots.length > 500) return null
    const ids = new Set<string>()
    for (const shot of value.shots) {
      if (
        !shot ||
        Object.keys(shot).some((field) => !storyboardFields.has(field)) ||
        textFields.some((field) => typeof shot[field] !== "string") ||
        (shot.assetId !== undefined &&
          (typeof shot.assetId !== "string" ||
            shot.assetId.length < 1 ||
            shot.assetId.length > 100)) ||
        !shot.id ||
        ids.has(shot.id) ||
        !Number.isFinite(shot.seconds) ||
        shot.seconds < 0.5 ||
        shot.seconds > 300
      ) {
        return null
      }
      ids.add(shot.id)
    }
    return value.shots.map((shot) => ({ ...shot }))
  } catch {
    return null
  }
}

export function serializeStoryboardContent(shots: StoryboardShot[]) {
  return JSON.stringify({ schemaVersion: 1, shots } satisfies StoryboardContent)
}

export function sequenceStoryboardShots(shots: StoryboardShot[]) {
  let start = 0
  return shots.map((shot) => {
    const item = { ...shot, start, end: start + shot.seconds }
    start = item.end
    return item
  })
}

export function storyboardShotAtTime(
  sequence: SequencedStoryboardShot[],
  time: number,
  selectedId: string,
) {
  const total = sequence.at(-1)?.end ?? 0
  return (
    sequence.find((shot) => time >= shot.start && time < shot.end) ??
    (time >= total ? sequence.at(-1) : undefined) ??
    sequence.find((shot) => shot.id === selectedId) ??
    sequence[0]
  )
}

export function nextStoryboardShotId(shots: StoryboardShot[]) {
  const scene = /^(.*?)-(\d+)$/.exec(shots[0]?.id ?? "")?.[1] ?? "1"
  const number =
    Math.max(
      0,
      ...shots.map((shot) => Number.parseInt(/-(\d+)$/.exec(shot.id)?.[1] ?? "0", 10)),
    ) + 1
  return `${scene}-${String(number).padStart(2, "0")}`
}
