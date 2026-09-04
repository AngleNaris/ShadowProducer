export type ScriptBreakdownCandidate = {
  category: "cast" | "location" | "art" | "special"
  item: string
  requirementType: string
  specification: string
  quantity: string
  preparation: string
  department: string
  agentAssessment: string
  sourceDocument: string
  sourceVersion: string
  sourceLocation: string
  source: string
  excerpt: string
  confidence: number
}

type ExtractInput = {
  content: string
  documentTitle: string
  versionId: string
}

const speculativeLanguage = /(可能|建议|似乎|或许|考虑)/u
const sceneHeading = /^\s*\d+[.、]?\s*(内景|外景)\s*·\s*(.+?)\s*·\s*(日|夜|晨|昏)\s*$/u
const roleLine = /^[\p{Script=Han}·]{2,8}$/u
const suitcase =
  /(?:深红色|红色|蓝色|黑色|白色|银色|黄色)?硬壳行李箱|(?:深红色|红色|蓝色|黑色|白色|银色|黄色)?行李箱/gu

export function extractScriptBreakdown({
  content,
  documentTitle,
  versionId,
}: ExtractInput): ScriptBreakdownCandidate[] {
  const lines = content.split(/\r?\n/)
  const candidates: ScriptBreakdownCandidate[] = []
  const seen = new Set<string>()
  const add = (
    lineIndex: number,
    candidate: Omit<
      ScriptBreakdownCandidate,
      "sourceDocument" | "sourceVersion" | "sourceLocation" | "source" | "excerpt"
    >,
  ) => {
    const sourceLocation = `第 ${lineIndex + 1} 行`
    const key = `${candidate.category}\u0000${candidate.item}\u0000${sourceLocation}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({
      ...candidate,
      sourceDocument: documentTitle,
      sourceVersion: versionId,
      sourceLocation,
      source: `${documentTitle} · ${versionId}`,
      excerpt: lines[lineIndex].trim().slice(0, 500),
    })
  }

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.trim()
    if (!line || speculativeLanguage.test(line)) continue

    const scene = sceneHeading.exec(line)
    if (scene) {
      add(lineIndex, {
        category: "location",
        item: scene[2].trim(),
        requirementType: `${scene[1]}拍摄场地`,
        specification: `${scene[1]} / ${scene[3]}`,
        quantity: "1 处",
        preparation: "确认场地许可、进出条件、供电与现场安全",
        department: "制片 / 场务",
        agentAssessment: "确定性规则命中标准场景标题中的明确场地",
        confidence: 98,
      })
    }

    for (const match of line.matchAll(suitcase)) {
      add(lineIndex, {
        category: "art",
        item: match[0],
        requirementType: "画面明确道具",
        specification: match[0],
        quantity: "1 件",
        preparation: "核对外观、连续性与备用件",
        department: "美术 / 道具",
        agentAssessment: "确定性规则命中原文明示的行李箱道具",
        confidence: 96,
      })
    }

    if (line.includes("积水")) {
      add(lineIndex, {
        category: "special",
        item: "积水",
        requirementType: "特殊环境",
        specification: "地面积水",
        quantity: "按场次",
        preparation: "确认积水连续性、防滑、用电隔离与排水方案",
        department: "特效 / 安全 / 场务",
        agentAssessment: "确定性规则命中原文明示的积水环境",
        confidence: 94,
      })
    }

    if (line.includes("人工雨")) {
      add(lineIndex, {
        category: "special",
        item: "人工雨",
        requirementType: "特殊效果",
        specification: "人工降雨",
        quantity: "按场次",
        preparation: "确认雨效覆盖、供水排水、用电隔离与演员保暖",
        department: "特效 / 安全 / 场务",
        agentAssessment: "确定性规则命中原文明示的人工雨要求",
        confidence: 98,
      })
    }

    const nextNonEmpty = lines
      .slice(lineIndex + 1)
      .find((item) => item.trim())
      ?.trim()
    const followingNonEmpty = lines
      .slice(lineIndex + 2)
      .find((item) => item.trim())
      ?.trim()
    const hasDialogue =
      Boolean(nextNonEmpty?.match(/[，。？！!?]/u)) ||
      (Boolean(nextNonEmpty?.startsWith("（")) && Boolean(followingNonEmpty))
    if (roleLine.test(line) && hasDialogue) {
      add(lineIndex, {
        category: "cast",
        item: line,
        requirementType: "对白角色",
        specification: "原文独立角色行",
        quantity: "1 位",
        preparation: "核对演员、档期、造型与现场调度",
        department: "选角 / 演员统筹",
        agentAssessment: "确定性规则命中独立角色行及其后对白",
        confidence: 95,
      })
    }
  }

  return candidates
}
