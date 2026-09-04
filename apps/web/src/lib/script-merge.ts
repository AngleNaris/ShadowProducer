export type ScriptMergeChoice = "local" | "server"

export type ScriptMergeSegment =
  | { kind: "unchanged"; lines: string[] }
  | {
      kind: "automatic"
      lines: string[]
      lineStart: number
      lineEnd: number
    }
  | {
      kind: "conflict"
      id: string
      lineStart: number
      lineEnd: number
      baseLines: string[]
      localLines: string[]
      serverLines: string[]
    }

type Change = {
  start: number
  end: number
  lines: string[]
  side: ScriptMergeChoice
}

const maxDiffCells = 2_000_000

function sameLines(left: string[], right: string[]) {
  return (
    left.length === right.length && left.every((line, index) => line === right[index])
  )
}

function diffLines(base: string[], variant: string[], side: ScriptMergeChoice): Change[] {
  if (sameLines(base, variant)) return []

  let prefix = 0
  while (
    prefix < base.length &&
    prefix < variant.length &&
    base[prefix] === variant[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < base.length - prefix &&
    suffix < variant.length - prefix &&
    base[base.length - suffix - 1] === variant[variant.length - suffix - 1]
  ) {
    suffix += 1
  }

  const baseMiddle = base.slice(prefix, base.length - suffix)
  const variantMiddle = variant.slice(prefix, variant.length - suffix)
  if (baseMiddle.length === variantMiddle.length) {
    return baseMiddle.flatMap((line, index) =>
      line === variantMiddle[index]
        ? []
        : [
            {
              start: prefix + index,
              end: prefix + index + 1,
              lines: [variantMiddle[index]],
              side,
            },
          ],
    )
  }
  if (
    baseMiddle.length === 0 ||
    variantMiddle.length === 0 ||
    baseMiddle.length * variantMiddle.length > maxDiffCells
  ) {
    // ponytail: quadratic LCS is capped; use a proven diff engine if real scripts exceed it.
    return [
      {
        start: prefix,
        end: base.length - suffix,
        lines: variantMiddle,
        side,
      },
    ]
  }

  const width = variantMiddle.length + 1
  const table = new Uint32Array((baseMiddle.length + 1) * width)
  for (let baseIndex = baseMiddle.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (
      let variantIndex = variantMiddle.length - 1;
      variantIndex >= 0;
      variantIndex -= 1
    ) {
      const index = baseIndex * width + variantIndex
      table[index] =
        baseMiddle[baseIndex] === variantMiddle[variantIndex]
          ? table[(baseIndex + 1) * width + variantIndex + 1] + 1
          : Math.max(table[(baseIndex + 1) * width + variantIndex], table[index + 1])
    }
  }

  const changes: Change[] = []
  let baseIndex = 0
  let variantIndex = 0
  let active: Change | null = null
  const flush = () => {
    if (!active) return
    changes.push(active)
    active = null
  }

  while (baseIndex < baseMiddle.length || variantIndex < variantMiddle.length) {
    if (
      baseIndex < baseMiddle.length &&
      variantIndex < variantMiddle.length &&
      baseMiddle[baseIndex] === variantMiddle[variantIndex]
    ) {
      flush()
      baseIndex += 1
      variantIndex += 1
      continue
    }

    active ??= {
      start: prefix + baseIndex,
      end: prefix + baseIndex,
      lines: [],
      side,
    }
    if (
      variantIndex < variantMiddle.length &&
      (baseIndex === baseMiddle.length ||
        table[baseIndex * width + variantIndex + 1] >=
          table[(baseIndex + 1) * width + variantIndex])
    ) {
      active.lines.push(variantMiddle[variantIndex])
      variantIndex += 1
    } else {
      baseIndex += 1
      active.end = prefix + baseIndex
    }
  }
  flush()
  return changes
}

function overlaps(left: Change, right: Change) {
  const leftInsertion = left.start === left.end
  const rightInsertion = right.start === right.end
  if (leftInsertion && rightInsertion) return left.start === right.start
  if (leftInsertion) return left.start > right.start && left.start < right.end
  if (rightInsertion) return right.start > left.start && right.start < left.end
  return Math.max(left.start, right.start) < Math.min(left.end, right.end)
}

function applyChanges(base: string[], changes: Change[], start: number, end: number) {
  const lines: string[] = []
  let cursor = start
  for (const change of changes.sort((left, right) => left.start - right.start)) {
    lines.push(...base.slice(cursor, change.start), ...change.lines)
    cursor = change.end
  }
  lines.push(...base.slice(cursor, end))
  return lines
}

export function createScriptMergePlan(
  baseContent: string,
  localContent: string,
  serverContent: string,
): ScriptMergeSegment[] {
  const base = baseContent.split("\n")
  const changes = [
    ...diffLines(base, localContent.split("\n"), "local"),
    ...diffLines(base, serverContent.split("\n"), "server"),
  ].sort((left, right) => left.start - right.start || left.end - right.end)

  const groups: Change[][] = []
  for (const change of changes) {
    const group = groups.at(-1)
    if (group?.some((item) => overlaps(item, change))) group.push(change)
    else groups.push([change])
  }

  const segments: ScriptMergeSegment[] = []
  let cursor = 0
  let conflictIndex = 0
  for (const group of groups) {
    const start = Math.min(...group.map((change) => change.start))
    const end = Math.max(...group.map((change) => change.end))
    if (cursor < start)
      segments.push({ kind: "unchanged", lines: base.slice(cursor, start) })

    const baseLines = base.slice(start, end)
    const localLines = applyChanges(
      base,
      group.filter((change) => change.side === "local"),
      start,
      end,
    )
    const serverLines = applyChanges(
      base,
      group.filter((change) => change.side === "server"),
      start,
      end,
    )
    const automaticLines = sameLines(localLines, serverLines)
      ? localLines
      : sameLines(localLines, baseLines)
        ? serverLines
        : sameLines(serverLines, baseLines)
          ? localLines
          : null

    if (automaticLines) {
      segments.push({
        kind: "automatic",
        lines: automaticLines,
        lineStart: start + 1,
        lineEnd: Math.max(start + 1, end),
      })
    } else {
      conflictIndex += 1
      segments.push({
        kind: "conflict",
        id: `conflict-${start + 1}-${conflictIndex}`,
        lineStart: start + 1,
        lineEnd: Math.max(start + 1, end),
        baseLines,
        localLines,
        serverLines,
      })
    }
    cursor = end
  }
  if (cursor < base.length)
    segments.push({ kind: "unchanged", lines: base.slice(cursor) })
  return segments
}

export function resolveScriptMergePlan(
  plan: ScriptMergeSegment[],
  choices: Record<string, ScriptMergeChoice> = {},
) {
  return plan
    .flatMap((segment) => {
      if (segment.kind !== "conflict") return segment.lines
      return choices[segment.id] === "server" ? segment.serverLines : segment.localLines
    })
    .join("\n")
}
