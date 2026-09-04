import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@shadowproducer/contracts"],
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: "http://127.0.0.1:3220/api/auth/:path*",
      },
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:3220/:path*",
      },
    ]
  },
}

export default nextConfig
