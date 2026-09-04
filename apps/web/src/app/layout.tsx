import type { Metadata } from "next"
import { AppProviders } from "@/components/app-providers"

import "./globals.css"

export const metadata: Metadata = {
  title: "ShadowProducer",
  description: "面向影视制作团队的智能协作工作台",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="font-sans">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
