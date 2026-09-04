import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { StoryboardShot } from "@shadowproducer/contracts"

import {
  nextStoryboardShotId,
  parseStoryboardContent,
  sequenceStoryboardShots,
  serializeStoryboardContent,
  storyboardShotAtTime,
} from "./storyboard-document.ts"

const shots: StoryboardShot[] = [
  {
    id: "12-01",
    type: "全景",
    seconds: 4,
    dialogue: "",
    lens: "24mm",
    movement: "固定",
    content: "建立镜头",
    note: "",
    source: "拍摄稿 v7 · 场 12",
    objectPosition: "center",
  },
  {
    id: "12-02",
    type: "近景",
    seconds: 3.5,
    dialogue: "台词",
    lens: "85mm",
    movement: "推进",
    content: "人物镜头",
    note: "情绪转折",
    source: "拍摄稿 v7 · 场 12",
    objectPosition: "50% 30%",
  },
]

describe("storyboard document", () => {
  test("round-trips structured shots and accepts an empty initial version", () => {
    const associated = [{ ...shots[0], assetId: "asset-storyboard-01" }, shots[1]]
    assert.deepEqual(
      parseStoryboardContent(serializeStoryboardContent(associated)),
      associated,
    )
    assert.deepEqual(parseStoryboardContent(""), [])
  })

  test("rejects invalid JSON, duplicate ids and invalid duration", () => {
    assert.equal(parseStoryboardContent("{"), null)
    assert.equal(
      parseStoryboardContent(serializeStoryboardContent([shots[0], shots[0]])),
      null,
    )
    assert.equal(
      parseStoryboardContent(
        JSON.stringify({ schemaVersion: 1, shots: [{ ...shots[0], seconds: 0 }] }),
      ),
      null,
    )
    assert.equal(
      parseStoryboardContent(
        JSON.stringify({ schemaVersion: 1, shots: [{ ...shots[0], legacy: true }] }),
      ),
      null,
    )
    assert.equal(
      parseStoryboardContent(
        JSON.stringify({ schemaVersion: 1, shots: [{ ...shots[0], assetId: "" }] }),
      ),
      null,
    )
    assert.equal(
      parseStoryboardContent(
        JSON.stringify({ schemaVersion: 1, shots: [{ ...shots[0], assetId: 42 }] }),
      ),
      null,
    )
  })

  test("recalculates downstream timing and derives the next shot id", () => {
    const sequence = sequenceStoryboardShots([{ ...shots[0], seconds: 6 }, shots[1]])
    assert.deepEqual(
      sequence.map(({ start, end }) => [start, end]),
      [
        [0, 6],
        [6, 9.5],
      ],
    )
    assert.equal(nextStoryboardShotId(shots), "12-03")
    assert.equal(storyboardShotAtTime(sequence, 9.5, "12-01")?.id, "12-02")
  })
})
