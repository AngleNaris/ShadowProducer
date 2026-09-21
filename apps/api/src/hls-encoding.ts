import { createHlsMaster } from "@shadowproducer/application"

type HlsMetadata = {
  width: number | null
  height: number | null
  rotationDegrees: number | null
  frameRateNumerator: number | null
  frameRateDenominator: number | null
  audioCodec: string | null
}

export function hlsEncodings(kind: "视频" | "音频", metadata: HlsMetadata) {
  if (kind === "音频") {
    return [64, 128, 192].map((rate, index) => ({
      name: `v${index}`,
      bandwidth: Math.ceil(rate * 1000 * 1.1),
      codecs: "mp4a.40.2",
      args: [
        "-map",
        "0:a:0",
        "-vn",
        "-c:a",
        "aac",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-b:a",
        `${rate}k`,
        "-af",
        "asetpts=PTS-STARTPTS",
      ],
      resolution: undefined,
    }))
  }
  const rotated = Math.abs(metadata.rotationDegrees ?? 0) % 180 === 90
  const width = (rotated ? metadata.height : metadata.width) ?? 0
  const height = (rotated ? metadata.width : metadata.height) ?? 0
  if (width < 2 || height < 2) throw new Error("Invalid video dimensions")
  const sourceFps =
    (metadata.frameRateNumerator ?? 30) / (metadata.frameRateDenominator || 1)
  const fps = Math.min(30, sourceFps > 0 ? sourceFps : 30)
  const seen = new Set<string>()
  return [
    { height: 360, width: 640, rate: 500 },
    { height: 720, width: 1280, rate: 1500 },
    { height: 1080, width: 1920, rate: 3000 },
  ].flatMap((level) => {
    const scale = Math.min(1, level.width / width, level.height / height)
    const resolution = {
      width: Math.max(2, Math.floor((width * scale) / 2) * 2),
      height: Math.max(2, Math.floor((height * scale) / 2) * 2),
    }
    const size = `${resolution.width}x${resolution.height}`
    if (seen.has(size)) return []
    seen.add(size)
    return [
      {
        name: `v${seen.size - 1}`,
        bandwidth: Math.ceil((level.rate + (metadata.audioCodec ? 96 : 0)) * 1000 * 1.1),
        codecs: `avc1.4d4028${metadata.audioCodec ? ",mp4a.40.2" : ""}`,
        resolution,
        args: [
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-profile:v",
          "main",
          "-level:v",
          "4.0",
          "-b:v",
          `${level.rate}k`,
          "-maxrate",
          `${level.rate}k`,
          "-bufsize",
          `${level.rate * 2}k`,
          "-pix_fmt",
          "yuv420p",
          "-vf",
          `scale=${resolution.width}:${resolution.height},setsar=1,setpts=PTS-STARTPTS,fps=${fps}`,
          "-g",
          String(Math.ceil(fps * 4)),
          "-keyint_min",
          String(Math.ceil(fps * 4)),
          "-sc_threshold",
          "0",
          "-force_key_frames",
          "expr:gte(t,n_forced*4)",
          "-c:a",
          "aac",
          "-ac",
          "2",
          "-ar",
          "48000",
          "-b:a",
          "96k",
          "-af",
          "asetpts=PTS-STARTPTS",
        ],
      },
    ]
  })
}

export function hlsOutputArgs(directory: string, name: string) {
  return [
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "fmp4",
    "-hls_flags",
    "independent_segments",
    "-hls_fmp4_init_filename",
    `${name}_init.mp4`,
    "-hls_segment_filename",
    `${directory.replaceAll("\\", "/")}/${name}_%06d.m4s`,
  ]
}

export function hlsMaster(encodings: ReturnType<typeof hlsEncodings>) {
  return createHlsMaster(
    encodings.map(({ name, bandwidth, codecs, resolution }) => ({
      uri: `${name}.m3u8`,
      bandwidth,
      codecs,
      resolution,
    })),
  )
}
