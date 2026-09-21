import assert from "node:assert/strict"
import { test } from "node:test"
import { mediaQualityLabel, selectMediaQuality } from "./media-quality.ts"

test("manual selection pins exactly one rendition; auto restores all", () => {
  const levels = [64, 128, 192].map((bitrate) => ({
    id: String(bitrate),
    bitrate: bitrate * 1000,
    enabled: true,
  }))
  assert.equal(selectMediaQuality(levels, "128"), true)
  assert.deepEqual(
    levels.map((item) => item.enabled),
    [false, true, false],
  )
  assert.equal(selectMediaQuality(levels, "missing"), false)
  assert.equal(selectMediaQuality(levels, "auto"), true)
  assert.ok(levels.every((item) => item.enabled))
  const medium = levels[1]
  assert.ok(medium)
  assert.equal(mediaQualityLabel(medium), "128 kbps")
  assert.equal(mediaQualityLabel({ height: 720, bitrate: 1500000 }), "720p · 1.5 Mbps")
})

test("manual selection re-enables an already allowed rendition to replace old buffers", () => {
  const changes: boolean[] = []
  let enabled = true
  const level = {
    id: "high",
    bitrate: 3000000,
    get enabled() {
      return enabled
    },
    set enabled(value: boolean) {
      changes.push(value)
      enabled = value
    },
  }
  selectMediaQuality([level], "high")
  assert.deepEqual(changes, [false, true])
})
