import { describe, expect, it } from "vitest"

import {
  isCurrentAnalysisSource,
  parseProbeOutput,
  parseSceneTimes,
} from "./media-worker"

describe("media probe parser", () => {
  it("keeps integer time and rational frame-rate metadata", () => {
    expect(
      parseProbeOutput(
        JSON.stringify({
          format: { duration: "4.004", format_name: "mov,mp4" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 640,
              height: 360,
              avg_frame_rate: "24000/1001",
              r_frame_rate: "24/1",
              side_data_list: [{ rotation: -90 }],
            },
            { codec_type: "audio", codec_name: "aac" },
          ],
        }),
      ),
    ).toEqual({
      durationUs: 4_004_000,
      width: 640,
      height: 360,
      frameRateNumerator: 24000,
      frameRateDenominator: 1001,
      videoCodec: "h264",
      audioCodec: "aac",
      formatName: "mov,mp4",
      rotationDegrees: -90,
      variableFrameRate: true,
    })
  })

  it("returns nulls for malformed optional metadata", () => {
    expect(parseProbeOutput('{"streams":[]}')).toEqual({
      durationUs: null,
      width: null,
      height: null,
      frameRateNumerator: null,
      frameRateDenominator: null,
      videoCodec: null,
      audioCodec: null,
      formatName: null,
      rotationDegrees: null,
      variableFrameRate: null,
    })
  })
})

describe("scene boundary parser", () => {
  it("sorts, de-duplicates, and caps real FFmpeg showinfo timestamps", () => {
    const output = [
      "[Parsed_showinfo_1] n: 2 pts_time:4.2",
      "[Parsed_showinfo_1] n: 0 pts_time:1.0",
      "[Parsed_showinfo_1] n: 1 pts_time:1.04",
      "[Parsed_showinfo_1] n: 3 pts_time:8.0",
    ].join("\n")

    expect(parseSceneTimes(output, 10_000_000, 3)).toEqual([
      { startUs: 0, endUs: 1_000_000, keyframeUs: 500_000 },
      { startUs: 1_000_000, endUs: 4_200_000, keyframeUs: 1_500_000 },
      { startUs: 4_200_000, endUs: 10_000_000, keyframeUs: 4_700_000 },
    ])
  })
})

describe("media analysis source snapshot", () => {
  const source = {
    objectKey: "teams/north/originals/video.mp4",
    checksumSha256: "a".repeat(64),
    revision: 2,
  }
  const asset = {
    status: "ready",
    archivedAt: null,
    objectKey: source.objectKey,
    checksumSha256: source.checksumSha256,
    revision: source.revision,
  }

  it("expires a queued analysis after asset metadata revision changes", () => {
    expect(isCurrentAnalysisSource(asset, source)).toBe(true)
    expect(isCurrentAnalysisSource({ ...asset, revision: 3 }, source)).toBe(false)
  })
})
