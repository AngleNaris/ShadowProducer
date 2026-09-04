import type { PublicPortfolio } from "@shadowproducer/contracts"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { PublicPortfolioView } from "@/components/public-portfolio-page"

type PageProps = { params: Promise<{ slug: string }> }

const getPortfolio = cache(async (slug: string) => {
  const apiBase = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3220"
  const response = await fetch(`${apiBase}/portfolio/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Portfolio API returned ${response.status}`)
  return (await response.json()) as PublicPortfolio
})

function canonicalUrl(portfolio: PublicPortfolio) {
  if (portfolio.customDomain) return `https://${portfolio.customDomain}/`
  const publicBase = process.env.PUBLIC_WEB_BASE_URL ?? "http://127.0.0.1:3211"
  return new URL(`/portfolio/${portfolio.slug}`, publicBase).toString()
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const portfolio = await getPortfolio((await params).slug)
  if (!portfolio) notFound()
  const title = portfolio.seoTitle || portfolio.title
  const description = portfolio.seoDescription || portfolio.description
  const url = canonicalUrl(portfolio)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: "ShadowProducer",
    },
  }
}

export default async function PortfolioPage({ params }: PageProps) {
  const { slug } = await params
  const portfolio = await getPortfolio(slug)
  if (!portfolio) notFound()
  return <PublicPortfolioView slug={slug} portfolio={portfolio} />
}
