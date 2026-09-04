import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createEmbeddingWithModelApi,
  type ModelApiConfig,
  modelApiConfigFromEnvironment,
  recognizeImageWithModelApi,
  transcribeWithModelApi,
} from "./openai-compatible-model-provider"

const config: ModelApiConfig = {
  baseUrl: "https://models.example.test/v1",
  apiKey: "secret-model-key",
  provider: "compatible-api",
  model: "model-1",
  timeoutMs: 1_000,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("OpenAI-compatible model provider", () => {
  it("loads isolated capability configuration and rejects unsafe base URLs", () => {
    expect(
      modelApiConfigFromEnvironment("embedding", {
        EMBEDDING_API_BASE_URL: "https://models.example.test/v1/",
        EMBEDDING_API_KEY: " key ",
        EMBEDDING_API_PROVIDER: " provider ",
        EMBEDDING_API_MODEL: " embedding-1 ",
        EMBEDDING_API_TIMEOUT_MS: "2000",
      }),
    ).toEqual({
      baseUrl: "https://models.example.test/v1",
      apiKey: "key",
      provider: "provider",
      model: "embedding-1",
      timeoutMs: 2_000,
    })

    for (const baseUrl of [
      "not a url",
      "file:///models",
      "https://user:password@models.example.test/v1",
      "https://models.example.test/v1?token=secret-model-key",
      "https://models.example.test/v1#secret-model-key",
    ]) {
      expect(() =>
        modelApiConfigFromEnvironment("embedding", {
          EMBEDDING_API_BASE_URL: baseUrl,
          EMBEDDING_API_KEY: "secret-model-key",
          EMBEDDING_API_MODEL: "embedding-1",
        }),
      ).toThrow("EMBEDDING 第三方 API 地址无效")
    }
  })

  it("sends transcription audio as multipart without following redirects", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.redirect).toBe("error")
        expect(init?.headers).toMatchObject({ authorization: "Bearer secret-model-key" })
        const body = init?.body as FormData
        expect(body.get("model")).toBe("model-1")
        expect(body.get("file")).toBeInstanceOf(Blob)
        return Response.json({
          text: "第一句",
          language: "zh",
          segments: [{ start: 1.25, end: 2.5, text: "第一句" }],
        })
      },
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      transcribeWithModelApi(config, {
        data: Uint8Array.from([1, 2, 3]),
        fileName: "input.wav",
        mimeType: "audio/wav",
      }),
    ).resolves.toMatchObject({
      text: "第一句",
      language: "zh",
      provider: "compatible-api",
      model: "model-1",
      segments: [{ sequence: 1, startUs: 1_250_000, endUs: 2_500_000 }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://models.example.test/v1/audio/transcriptions",
      expect.any(Object),
    )
  })

  it("reads vision text content and embedding vectors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: [{ type: "text", text: "  站名：北岸  " }] } }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: "雨夜车站的中景镜头" } }] }),
      )
      .mockResolvedValueOnce(Response.json({ data: [{ embedding: [0.1, -0.2, 0.3] }] }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      recognizeImageWithModelApi(config, {
        data: Uint8Array.from([137, 80, 78, 71]),
        fileName: "frame.png",
        mimeType: "image/png",
      }),
    ).resolves.toMatchObject({ text: "站名：北岸", provider: "compatible-api" })
    await expect(
      recognizeImageWithModelApi(config, {
        data: Uint8Array.from([137, 80, 78, 71]),
        fileName: "shot.jpg",
        mimeType: "image/jpeg",
        instruction: "Describe this shot in Chinese.",
      }),
    ).resolves.toMatchObject({ text: "雨夜车站的中景镜头" })
    const visionRequest = fetchMock.mock.calls[1]?.[1]
    const visionBody = JSON.parse(String(visionRequest?.body)) as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>
    }
    expect(visionBody.messages[0]?.content[0]?.text).toBe(
      "Describe this shot in Chinese.",
    )
    await expect(createEmbeddingWithModelApi(config, "站名：北岸")).resolves.toEqual({
      embedding: [0.1, -0.2, 0.3],
      provider: "compatible-api",
      model: "model-1",
    })
  })

  it("returns stable errors without leaking provider responses or API keys", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("provider secret-model-key internal error", { status: 429 }),
      )
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockRejectedValueOnce(new Error("network secret-model-key"))
    vi.stubGlobal("fetch", fetchMock)

    for (const expected of [
      "向量生成 API 返回 HTTP 429",
      "向量生成 API 返回了无效 JSON",
      "向量生成 API 请求失败或超时",
    ]) {
      const failure = await createEmbeddingWithModelApi(config, "text").catch(
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toBe(expected)
      expect((failure as Error).message).not.toContain("secret-model-key")
    }
  })

  it("rejects malformed model responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ choices: [] }))
      .mockResolvedValueOnce(Response.json({ data: [{ embedding: [] }] }))
      .mockResolvedValueOnce(Response.json({ data: [{ embedding: [0, 0] }] }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      recognizeImageWithModelApi(config, {
        data: Uint8Array.from([1]),
        fileName: "frame.png",
        mimeType: "image/png",
      }),
    ).rejects.toThrow("图像识别 API 未返回有效文本")
    await expect(createEmbeddingWithModelApi(config, "text")).rejects.toThrow(
      "向量生成 API 返回了无效向量",
    )
    await expect(createEmbeddingWithModelApi(config, "text")).rejects.toThrow(
      "向量生成 API 返回了无效向量",
    )
  })
})
