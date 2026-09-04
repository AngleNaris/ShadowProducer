import type { StoryboardShot } from "@shadowproducer/contracts"

export const fixtureAccounts = [
  { id: "account-fanxing", displayName: "繁星", email: "fanxing@shadowproducer.local" },
  { id: "account-guyao", displayName: "顾遥", email: "guyao@shadowproducer.local" },
  { id: "account-songlan", displayName: "宋岚", email: "songlan@shadowproducer.local" },
] as const

export const fixtureTeams = [
  { id: "north", name: "北岸影像", role: "producer" },
  { id: "midnight", name: "午夜制作", role: "producer" },
  { id: "external", name: "外部协作", role: "viewer" },
] as const

export const fixtureProjects = [
  ["winter-coffee", "north", "冬夜咖啡"],
  ["city-walk", "north", "城市慢行"],
  ["north-brand-film", "north", "北岸品牌片"],
  ["summer-station", "north", "夏末车站"],
  ["mountain-letter", "north", "山中来信"],
  ["blue-hour", "north", "蓝调时刻"],
  ["old-theater", "north", "旧剧场"],
  ["harbor-morning", "north", "港口清晨"],
  ["paper-moon", "north", "纸月亮"],
  ["mercury-perfume", "midnight", "水星香氛"],
  ["neon-hotel", "midnight", "霓虹旅店"],
  ["after-rain", "midnight", "雨后"],
  ["silent-product", "midnight", "静物计划"],
  ["river-doc", "external", "河流纪事"],
  ["island-archive", "external", "岛屿档案"],
] as const

const currentContent = `12. 外景 · 旧站台 · 夜

雨势渐小。空荡的旧站台只剩顶灯的电流声。

顾遥拖着深红色硬壳行李箱，从站台尽头的阴影中走出。

顾遥
（低声）
这次，不会再错过了。

行李箱轮子碾过积水。她停下，抬眼望向远处尚未进站的列车灯。

镜头贴地向前推进，倒影在水面被拉长。`

export function createScriptFixture(projectId: string, projectName: string) {
  return {
    document: {
      id: `${projectId}-shooting-script`,
      title: `${projectName}_拍摄稿`,
      type: "script" as const,
      currentVersionId: "v7",
      isDefault: true,
      createdAt: "2026-08-12T00:00:00.000Z",
    },
    versions: [
      {
        id: "v7",
        meta: "当前协作稿 · 今天 10:20",
        badge: "当前" as const,
        content: currentContent,
        revision: 1,
        isCurrent: true,
      },
      {
        id: "v6",
        meta: "顾遥提交 · 昨天 18:42",
        badge: "历史" as const,
        content:
          "12. 外景 · 旧站台 · 夜\n\n雨夜。顾遥拖着行李箱走入空荡站台。\n\n她停下脚步，看向站台尽头。\n\n顾遥\n我没有迟到。",
        revision: 1,
        isCurrent: false,
      },
      {
        id: "v5",
        meta: "繁星提交 · 8 月 12 日",
        badge: "历史" as const,
        content: "12. 外景 · 车站 · 夜\n\n大雨。顾遥提着行李走上站台，远处有列车鸣笛。",
        revision: 1,
        isCurrent: false,
      },
    ],
  }
}

export const winterCoffeeStoryboardShots = [
  {
    id: "12-01",
    type: "全景",
    seconds: 4,
    dialogue: "",
    lens: "24mm",
    movement: "固定",
    content: "夜，外，旧站台。雨势渐小，站台空无一人。",
    note: "建立空间与孤独感，保留站台纵深。",
    source: "拍摄稿 v7 · 场 12",
    objectPosition: "20% center",
  },
  {
    id: "12-02",
    type: "中景",
    seconds: 5,
    dialogue: "",
    lens: "50mm",
    movement: "缓慢横移",
    content: "顾遥拖着行李箱从阴影中走出，脚步疲惫。",
    note: "人物从右侧入画，给前进方向留空间。",
    source: "拍摄稿 v7 · 场 12",
    objectPosition: "68% center",
  },
  {
    id: "12-03",
    type: "近景",
    seconds: 3,
    dialogue: "",
    lens: "85mm",
    movement: "低位跟随",
    content: "行李箱占画面前景，轮子碾过积水。",
    note: "道具成为动作线索，水花需要清晰可见。",
    source: "分镜 v4 · 镜 12-03",
    objectPosition: "40% 75%",
  },
  {
    id: "12-04",
    type: "特写",
    seconds: 4,
    dialogue: "这次，不会再错过了。",
    lens: "85mm",
    movement: "固定",
    content: "雨水沿发梢落下，她抬眼望向站台尽头。",
    note: "视线变化是情绪转折点。",
    source: "拍摄稿 v7 · 场 12",
    objectPosition: "55% 35%",
  },
  {
    id: "12-05",
    type: "近景",
    seconds: 6,
    dialogue: "",
    lens: "35mm",
    movement: "轨道推进",
    content: "镜头贴地推进至她脚边，倒影在积水中拉长。",
    note: "轨道 6 米，低机位，注意反光连续性。",
    source: "分镜 v4 · 镜 12-05",
    objectPosition: "78% 70%",
  },
] satisfies StoryboardShot[]

export function createWinterCoffeeStoryboardFixture() {
  return {
    document: {
      id: "winter-coffee-storyboard",
      title: "车站段落分镜",
      type: "storyboard" as const,
      currentVersionId: "v4",
      isDefault: false,
      createdAt: "2026-08-12T00:01:00.000Z",
    },
    version: {
      id: "v4",
      meta: "当前分镜 · v4",
      badge: "当前" as const,
      content: JSON.stringify({ schemaVersion: 1, shots: winterCoffeeStoryboardShots }),
      revision: 1,
      isCurrent: true,
    },
  }
}

export const winterCoffeeComments = [
  {
    id: "script-comment-1",
    versionId: "v7",
    actorId: "account-guyao",
    text: "“不会再错过”是否需要更克制一点？",
    excerpt: "这次，不会再错过了。",
  },
  {
    id: "script-comment-2",
    versionId: "v7",
    actorId: "account-songlan",
    text: "建议补充列车灯出现的具体时机。",
    excerpt: "远处尚未进站的列车灯",
  },
] as const
