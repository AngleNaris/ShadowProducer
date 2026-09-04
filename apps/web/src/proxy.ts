import type { PublicPortfolio } from "@shadowproducer/contracts"
import { type NextRequest, NextResponse } from "next/server"

export async function proxy(request: NextRequest) {
  const hostname = new URL(
    `http://${request.headers.get("host") ?? request.nextUrl.host}`,
  ).hostname.toLowerCase()
  const platformHosts = new Set(
    (process.env.PUBLIC_WEB_HOSTS ?? "localhost,127.0.0.1")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  )
  if (platformHosts.has(hostname)) return NextResponse.next()

  const apiBase = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3220"
  const response = await fetch(
    `${apiBase}/portfolio-domain/${encodeURIComponent(hostname)}`,
    { cache: "no-store" },
  )
  if (!response.ok) return new NextResponse("作品集不存在", { status: 404 })

  const portfolio = (await response.json()) as PublicPortfolio
  const url = request.nextUrl.clone()
  url.pathname = `/portfolio/${portfolio.slug}`
  return NextResponse.rewrite(url)
}

export const config = { matcher: "/" }
