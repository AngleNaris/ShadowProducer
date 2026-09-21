"use client"

import type { PublicPortfolio } from "@shadowproducer/contracts"
import { useQuery } from "@tanstack/react-query"
import { Film, LoaderCircle, RefreshCw } from "lucide-react"
import { motion } from "motion/react"
import { useEffect } from "react"
import { MediaPlayer } from "@/components/media-player"
import { Button } from "@/components/ui/button"
import { ApiError, publicPortfolioApi } from "@/lib/api-client"
import { cn } from "@/lib/utils"

function PublicPortfolioMedia({
  slug,
  content,
  featured = false,
}: {
  slug: string
  content: PublicPortfolio["contents"][number]
  featured?: boolean
}) {
  const media = useQuery({
    queryKey: ["public-portfolio-media", slug, content.id],
    queryFn: () => publicPortfolioApi.getContentUrl(slug, content.id),
    staleTime: 4 * 60 * 1000,
  })

  return (
    <article className={cn("min-w-0 bg-black text-white", featured && "lg:col-span-2")}>
      <div
        className={cn(
          "grid place-items-center bg-black",
          featured ? "aspect-video" : "aspect-[16/10]",
        )}
      >
        {media.isPending ? (
          <LoaderCircle className="size-5 animate-spin text-white/45" />
        ) : media.isError ? (
          <div className="flex flex-col items-center gap-3 text-xs text-white/55">
            <Film className="size-6" />
            媒体暂不可用
          </div>
        ) : (
          <MediaPlayer
            src={media.data.url}
            label={content.title}
            className="size-full [&>div:first-child]:aspect-auto [&>div:first-child]:flex-1"
          />
        )}
      </div>
      <div className="grid gap-2 border-t border-white/12 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{content.title}</h2>
          {content.caption ? (
            <p className="mt-1 text-xs leading-5 text-white/62">{content.caption}</p>
          ) : null}
        </div>
        <p className="text-xs text-white/45">
          {content.projectName} · {content.version}
          {content.duration ? ` · ${content.duration}` : ""}
        </p>
      </div>
    </article>
  )
}

const themeClasses = {
  editorial: {
    page: "bg-workspace text-foreground",
    header: "border-border bg-background",
    muted: "text-muted-foreground",
  },
  gallery: {
    page: "bg-background text-foreground",
    header: "border-border bg-muted",
    muted: "text-muted-foreground",
  },
  screening: {
    page: "bg-media-base text-white",
    header: "border-white/15 bg-media-base",
    muted: "text-white/62",
  },
} as const

const recordedPortfolioViews = new Set<string>()

export function PublicPortfolioView({
  slug,
  portfolio,
}: {
  slug: string
  portfolio: PublicPortfolio
}) {
  useEffect(() => {
    const key = `shadowproducer:portfolio-view:${slug}:${performance.timeOrigin}`
    if (recordedPortfolioViews.has(key)) return

    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, "1")
    } catch {
      // Browser storage can be unavailable in privacy-restricted contexts.
    }

    recordedPortfolioViews.add(key)
    publicPortfolioApi.recordView(slug).catch(() => {
      recordedPortfolioViews.delete(key)
      try {
        sessionStorage.removeItem(key)
      } catch {
        // The in-memory guard still permits a retry after a failed request.
      }
    })
  }, [slug])

  const featured =
    portfolio.contents.find((content) => content.featured) ?? portfolio.contents[0]
  const remaining = portfolio.contents.filter((content) => content.id !== featured.id)
  const theme = themeClasses[portfolio.themePreset]

  return (
    <main className={cn("min-h-svh", theme.page)} data-theme={portfolio.themePreset}>
      <header className={cn("border-b", theme.header)}>
        <div className="mx-auto flex min-h-12 max-w-[1440px] items-center px-4 text-xs font-semibold sm:px-8">
          ShadowProducer
          <span className={cn("ml-auto font-normal", theme.muted)}>公开作品集</span>
        </div>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="mx-auto max-w-[1440px] px-4 pt-10 pb-6 sm:px-8 sm:pt-14"
      >
        <p className="text-xs font-medium text-primary">
          {portfolio.category} · {portfolio.year}
        </p>
        <h1 className="mt-3 max-w-5xl text-3xl font-semibold leading-tight sm:text-5xl">
          {portfolio.title}
        </h1>
        {portfolio.description ? (
          <p className={cn("mt-5 max-w-3xl text-sm leading-7 sm:text-base", theme.muted)}>
            {portfolio.description}
          </p>
        ) : null}
      </motion.section>

      <section className="mx-auto max-w-[1440px] px-4 pb-4 sm:px-8 sm:pb-8">
        <PublicPortfolioMedia slug={slug} content={featured} featured />
      </section>

      {remaining.length ? (
        <section className="mx-auto grid max-w-[1440px] gap-4 px-4 pb-12 sm:px-8 lg:grid-cols-2">
          {remaining.map((content) => (
            <PublicPortfolioMedia key={content.id} slug={slug} content={content} />
          ))}
        </section>
      ) : null}
    </main>
  )
}

export function PublicPortfolioPage({ slug }: { slug: string }) {
  const portfolio = useQuery({
    queryKey: ["public-portfolio", slug],
    queryFn: () => publicPortfolioApi.get(slug),
  })

  if (portfolio.isPending) {
    return (
      <main className="grid min-h-svh place-items-center bg-workspace text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" />
          正在载入作品集
        </span>
      </main>
    )
  }

  if (portfolio.isError) {
    const message =
      portfolio.error instanceof ApiError && portfolio.error.status === 404
        ? "这个作品集未公开或已经撤回"
        : "作品集暂时无法载入"
    return (
      <main className="grid min-h-svh place-items-center bg-workspace px-6 text-foreground">
        <div className="max-w-md text-center">
          <Film className="mx-auto size-8 text-neutral-400" />
          <h1 className="mt-5 text-xl font-semibold">{message}</h1>
          <Button className="mt-5" variant="outline" onClick={() => portfolio.refetch()}>
            <RefreshCw />
            重新载入
          </Button>
        </div>
      </main>
    )
  }

  return <PublicPortfolioView slug={slug} portfolio={portfolio.data} />
}
