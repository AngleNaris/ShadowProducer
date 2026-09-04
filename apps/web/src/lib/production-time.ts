export type TimeDisambiguation = "earlier" | "later"

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

function zonedParts(date: Date, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>
}

export function toLocalInput(iso: string, timeZone: string) {
  const parts = zonedParts(new Date(iso), timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function zonedLocalCandidates(value: string, timeZone: string) {
  const match = localDateTimePattern.exec(value)
  if (!match) return []
  const [, year, month, day, hour, minute] = match
  const target = Date.UTC(+year, +month - 1, +day, +hour, +minute)
  const offsets = new Set<number>()

  for (let offsetHours = -36; offsetHours <= 36; offsetHours += 6) {
    const sample = target + offsetHours * 60 * 60 * 1000
    const parts = zonedParts(new Date(sample), timeZone)
    offsets.add(
      Date.UTC(
        +parts.year,
        +parts.month - 1,
        +parts.day,
        +parts.hour,
        +parts.minute,
        +parts.second,
      ) - sample,
    )
  }

  return [...offsets]
    .map((offset) => new Date(target - offset).toISOString())
    .filter((candidate) => toLocalInput(candidate, timeZone) === value)
    .sort()
}

export function zonedLocalToIso(
  value: string,
  timeZone: string,
  disambiguation?: TimeDisambiguation,
) {
  if (!localDateTimePattern.test(value)) throw new Error("请填写完整的日期和时间")
  const candidates = zonedLocalCandidates(value, timeZone)
  if (!candidates.length) throw new Error("这个本地时间在所选时区中不存在")
  if (candidates.length > 1 && !disambiguation) {
    throw new Error("这个本地时间出现两次，请选择第一次或第二次")
  }
  const candidate = disambiguation === "later" ? candidates.at(-1) : candidates[0]
  if (!candidate) throw new Error("这个本地时间在所选时区中不存在")
  return candidate
}

export function formatTimeZoneOffset(
  timeZone: string,
  instant: string | Date = new Date(),
) {
  const value = new Intl.DateTimeFormat("en", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(instant))
    .find((part) => part.type === "timeZoneName")?.value
  if (!value || value === "GMT") return "UTC+00:00"
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(value)
  return match
    ? `UTC${match[1]}${(match[2] ?? "0").padStart(2, "0")}:${match[3] ?? "00"}`
    : value.replace("GMT", "UTC")
}
