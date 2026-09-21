import type { AssetStorage } from "@shadowproducer/application"
import {
  createHlsMaster,
  playbackResource,
  playbackUrl,
  rewriteHlsPlaylist,
} from "@shadowproducer/application"
import { describe, expect, it, vi } from "vitest"
import { hlsEncodings, hlsMaster, hlsOutputArgs } from "./hls-encoding"

const key =
  "teams/north/derivatives/asset/preview-v2.hls/12345678-1234-1234-1234-123456789012/master.m3u8"
const media =
  '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MAP:URI="v0_init.mp4"\n#EXTINF:4,\nv0_000000.m4s\n#EXTINF:2,\nv0_000001.m4s\n#EXT-X-ENDLIST\n'
const metadata = {
  width: 1920,
  height: 1080,
  rotationDegrees: 0,
  frameRateNumerator: 25,
  frameRateDenominator: 1,
  audioCodec: "aac",
}

describe("HLS display packages", () => {
  it("creates distinct bounded video/audio ladders with aligned keyframes", () => {
    const video = hlsEncodings("视频", metadata)
    expect(video.map((item) => item.resolution?.height)).toEqual([360, 720, 1080])
    for (const profile of video) {
      expect(profile.args).toEqual(
        expect.arrayContaining(["libx264", "expr:gte(t,n_forced*4)", "100", "48000"]),
      )
      expect(profile.args).not.toContain("copy")
    }
    expect(hlsMaster(video)).toContain("RESOLUTION=1280x720")
    const audio = hlsEncodings("音频", metadata)
    expect(audio.map((item) => item.args[item.args.indexOf("-b:a") + 1])).toEqual([
      "64k",
      "128k",
      "192k",
    ])
    expect(hlsMaster(audio)).not.toContain("RESOLUTION")
    expect(hlsOutputArgs("C:\\temp", "v0")).toContain("C:/temp/v0_%06d.m4s")
  })
  it("does not upscale or duplicate source-sized renditions and respects rotation", () => {
    const small = hlsEncodings("视频", { ...metadata, width: 320, height: 240 })
    expect(small).toHaveLength(1)
    expect(small[0]?.resolution).toEqual({ width: 320, height: 240 })
    expect(
      hlsEncodings("视频", { ...metadata, rotationDegrees: 90 })[0]?.resolution,
    ).toEqual({ width: 202, height: 360 })
  })
  it("rewrites master, segment and repeated init references through authenticated endpoints", () => {
    const master = createHlsMaster([
      { uri: "v0.m3u8", bandwidth: 70400, codecs: "mp4a.40.2" },
    ])
    expect(rewriteHlsPlaylist(master)).toContain("?file=v0.m3u8")
    const result = rewriteHlsPlaylist(media)
    expect(result).toContain('URI="?file=v0_init.mp4"')
    expect(result).toContain("?file=v0_000000.m4s")
    expect(result).toContain("#EXT-X-ENDLIST")
  })
  it.each([
    "../original.mp4",
    "https://evil.test/v0.m3u8",
    "//evil.test/v0.m3u8",
    "v0.m3u8?extra=1",
    "%2e%2e%2fsecret",
    "v0\\secret",
    "v0_init.mp4/secret",
  ])("rejects unsafe package paths: %s", async (file) => {
    const storage = {
      createDownloadUrl: vi.fn(),
      readTextObject: vi.fn(),
    } as unknown as AssetStorage
    await expect(playbackResource(storage, key, file)).rejects.toMatchObject({
      code: "MEDIA_PATH_INVALID",
    })
    expect(storage.createDownloadUrl).not.toHaveBeenCalled()
    expect(storage.readTextObject).not.toHaveBeenCalled()
  })
  it("does not allow unsafe references embedded in a playlist", () => {
    expect(() =>
      rewriteHlsPlaylist(media.replace("v0_000000.m4s", "../original.mp4")),
    ).toThrow()
    expect(() =>
      rewriteHlsPlaylist(media.replace("v0_init.mp4", "https://evil.test/init.mp4")),
    ).toThrow()
    expect(() => rewriteHlsPlaylist(media.replace("#EXT-X-ENDLIST", ""))).toThrow()
  })
  it("signs segments briefly, keeps legacy derivatives and never substitutes originals", async () => {
    const storage = {
      createDownloadUrl: vi.fn(async () => "https://storage.test/signed"),
      readTextObject: vi.fn(async () => media),
    } as unknown as AssetStorage
    expect(await playbackUrl(storage, key, "/preview")).toBe("/preview?file=master.m3u8")
    expect(await playbackResource(storage, key, "v0.m3u8")).toHaveProperty("playlist")
    await playbackResource(storage, key, "v0_000000.m4s")
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(
      key.replace("master.m3u8", "v0_000000.m4s"),
      { expiresInSeconds: 60 },
    )
    await expect(
      playbackResource(storage, "preview-v2.mp4", "v0.m3u8"),
    ).rejects.toMatchObject({ code: "MEDIA_NOT_READY" })
  })
})
