import { parse, setOptions, stringify, types } from "hls-parser"
import type { AssetStorage } from "./asset-service"
import { AppError } from "./script-service"

setOptions({ strictMode: true, silent: true })

export type PlaybackResource = { url: string } | { playlist: string }

export function createHlsMaster(
  variants: Array<{
    uri: string
    bandwidth: number
    codecs: string
    resolution?: { width: number; height: number }
  }>,
) {
  return stringify(
    new types.MasterPlaylist({
      version: 7,
      independentSegments: true,
      variants: variants.map((variant) => new types.Variant(variant)),
    }),
  )
}

export function isHlsPackage(objectKey: string) {
  return /\/preview-v2\.hls\/[a-f0-9-]{36}\/master\.m3u8$/.test(objectKey)
}

export function playbackUrl(storage: AssetStorage, objectKey: string, endpoint: string) {
  return isHlsPackage(objectKey)
    ? Promise.resolve(`${endpoint}?file=master.m3u8`)
    : storage.createDownloadUrl(objectKey)
}

function packageFile(file: string) {
  if (!/^(?:master\.m3u8|v[0-2]\.m3u8|v[0-2]_(?:init\.mp4|\d{6}\.m4s))$/.test(file)) {
    throw new AppError("MEDIA_PATH_INVALID", "播放文件路径无效", 400)
  }
  return file
}

export function rewriteHlsPlaylist(source: string) {
  const playlist = parse(source)
  const uri = (value: string) => `?file=${encodeURIComponent(packageFile(value))}`
  if (playlist.isMasterPlaylist) {
    if (
      playlist.sessionDataList.length ||
      playlist.sessionKeyList.length ||
      playlist.contentSteering
    ) {
      throw new Error("Unsupported HLS master metadata")
    }
    for (const variant of playlist.variants) {
      if (variant.audio.length || variant.video.length || variant.subtitles.length) {
        throw new Error("Unexpected alternate rendition")
      }
      variant.uri = uri(variant.uri)
    }
  } else {
    if (
      !playlist.endlist ||
      playlist.prefetchSegments.length ||
      playlist.renditionReports.length
    ) {
      throw new Error("Only completed HLS VOD is supported")
    }
    for (const segment of playlist.segments) {
      if (segment.key || segment.parts.length)
        throw new Error("Unexpected HLS encryption or parts")
      segment.uri = uri(segment.uri)
      if (segment.map) segment.map = { ...segment.map, uri: uri(segment.map.uri) }
    }
  }
  return stringify(playlist)
}

// Call only after the owning service authorizes the current asset/link/publication.
export async function playbackResource(
  storage: AssetStorage,
  objectKey: string,
  file?: string,
): Promise<PlaybackResource> {
  if (!isHlsPackage(objectKey)) {
    if (file) throw new AppError("MEDIA_NOT_READY", "多码率文件尚未生成", 409)
    return { url: await storage.createDownloadUrl(objectKey) }
  }
  const name = packageFile(file ?? "master.m3u8")
  const key = objectKey.slice(0, -"master.m3u8".length) + name
  if (!name.endsWith(".m3u8")) {
    return { url: await storage.createDownloadUrl(key, { expiresInSeconds: 60 }) }
  }
  try {
    return { playlist: rewriteHlsPlaylist(await storage.readTextObject(key)) }
  } catch {
    throw new AppError("MEDIA_PLAYLIST_UNAVAILABLE", "播放清单暂不可用", 502)
  }
}
