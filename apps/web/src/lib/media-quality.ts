export type MediaQuality = {
  id: string
  height?: number
  bitrate: number
  enabled: boolean
}

export function selectMediaQuality(levels: ArrayLike<MediaQuality>, selected: string) {
  const values = Array.from(levels)
  if (selected !== "auto" && !values.some((level) => level.id === selected)) return false
  // VHS fast switching runs on a disabled-to-enabled transition, including buffered clips.
  if (selected !== "auto") {
    for (const level of values) level.enabled = false
  }
  for (const level of values) level.enabled = selected === "auto" || level.id === selected
  return true
}

export function mediaQualityLabel(level: Pick<MediaQuality, "height" | "bitrate">) {
  const bitrate =
    level.bitrate >= 1_000_000
      ? `${(level.bitrate / 1_000_000).toFixed(1)} Mbps`
      : `${Math.round(level.bitrate / 1000)} kbps`
  return level.height ? `${level.height}p · ${bitrate}` : bitrate
}
