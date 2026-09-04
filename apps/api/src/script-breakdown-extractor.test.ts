import { extractScriptBreakdown } from "@shadowproducer/application"
import { describe, expect, it } from "vitest"

describe("deterministic script breakdown", () => {
  it("extracts only explicit production candidates with line-level sources", () => {
    const candidates = extractScriptBreakdown({
      documentTitle: "冬夜咖啡_拍摄稿",
      versionId: "v7",
      content: `12. 外景 · 旧站台 · 夜

雨势渐小。空荡的旧站台只剩顶灯的电流声。

顾遥拖着深红色硬壳行李箱，从站台尽头的阴影中走出。

顾遥
（低声）
这次，不会再错过了。

行李箱轮子碾过积水。

建议可能补充人工雨。`,
    })

    expect(
      candidates.map(({ category, item, sourceLocation }) => ({
        category,
        item,
        sourceLocation,
      })),
    ).toEqual([
      { category: "location", item: "旧站台", sourceLocation: "第 1 行" },
      {
        category: "art",
        item: "深红色硬壳行李箱",
        sourceLocation: "第 5 行",
      },
      { category: "cast", item: "顾遥", sourceLocation: "第 7 行" },
      { category: "art", item: "行李箱", sourceLocation: "第 11 行" },
      { category: "special", item: "积水", sourceLocation: "第 11 行" },
    ])
    expect(candidates.every((candidate) => candidate.sourceVersion === "v7")).toBe(true)
    expect(candidates.some((candidate) => candidate.item === "人工雨")).toBe(false)
  })
})
