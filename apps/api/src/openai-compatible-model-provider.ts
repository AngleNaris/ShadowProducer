import type { MediaAnalysisTextSegment } from "@shadowproducer/contracts"

export type ModelApiCapability = "transcription" | "vision" | "embedding"

export type ModelApiConfig = {
  baseUrl: string
  apiKey: string
  provider: string
  model: string
  timeoutMs: number
}

type BinaryInput = {
  data: Uint8Array
  fileName: string
  mimeType: string
  instruction?: string
}

type TextAnalysisResult = {
  text: string
  segments: MediaAnalysisTextSegment[]
  language: string | null
  provider: string
  model: string
}

const capabilityPrefix = {
  transcription: "TRANSCRIPTION",
  vision: "MULTIMODAL",
  embedding: "EMBEDDING",
} as const

const defaultTimeout = {
  transcription: 10 * 60_000,
  vision: 5 * 60_000,
  embedding: 60_000,
} as const

export function modelApiConfigFromEnvironment(
  capability: ModelApiCapability,
  environment: Record<string, string | undefined> = process.env,
): ModelApiConfig {
  const prefix = capabilityPrefix[capability]
  const baseUrlValue = environment[`${prefix}_API_BASE_URL`]?.trim()
  const apiKey = environment[`${prefix}_API_KEY`]?.trim()
  const model = environment[`${prefix}_API_MODEL`]?.trim()
  if (!baseUrlValue || !apiKey || !model) {
    throw new Error(`${prefix} 第三方 API 未配置`)
  }
  let baseUrl: URL
  try {
    baseUrl = new URL(baseUrlValue)
  } catch {
    throw new Error(`${prefix} 第三方 API 地址无效`)
  }
  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error(`${prefix} 第三方 API 地址无效`)
  }
  const configuredTimeout = Number(environment[`${prefix}_API_TIMEOUT_MS`])
  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    apiKey,
    provider: environment[`${prefix}_API_PROVIDER`]?.trim() || baseUrl.hostname,
    model,
    timeoutMs:
      Number.isSafeInteger(configuredTimeout) && configuredTimeout >= 1_000
        ? Math.min(configuredTimeout, 60 * 60_000)
        : defaultTimeout[capability],
  }
}

export async function transcribeWithModelApi(
  config: ModelApiConfig,
  input: BinaryInput,
  signal?: AbortSignal,
): Promise<TextAnalysisResult> {
  const body = new FormData()
  body.set("model", config.model)
  body.set("response_format", "verbose_json")
  body.append("timestamp_granularities[]", "segment")
  body.set(
    "file",
    new Blob([Uint8Array.from(input.data)], { type: input.mimeType }),
    input.fileName,
  )
  const payload = await requestJson(
    config,
    "/audio/transcriptions",
    { method: "POST", body },
    "语音转写",
    signal,
  )
  const record = asRecord(payload)
  const segments = Array.isArray(record.segments)
    ? record.segments.flatMap((value, index) => {
        const segment = asRecord(value)
        const text = typeof segment.text === "string" ? segment.text.trim() : ""
        if (!text) return []
        const startUs = secondsToMicroseconds(segment.start)
        const endUs = secondsToMicroseconds(segment.end)
        return [
          {
            sequence: index + 1,
            startUs,
            endUs: endUs === null ? null : Math.max(endUs, (startUs ?? 0) + 1),
            text,
            confidence: null,
          },
        ]
      })
    : []
  const text =
    (typeof record.text === "string" ? record.text.trim() : "") ||
    segments.map((segment) => segment.text).join("\n")
  if (!text) throw new Error("语音转写 API 未返回有效文本")
  return {
    text,
    segments,
    language: typeof record.language === "string" ? record.language : null,
    provider: config.provider,
    model: config.model,
  }
}

export async function recognizeImageWithModelApi(
  config: ModelApiConfig,
  input: BinaryInput,
  signal?: AbortSignal,
): Promise<TextAnalysisResult> {
  const imageUrl = `data:${input.mimeType};base64,${Buffer.from(input.data).toString("base64")}`
  const payload = await requestJson(
    config,
    "/chat/completions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  input.instruction ??
                  "Extract all visible text. Preserve reading order and line breaks. Return text only.",
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    },
    "图像识别",
    signal,
  )
  const choices = asRecord(payload).choices
  const choice = Array.isArray(choices) ? asRecord(choices[0]) : {}
  const content = asRecord(choice.message).content
  const text = readTextContent(content)
  if (!text) throw new Error("图像识别 API 未返回有效文本")
  return {
    text,
    segments: [{ sequence: 1, startUs: null, endUs: null, text, confidence: null }],
    language: null,
    provider: config.provider,
    model: config.model,
  }
}

export async function createEmbeddingWithModelApi(
  config: ModelApiConfig,
  input: string,
  signal?: AbortSignal,
) {
  const payload = await requestJson(
    config,
    "/embeddings",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.model, input }),
    },
    "向量生成",
    signal,
  )
  const data = asRecord(payload).data
  const embedding = Array.isArray(data) ? asRecord(data[0]).embedding : null
  if (
    !Array.isArray(embedding) ||
    embedding.length < 1 ||
    embedding.length > 16_000 ||
    embedding.every((value) => value === 0) ||
    embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error("向量生成 API 返回了无效向量")
  }
  return {
    embedding: embedding as number[],
    provider: config.provider,
    model: config.model,
  }
}

async function requestJson(
  config: ModelApiConfig,
  path: string,
  init: RequestInit,
  label: string,
  signal?: AbortSignal,
) {
  let response: Response
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      redirect: "error",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        ...init.headers,
      },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])
        : AbortSignal.timeout(config.timeoutMs),
    })
  } catch {
    throw new Error(`${label} API 请求失败或超时`)
  }
  if (!response.ok) throw new Error(`${label} API 返回 HTTP ${response.status}`)
  try {
    return (await response.json()) as unknown
  } catch {
    throw new Error(`${label} API 返回了无效 JSON`)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function secondsToMicroseconds(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value * 1_000_000)
    : null
}

function readTextContent(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (!Array.isArray(value)) return ""
  return value
    .map((part) => {
      const record = asRecord(part)
      return typeof record.text === "string" ? record.text.trim() : ""
    })
    .filter(Boolean)
    .join("\n")
}
