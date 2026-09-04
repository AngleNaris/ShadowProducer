import assert from "node:assert/strict"
import test from "node:test"

import { executionResourcesFromNames } from "./production-resources.ts"

test("preserves stable resource IDs while assigning IDs to new names", () => {
  assert.deepEqual(
    executionResourcesFromNames(
      {
        cast: "顾遥",
        crew: "",
        location: "",
        equipment: "P1 验收摄像机、新设备",
      },
      [
        { id: "cast-guyao", type: "cast", name: "顾遥" },
        {
          id: "p1-acceptance-camera",
          type: "equipment",
          name: "P1 验收摄像机",
        },
      ],
    ),
    [
      { id: "cast-guyao", type: "cast", name: "顾遥" },
      { id: "p1-acceptance-camera", type: "equipment", name: "P1 验收摄像机" },
      { id: "新设备", type: "equipment", name: "新设备" },
    ],
  )
})
