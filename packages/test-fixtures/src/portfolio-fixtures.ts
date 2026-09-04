export const portfolioFixtures = [
  {
    id: "portfolio-winter-coffee",
    teamId: "north",
    title: "冬夜咖啡 · 成片精选",
    category: "品牌短片",
    year: "2026",
    description: "围绕车站夜戏整理的已通过成片版本。",
    state: "团队可见" as const,
    ownerId: "account-fanxing",
    contents: [
      {
        id: "portfolio-item-winter-main-v11",
        assetId: "asset-winter-main-v11",
        reviewFileId: "main-v11",
        title: "冬夜咖啡 · 主片",
        caption: "审片已通过版本",
        featured: true,
        sortOrder: 0,
      },
    ],
  },
] as const
