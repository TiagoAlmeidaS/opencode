/**
 * Unit tests — llm-router.ts
 *
 * Testa o roteamento por TaskType, factories de backend e fallback para default.
 * Usa mock de globalThis.fetch para evitar chamadas HTTP reais.
 */
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import {
  createLlmRouter,
  createAnthropicBackend,
  createOpenAIBackend,
  createOpenAICompatibleBackend,
} from "./llm-router"
import type { TaskType } from "./types"

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFetch(responseBody: unknown, status = 200) {
  return mock(async (_url: string, _init: RequestInit) =>
    new Response(JSON.stringify(responseBody), { status }),
  )
}

function anthropicOk(text: string) {
  return { content: [{ type: "text", text }] }
}

function openaiOk(content: string) {
  return { choices: [{ message: { content } }] }
}

// ─── createLlmRouter ────────────────────────────────────────────────────────

describe("createLlmRouter", () => {
  describe("call()", () => {
    test("roteia para o backend correto quando TaskType está mapeado", async () => {
      const analysisFn = mock(async () => "analysis response")
      const defaultFn = mock(async () => "default response")

      const router = createLlmRouter({ analysis: analysisFn, default: defaultFn }, {})

      const result = await router.call("analysis", { prompt: "teste" })
      expect(result).toBe("analysis response")
      expect(analysisFn).toHaveBeenCalledTimes(1)
      expect(defaultFn).not.toHaveBeenCalled()
    })

    test("usa default quando TaskType não está mapeado", async () => {
      const defaultFn = mock(async () => "default response")

      const router = createLlmRouter({ default: defaultFn }, {})

      const result = await router.call("coding", { prompt: "teste" })
      expect(result).toBe("default response")
      expect(defaultFn).toHaveBeenCalledTimes(1)
    })

    test("passa opts corretamente para o backend", async () => {
      const fn = mock(async () => "ok")
      const router = createLlmRouter({ default: fn }, {})

      await router.call("memory", { prompt: "p", system: "s", maxTokens: 500 })

      expect(fn).toHaveBeenCalledWith({ prompt: "p", system: "s", maxTokens: 500 })
    })

    test("roteia todos os TaskTypes de forma independente", async () => {
      const coding = mock(async () => "coding")
      const spec = mock(async () => "spec")
      const analysis = mock(async () => "analysis")
      const memory = mock(async () => "memory")
      const docs = mock(async () => "docs")
      const defaultFn = mock(async () => "default")

      const router = createLlmRouter(
        { coding, spec, analysis, memory, docs, default: defaultFn },
        {},
      )

      for (const type of ["coding", "spec", "analysis", "memory", "docs"] as TaskType[]) {
        const result = await router.call(type, { prompt: "test" })
        expect(result).toBe(type)
      }
      expect(defaultFn).not.toHaveBeenCalled()
    })

    test("usa default para TaskType 'default' se não mapeado explicitamente", async () => {
      const defaultFn = mock(async () => "default")
      const router = createLlmRouter({ default: defaultFn }, {})

      const result = await router.call("default", { prompt: "test" })
      expect(result).toBe("default")
    })
  })

  describe("modelFor()", () => {
    test("retorna string 'provider/model' para TaskType mapeado", () => {
      const router = createLlmRouter(
        { default: async () => "" },
        {
          coding: "anthropic/claude-sonnet-4-5",
          analysis: "anthropic/claude-haiku-4-5",
        },
      )
      expect(router.modelFor("coding")).toBe("anthropic/claude-sonnet-4-5")
      expect(router.modelFor("analysis")).toBe("anthropic/claude-haiku-4-5")
    })

    test("retorna undefined para TaskType não mapeado", () => {
      const router = createLlmRouter({ default: async () => "" }, {})
      expect(router.modelFor("coding")).toBeUndefined()
      expect(router.modelFor("memory")).toBeUndefined()
    })

    test("retorna undefined para 'default' quando não está no modelMap", () => {
      const router = createLlmRouter(
        { default: async () => "" },
        { coding: "anthropic/claude-sonnet-4-5" },
      )
      expect(router.modelFor("default")).toBeUndefined()
    })

    test("retorna strings para todos os TaskTypes configurados", () => {
      const router = createLlmRouter(
        { default: async () => "" },
        {
          coding: "openai-compatible/moonshot-v1-128k",
          spec: "anthropic/claude-sonnet-4-5",
          analysis: "anthropic/claude-haiku-4-5",
          memory: "anthropic/claude-haiku-4-5",
          docs: "openai/gpt-4o-mini",
        },
      )
      expect(router.modelFor("coding")).toBe("openai-compatible/moonshot-v1-128k")
      expect(router.modelFor("spec")).toBe("anthropic/claude-sonnet-4-5")
      expect(router.modelFor("analysis")).toBe("anthropic/claude-haiku-4-5")
      expect(router.modelFor("memory")).toBe("anthropic/claude-haiku-4-5")
      expect(router.modelFor("docs")).toBe("openai/gpt-4o-mini")
    })
  })
})

// ─── createAnthropicBackend ─────────────────────────────────────────────────

describe("createAnthropicBackend", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("envia request para Anthropic com model e headers corretos", async () => {
    let capturedUrl = ""
    let capturedInit: RequestInit = {}

    globalThis.fetch = mock(async (url: string, init: RequestInit) => {
      capturedUrl = url
      capturedInit = init
      return new Response(JSON.stringify(anthropicOk("resposta")), { status: 200 })
    })

    const backend = createAnthropicBackend({ apiKey: "sk-ant-test", model: "claude-haiku-test" })
    const result = await backend({ prompt: "olá", system: "seja útil", maxTokens: 128 })

    expect(result).toBe("resposta")
    expect(capturedUrl).toBe("https://api.anthropic.com/v1/messages")

    const headers = capturedInit.headers as Record<string, string>
    expect(headers["x-api-key"]).toBe("sk-ant-test")
    expect(headers["anthropic-version"]).toBe("2023-06-01")

    const body = JSON.parse(capturedInit.body as string)
    expect(body.model).toBe("claude-haiku-test")
    expect(body.max_tokens).toBe(128)
    expect(body.system).toBe("seja útil")
    expect(body.messages).toEqual([{ role: "user", content: "olá" }])
  })

  test("usa maxTokens padrão 1024 quando não fornecido", async () => {
    let capturedBody: Record<string, unknown> = {}

    globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return new Response(JSON.stringify(anthropicOk("")), { status: 200 })
    })

    const backend = createAnthropicBackend({ apiKey: "key", model: "model" })
    await backend({ prompt: "test" })

    expect(capturedBody["max_tokens"]).toBe(1024)
  })

  test("lança erro com status na mensagem quando API retorna não-OK", async () => {
    globalThis.fetch = mock(async () =>
      new Response("rate limit exceeded", { status: 429 }),
    )

    const backend = createAnthropicBackend({ apiKey: "key", model: "model" })
    await expect(backend({ prompt: "test" })).rejects.toThrow("Anthropic API 429")
  })

  test("retorna string vazia quando content não contém item do tipo text", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ content: [{ type: "tool_use", id: "x" }] }), { status: 200 }),
    )

    const backend = createAnthropicBackend({ apiKey: "key", model: "model" })
    const result = await backend({ prompt: "test" })
    expect(result).toBe("")
  })

  test("chama withRetry quando fornecido", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(anthropicOk("ok")), { status: 200 }),
    )

    const retrySpy = mock(async (fn: () => Promise<string>) => fn())
    const backend = createAnthropicBackend({
      apiKey: "key",
      model: "model",
      withRetry: retrySpy as never,
    })

    await backend({ prompt: "test" })
    expect(retrySpy).toHaveBeenCalledTimes(1)
  })
})

// ─── createOpenAIBackend ────────────────────────────────────────────────────

describe("createOpenAIBackend", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  test("envia request para api.openai.com com Bearer token", async () => {
    let capturedUrl = ""
    let capturedHeaders: Record<string, string> = {}

    globalThis.fetch = mock(async (url: string, init: RequestInit) => {
      capturedUrl = url
      capturedHeaders = init.headers as Record<string, string>
      return new Response(JSON.stringify(openaiOk("resposta openai")), { status: 200 })
    })

    const backend = createOpenAIBackend({ apiKey: "sk-openai-key", model: "gpt-4o-mini" })
    const result = await backend({ prompt: "teste openai" })

    expect(result).toBe("resposta openai")
    expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions")
    expect(capturedHeaders["Authorization"]).toBe("Bearer sk-openai-key")
  })

  test("lança erro com status na mensagem quando API retorna não-OK", async () => {
    globalThis.fetch = mock(async () =>
      new Response("unauthorized", { status: 401 }),
    )

    const backend = createOpenAIBackend({ apiKey: "key", model: "model" })
    await expect(backend({ prompt: "test" })).rejects.toThrow("OpenAI API 401")
  })
})

// ─── createOpenAICompatibleBackend ──────────────────────────────────────────

describe("createOpenAICompatibleBackend", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  test("envia request para baseURL + /chat/completions", async () => {
    let capturedUrl = ""

    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify(openaiOk("ok")), { status: 200 })
    })

    const backend = createOpenAICompatibleBackend({
      apiKey: "key",
      model: "model-x",
      baseURL: "https://api.custom.ai/v1",
    })
    await backend({ prompt: "hello" })

    expect(capturedUrl).toBe("https://api.custom.ai/v1/chat/completions")
  })

  test("remove trailing slash da baseURL", async () => {
    let capturedUrl = ""

    globalThis.fetch = mock(async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify(openaiOk("")), { status: 200 })
    })

    const backend = createOpenAICompatibleBackend({
      apiKey: "key",
      model: "m",
      baseURL: "https://api.custom.ai/v1/", // trailing slash
    })
    await backend({ prompt: "test" })

    expect(capturedUrl).toBe("https://api.custom.ai/v1/chat/completions")
  })

  test("inclui system message quando fornecida", async () => {
    let capturedBody: { messages: Array<{ role: string; content: string }> } = { messages: [] }

    globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return new Response(JSON.stringify(openaiOk("")), { status: 200 })
    })

    const backend = createOpenAICompatibleBackend({
      apiKey: "key",
      model: "m",
      baseURL: "https://api.test.ai/v1",
    })
    await backend({ prompt: "user msg", system: "sys msg" })

    expect(capturedBody.messages).toHaveLength(2)
    expect(capturedBody.messages[0]).toEqual({ role: "system", content: "sys msg" })
    expect(capturedBody.messages[1]).toEqual({ role: "user", content: "user msg" })
  })

  test("omite system message quando não fornecida", async () => {
    let capturedBody: { messages: Array<{ role: string }> } = { messages: [] }

    globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return new Response(JSON.stringify(openaiOk("")), { status: 200 })
    })

    const backend = createOpenAICompatibleBackend({
      apiKey: "k",
      model: "m",
      baseURL: "https://x/v1",
    })
    await backend({ prompt: "hello" })

    expect(capturedBody.messages).toHaveLength(1)
    expect(capturedBody.messages[0].role).toBe("user")
  })

  test("usa Bearer token no header Authorization", async () => {
    let capturedHeaders: Record<string, string> = {}

    globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>
      return new Response(JSON.stringify(openaiOk("")), { status: 200 })
    })

    const backend = createOpenAICompatibleBackend({
      apiKey: "my-secret-key",
      model: "m",
      baseURL: "https://x/v1",
    })
    await backend({ prompt: "test" })

    expect(capturedHeaders["Authorization"]).toBe("Bearer my-secret-key")
  })

  test("lança erro com status na mensagem quando API retorna não-OK", async () => {
    globalThis.fetch = mock(async () =>
      new Response("forbidden", { status: 403 }),
    )

    const backend = createOpenAICompatibleBackend({ apiKey: "k", model: "m", baseURL: "https://x/v1" })
    await expect(backend({ prompt: "test" })).rejects.toThrow("API 403")
  })

  test("retorna string vazia quando choices está vazio", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    )

    const backend = createOpenAICompatibleBackend({ apiKey: "k", model: "m", baseURL: "https://x/v1" })
    const result = await backend({ prompt: "test" })
    expect(result).toBe("")
  })
})
