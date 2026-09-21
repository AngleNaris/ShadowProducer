"use client"

import {
  Gauge,
  LoaderCircle,
  Maximize,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react"
import { type RefObject, useEffect, useRef, useState } from "react"
import type Player from "video.js/dist/types/player"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconButton } from "@/components/workspace/icon-button"
import {
  type MediaQuality,
  mediaQualityLabel,
  selectMediaQuality,
} from "@/lib/media-quality"
import { cn } from "@/lib/utils"
import "./media-player.css"

type QualityList = ArrayLike<MediaQuality> & {
  selectedIndex: number
  on: (event: string, callback: () => void) => void
}
type AdaptivePlayer = Player & { qualityLevels: () => QualityList }
type MediaEvent = (media: HTMLVideoElement) => void
type MediaPlayerProps = {
  src: string
  label: string
  audio?: boolean
  controls?: boolean
  muted?: boolean
  autoPlay?: boolean
  startTime?: number
  className?: string
  mediaRef?: RefObject<HTMLVideoElement | null>
  onLoadedMetadata?: MediaEvent
  onTimeUpdate?: MediaEvent
  onPlay?: MediaEvent
  onPause?: MediaEvent
  onEnded?: MediaEvent
}

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`
}

export function MediaPlayer(props: MediaPlayerProps) {
  const { src, label, audio = false, controls = true, className, mediaRef } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<AdaptivePlayer | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  const [qualities, setQualities] = useState<MediaQuality[]>([])
  const [selection, setSelection] = useState("auto")
  const [active, setActive] = useState("")
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [ready, setReady] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [silent, setSilent] = useState(props.muted ?? false)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const isHls = src.includes(".m3u8")

  // Retrying intentionally recreates the disposed Video.js instance for this source.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the explicit retry trigger.
  useEffect(() => {
    let cancelled = false
    let player: AdaptivePlayer | undefined
    let media: HTMLVideoElement | undefined
    setQualities([])
    setSelection("auto")
    setActive("")
    setError("")
    setWaiting(true)
    setReady(false)
    setTime(0)
    setDuration(0)
    setPlaying(false)
    import("video.js")
      .then(({ default: videojs }) => {
        if (cancelled || !hostRef.current) return
        media = document.createElement("video")
        const video = media
        video.className = "video-js"
        video.setAttribute("playsinline", "")
        video.setAttribute("aria-label", callbacks.current.label)
        hostRef.current.append(video)
        player = videojs(video, {
          controls: false,
          preload: "auto",
          muted: callbacks.current.muted ?? false,
          html5: {
            vhs: { overrideNative: true, enableLowInitialPlaylist: true },
            nativeAudioTracks: false,
            nativeVideoTracks: false,
          },
          sources: [
            {
              src,
              type: isHls ? "application/x-mpegURL" : audio ? "audio/mp4" : "video/mp4",
            },
          ],
        }) as AdaptivePlayer
        playerRef.current = player
        if (mediaRef) mediaRef.current = video
        const levels = player.qualityLevels()
        const updateLevels = () => {
          if (cancelled) return
          setQualities(Array.from(levels))
          const current = levels[levels.selectedIndex]
          setActive(current ? mediaQualityLabel(current) : "")
        }
        levels.on("addqualitylevel", updateLevels)
        levels.on("change", updateLevels)
        player.on("loadedmetadata", () => {
          setReady(true)
          setWaiting(false)
          setDuration(video.duration)
          video.currentTime = Math.min(
            callbacks.current.startTime ?? 0,
            Number.isFinite(video.duration) ? video.duration : 0,
          )
          callbacks.current.onLoadedMetadata?.(video)
          updateLevels()
          if (callbacks.current.autoPlay) video.play().catch(() => setPlaying(false))
        })
        player.on("timeupdate", () => {
          setTime(video.currentTime)
          callbacks.current.onTimeUpdate?.(video)
        })
        player.on("durationchange", () => setDuration(video.duration))
        player.on("play", () => {
          setPlaying(true)
          callbacks.current.onPlay?.(video)
        })
        player.on("pause", () => {
          setPlaying(false)
          callbacks.current.onPause?.(video)
        })
        player.on("ended", () => {
          setPlaying(false)
          callbacks.current.onEnded?.(video)
        })
        player.on("waiting", () => setWaiting(true))
        player.on("playing", () => setWaiting(false))
        player.on("canplay", () => setWaiting(false))
        player.on("volumechange", () => setSilent(video.muted))
        player.on("error", () => {
          setError("媒体暂时无法播放")
          setWaiting(false)
          setPlaying(false)
        })
      })
      .catch(() => {
        if (!cancelled) {
          setError("播放器加载失败")
          setWaiting(false)
        }
      })
    return () => {
      cancelled = true
      if (mediaRef && mediaRef.current === media) mediaRef.current = null
      playerRef.current = null
      player?.dispose()
      media?.remove()
    }
  }, [src, audio, isHls, mediaRef, attempt])

  useEffect(() => {
    playerRef.current?.muted(props.muted ?? false)
  }, [props.muted])

  const toggle = () => {
    const player = playerRef.current
    if (!player) return
    if (player.paused()) {
      if (player.ended()) player.currentTime(0)
      player.play()?.catch(() => setError("播放被中断，请重试"))
    } else player.pause()
  }
  const qualityMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label={`播放质量：${selection === "auto" ? "自动" : "手动"}${active ? ` · ${active}` : ""}`}
          aria-label={`${label} 播放质量：${selection === "auto" ? "自动" : "手动"}${active ? ` · ${active}` : ""}`}
          disabled={!ready || qualities.length === 0}
          className="size-11 shrink-0 text-white hover:bg-white/10"
        >
          <Gauge />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuRadioGroup
          value={selection}
          onValueChange={(value) => {
            const levels = playerRef.current?.qualityLevels()
            if (levels && selectMediaQuality(levels, value)) setSelection(value)
          }}
        >
          <DropdownMenuRadioItem value="auto">
            自动{active ? ` · ${active}` : ""}
          </DropdownMenuRadioItem>
          {qualities.map((level) => (
            <DropdownMenuRadioItem key={level.id} value={level.id}>
              {mediaQualityLabel(level)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div
      ref={shellRef}
      data-media-player
      data-quality-mode={selection}
      data-active-quality={active}
      className={cn(
        "sp-media-player relative flex min-w-0 flex-col bg-media-base text-white",
        controls ? "w-full" : "size-full",
        className,
      )}
    >
      <div
        className={cn(
          "relative min-h-0 w-full",
          audio ? "h-24" : controls ? "aspect-video" : "h-full",
        )}
      >
        <div
          ref={hostRef}
          className={cn("sp-media-host absolute inset-0", audio && "invisible")}
        />
        {audio ? (
          <div className="absolute inset-0 grid place-items-center">
            <Music2 className="size-8 text-white/60" aria-hidden="true" />
          </div>
        ) : null}
        {waiting && !error ? (
          <div
            role="status"
            aria-label="正在缓冲"
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-media-base text-sm"
          >
            <span>{error}</span>
            <IconButton label="重试播放" onClick={() => setAttempt((value) => value + 1)}>
              <RefreshCw />
            </IconButton>
          </div>
        ) : null}
        {!controls ? (
          <div className="absolute bottom-1 right-1 z-20 bg-black/70">
            {isHls && ready && !qualities.length ? (
              <span className="block px-2 py-3 text-xs">自动 · 系统播放器</span>
            ) : (
              qualityMenu
            )}
          </div>
        ) : null}
      </div>
      {controls ? (
        <div className="flex flex-wrap items-center gap-1 border-t border-white/15 px-1">
          <input
            aria-label={`${label} 播放进度`}
            type="range"
            min={0}
            max={Number.isFinite(duration) ? duration : 0}
            step={0.01}
            value={time}
            disabled={!ready}
            onChange={(event) =>
              playerRef.current?.currentTime(Number(event.target.value))
            }
            className="h-6 w-full cursor-pointer accent-primary"
          />
          <IconButton
            label={playing ? "暂停" : "播放"}
            disabled={!ready}
            onClick={toggle}
            className="size-11 text-white hover:bg-white/10"
          >
            {playing ? <Pause /> : <Play />}
          </IconButton>
          <span className="min-w-0 flex-1 text-xs tabular-nums">
            {clock(time)} / {clock(duration)}
          </span>
          <IconButton
            label={silent ? "取消静音" : "静音"}
            onClick={() => playerRef.current?.muted(!silent)}
            className="size-11 text-white hover:bg-white/10"
          >
            {silent ? <VolumeX /> : <Volume2 />}
          </IconButton>
          {qualityMenu}
          {!audio ? (
            <IconButton
              label="全屏"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen()
                else void shellRef.current?.requestFullscreen()
              }}
              className="size-11 text-white hover:bg-white/10"
            >
              <Maximize />
            </IconButton>
          ) : null}
          {isHls && ready && !qualities.length ? (
            <span className="w-full pb-1 text-right text-xs text-white/60">
              自动 · 系统播放器
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
