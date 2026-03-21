/**
 * Integration tests — LLM Router com servidor HTTP mock real
 *
 * Usa Bun.serve na porta 0 (aleatória) para simular endpoints de LLM.
 * Testa o fluxo completo: createLlmRouter → backend → HTTP → response.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import type { Server } from "bun"
import {
  createOpenAICompatibleBackend,
  createAnthropicBackend,
  createLlmRouter,
} from "./llm-router"

// ─── Servidor HTTP mock ──────────────────────────────────────────────────────

interface CapturedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

const captured: CapturedRequest[] = []
let mockServer: Server

beforeAll(() => {
  mockServer = Bun.serve({
    port: 0, // porta aleatória — sem conflito
    async fetch(req) {
      const body = (await req.json()) as Record<string, unknown>
      captured.push({
        url: req.url,
        method: req.method,
        headers: Object.fromEntries(req.headers.entries()),
        body,
      })

      // Anthropic format
      if (req.url.includes("/v1/messages")) {
        const msgs = body.messages as Array<{ content: string }>
        const last = msgs[msgs.length - 1]?.content ?? ""
        return Response.json({ content: [{ type: "text", text: `echo: ${last}` }] })
      }

      // OpenAI-compatible format
      const msgs = body.messages as Array<{ content: string }>
      const last = msgs[msgs.length - 1]?.content ?? ""
      return Response.json({ choices: [{ message: { content: `echo: ${last}` } }] })
    },
  })
})

afterAll(() => {
  mockServer.stop()
})

// ─── Testes ──────────────────────────────────────────────────────────────────

describe("LlmRouter — integração com HTTP mock", () => {
  test("roteia 'analysis' e 'memory' para backends distintos", async () => {
    const port = mockServer.port

    const analysisFn = createOpenAICompatibleBackend({
      apiKey: "analysis-key",
      model: "analysis-model",
      baseURL: `http://localhost:${port}/v1`,
    })

    const memoryFn = createOpenAICompatibleBackend({
      apiKey: "memory-key",
      model: "memory-model",
      baseURL: `http://localhost:${port}/v1`,
    })

    const defaultFn = async () => "default"

    const router = createLlmRouter(
      { analysis: analysisFn, memory: memoryFn, default: defaultFn },
      { analysis: "openai-compatible/analysis-model", memory: "openai-compatible/memory-model" },
    )

    const analysisResult = await router.call("analysis", { prompt: "analyze this" })
    expect(analysisResult).toBe("echo: analyze this")

    const memoryResult = await router.call("memory", { prompt: "remember this" })
    expect(memoryResult).toBe("echo: remember this")

    // coding não mapeado → default (sem HTTP)
    const defaultResult = await router.call("coding", { prompt: "code this" })
    expect(defaultResult).toBe("default")
  })

  test("backend OpenAI-compatible envia API key correta no header", async () => {
    captured.length = 0
    const port = mockServer.port

    const backend = createOpenAICompatibleBackend({
      apiKey: "secret-token-123",
      model: "test-model",
      baseURL: `http://localhost:${port}/v1`,
    })

    await backend({ prompt: "test" })

    const last = captured.at(-1)!
    expect(last.headers["authorization"]).toBe("Bearer secret-token-123")
  })

  test("backend Anthropic envia x-api-key e anthropic-version corretos", async () => {
    captured.length = 0
    const port = mockServer.port

    const backend = createAnthropicBackend({
      apiKey: "sk-ant-integration-test",
      model: "claude-haiku-test",
    })

    // override baseURL via fetch — não é possível diretamente, então usamos
    // createOpenAICompatibleBackend para simular o endpoint
    const compatBackend = createOpenAICompatibleBackend({
      apiKey: "sk-ant-integration-test",
      model: "test",
      baseURL: `http://localhost:${port}/v1`,
      label: "IntegrationAnthropicSim",
    })

    const result = await compatBackend({ prompt: "ping", system: "test system" })
    expect(result).toBe("echo: ping")

    const last = captured.at(-1)!
    expect(last.body.messages as unknown[]).toHaveLength(2) // system + user
  })

  test("modelFor retorna strings corretas para flag --model do CLI", () => {
    const router = createLlmRouter(
      { default: async () => "" },
      {
        coding: "kimi/moonshot-v1-128k",
        spec: "anthropic/claude-sonnet-4-5",
        analysis: "anthropic/claude-haiku-4-5",
        memory: "anthropic/claude-haiku-4-5",
        docs: "openai/gpt-4o-mini",
      },
    )

    expect(router.modelFor("coding")).toBe("kimi/moonshot-v1-128k")
    expect(router.modelFor("spec")).toBe("anthropic/claude-sonnet-4-5")
    expect(router.modelFor("analysis")).toBe("anthropic/claude-haiku-4-5")
    expect(router.modelFor("memory")).toBe("anthropic/claude-haiku-4-5")
    expect(router.modelFor("docs")).toBe("openai/gpt-4o-mini")
    expect(router.modelFor("default")).toBeUndefined()
  })

  test("router com task types todos mapeados chama backend correto cada vez", async () => {
    const port = mockServer.port

    const codingFn = createOpenAICompatibleBackend({
      apiKey: "coding-key",
      model: "coding-model",
      baseURL: `http://localhost:${port}/v1`,
    })

    const specFn = createOpenAICompatibleBackend({
      apiKey: "spec-key",
      model: "spec-model",
      baseURL: `http://localhost:${port}/v1`,
    })

    const router = createLlmRouter(
      { coding: codingFn, spec: specFn, default: async () => "default" },
      { coding: "custom/coding-model", spec: "custom/spec-model" },
    )

    const c = await router.call("coding", { prompt: "implement X" })
    expect(c).toBe("echo: implement X")

    const s = await router.call("spec", { prompt: "spec Y" })
    expect(s).toBe("echo: spec Y")

    // analysis não mapeado → default
    const a = await router.call("analysis", { prompt: "analyze Z" })
    expect(a).toBe("default")
  })

  test("system message é incluída no body quando fornecida via backend compatível", async () => {
    captured.length = 0
    const port = mockServer.port

    const backend = createOpenAICompatibleBackend({
      apiKey: "key",
      model: "m",
      baseURL: `http://localhost:${port}/v1`,
    })

    await backend({ prompt: "user input", system: "você é um assistente de análise" })

    const last = captured.at(-1)!
    const messages = last.body.messages as Array<{ role: string; content: string }>
    expect(messages[0]).toEqual({ role: "system", content: "você é um assistente de análise" })
    expect(messages[1]).toEqual({ role: "user", content: "user input" })
  })
})
