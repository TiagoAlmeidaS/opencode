/**
 * OpenCode Server — Standalone entry point para deploy em VPS/Docker.
 *
 * Variáveis de ambiente:
 *   PORT                    Porta HTTP (default: 3000)
 *   DB_PATH                 Caminho do SQLite (default: /data/server.db)
 *   OPENCODE_DB_PATH        Caminho do opencode.db para memory pipelines
 *   MEMORY_LLM_PROVIDER     anthropic | azure | openai | openrouter | heuristic (opcional; se não setada: anthropic > openrouter > heuristic)
 *   ANTHROPIC_API_KEY       API key Anthropic
 *   LLM_MODEL               Modelo Anthropic (default: claude-haiku-4-5-20251001)
 *   AZURE_OPENAI_API_KEY    API key Azure OpenAI
 *   AZURE_OPENAI_BASE_URL   Base URL (ex.: https://xxx.openai.azure.com)
 *   AZURE_OPENAI_DEPLOYMENT Nome do deployment
 *   AZURE_OPENAI_API_VERSION (default: 2024-06-01)
 *   OPENAI_API_KEY          API key OpenAI
 *   OPENAI_MODEL            Modelo OpenAI (default: gpt-4o-mini)
 *   OPENROUTER_API_KEY      API key OpenRouter
 *   OPENROUTER_MODEL        Modelo OpenRouter (default: openrouter/free)
 *   TELEGRAM_BOT_TOKEN      Token do bot Telegram
 *   TELEGRAM_CHAT_ID        Chat ID para relatórios
 *   SEED_DEFAULT_PIPELINES  false para desativar criação automática de pipelines (default: true)
 *   DASHBOARD_INJECT_TOKEN  false para não injetar API_TOKEN no dashboard (default: true quando API_TOKEN existe)
 *   QDRANT_URL              URL do Qdrant para RAG (opcional)
 *   API_TOKEN               Token de autenticação da API (opcional)
 *   CORS_ORIGIN             Origem permitida para CORS (default: *)
 */

import { Hono } from "hono"
import { cors } from "hono/cors"
import { bearerAuth } from "hono/bearer-auth"
import path from "path"
import { createOpenCodeServer } from "./index"
import { createAnthropicBackend, createOpenAIBackend, createOpenAICompatibleBackend, createLlmRouter, type LlmFn } from "./llm-router"
import type { MemoryLlmOptions, LlmRouter, TaskType } from "./types"

const PORT = parseInt(process.env.PORT ?? "3000")
const DB_PATH = process.env.DB_PATH ?? "/data/server.db"
const OPENCODE_DB_PATH = process.env.OPENCODE_DB_PATH ?? path.join(path.dirname(DB_PATH), "opencode.db")
const MEMORY_LLM_PROVIDER = process.env.MEMORY_LLM_PROVIDER?.toLowerCase().trim() || undefined
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const LLM_MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001"
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY
const AZURE_OPENAI_BASE_URL = process.env.AZURE_OPENAI_BASE_URL
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? "2024-06-01"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openrouter/free"
const QDRANT_URL = process.env.QDRANT_URL
const API_TOKEN = process.env.API_TOKEN
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*"

// ── LLM Routing (v2.0.0) ─────────────────────────────────────────────────────
// Cada TaskType pode ter seu próprio backend via env vars opcionais.
// Se não configurado, cai no memoryLlm padrão (zero degradação).
//
//   LLM_<TYPE>_PROVIDER   anthropic | openai | openai-compatible (auto quando BASE_URL presente)
//   LLM_<TYPE>_MODEL      model id (ex: claude-sonnet-4-5)
//   LLM_<TYPE>_API_KEY    opcional; herda a key do provider se omitido
//   LLM_<TYPE>_BASE_URL   ativa openai-compatible automaticamente (ex: KIMI, DeepSeek)
//
// Types: CODING | SPEC | ANALYSIS | MEMORY | DOCS
const LLM_ROUTING: Record<string, { provider?: string; model?: string; apiKey?: string; baseURL?: string }> = {}
for (const t of ["CODING", "SPEC", "ANALYSIS", "MEMORY", "DOCS"] as const) {
  const provider = process.env[`LLM_${t}_PROVIDER`]
  const model = process.env[`LLM_${t}_MODEL`]
  const apiKey = process.env[`LLM_${t}_API_KEY`]
  const baseURL = process.env[`LLM_${t}_BASE_URL`]
  if (provider || model || baseURL) {
    LLM_ROUTING[t.toLowerCase()] = { provider, model, apiKey, baseURL }
  }
}

const RETRY_CODES = new Set([429, 502, 503, 529])
const MAX_RETRIES = 3

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let delay = 2000
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const retryable = i < MAX_RETRIES && RETRY_CODES.has(parseStatus(msg))
      if (!retryable) throw err
      console.warn(`[${label}] retry ${i + 1}/${MAX_RETRIES} after ${delay}ms — ${msg.slice(0, 120)}`)
      await new Promise((r) => setTimeout(r, delay))
      delay *= 2
    }
  }
  throw new Error("unreachable")
}

function parseStatus(msg: string): number {
  const m = msg.match(/API (\d{3})/)
  return m ? parseInt(m[1], 10) : 0
}

// ── LLM via Anthropic API direta (pago) ──────────────────────────────────────
async function anthropicLlm(opts: MemoryLlmOptions): Promise<string> {
  return withRetry(async () => {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada")

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.system ?? "You are a helpful assistant.",
        messages: [{ role: "user", content: opts.prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic API ${res.status}: ${err.slice(0, 200)}`)
    }

    const data = (await res.json()) as { content: Array<{ type: string; text: string }> }
    return data.content.find((c) => c.type === "text")?.text ?? ""
  }, "Anthropic")
}

// ── LLM via OpenRouter (free tier: openrouter/free) ───────────────────────────
async function openRouterLlm(opts: MemoryLlmOptions): Promise<string> {
  return withRetry(async () => {
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY não configurada")

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://opencode.dev",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        messages: [
          ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
          { role: "user" as const, content: opts.prompt },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenRouter API ${res.status}: ${err.slice(0, 200)}`)
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    return typeof content === "string" ? content : ""
  }, "OpenRouter")
}

// ── LLM via Azure OpenAI (OpenAI-compatible endpoint) ─────────────────────────
async function azureLlm(opts: MemoryLlmOptions): Promise<string> {
  return withRetry(async () => {
    if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_BASE_URL || !AZURE_OPENAI_DEPLOYMENT) {
      throw new Error("AZURE_OPENAI_API_KEY, AZURE_OPENAI_BASE_URL e AZURE_OPENAI_DEPLOYMENT são obrigatórios")
    }
    const base = AZURE_OPENAI_BASE_URL.replace(/\/$/, "")
    const url = `${base}/openai/deployments/${encodeURIComponent(AZURE_OPENAI_DEPLOYMENT)}/chat/completions?api-version=${encodeURIComponent(AZURE_OPENAI_API_VERSION)}`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": AZURE_OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        max_tokens: opts.maxTokens ?? 1024,
        messages: [
          ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
          { role: "user" as const, content: opts.prompt },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Azure OpenAI API ${res.status}: ${err.slice(0, 200)}`)
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    return typeof content === "string" ? content : ""
  }, "Azure")
}

// ── LLM via OpenAI (api.openai.com) ─────────────────────────────────────────
async function openaiLlm(opts: MemoryLlmOptions): Promise<string> {
  return withRetry(async () => {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada")

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        messages: [
          ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
          { role: "user" as const, content: opts.prompt },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API ${res.status}: ${err.slice(0, 200)}`)
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    return typeof content === "string" ? content : ""
  }, "OpenAI")
}

// ── Resolução do memoryLlm por MEMORY_LLM_PROVIDER ou prioridade implícita ───
type MemoryLlmFn = (opts: MemoryLlmOptions) => Promise<string>
function resolveMemoryLlm(): { memoryLlm: MemoryLlmFn | undefined; label: string } {
  if (MEMORY_LLM_PROVIDER === "heuristic") {
    return { memoryLlm: undefined, label: "disabled (heurísticas only)" }
  }
  if (MEMORY_LLM_PROVIDER === "anthropic") {
    if (ANTHROPIC_API_KEY) return { memoryLlm: anthropicLlm, label: `Anthropic ${LLM_MODEL} (MEMORY_LLM_PROVIDER=anthropic)` }
    console.warn("[standalone] MEMORY_LLM_PROVIDER=anthropic mas ANTHROPIC_API_KEY não definida; usando heurísticas.")
    return { memoryLlm: undefined, label: "disabled (heurísticas only)" }
  }
  if (MEMORY_LLM_PROVIDER === "azure") {
    if (AZURE_OPENAI_API_KEY && AZURE_OPENAI_BASE_URL && AZURE_OPENAI_DEPLOYMENT) {
      return { memoryLlm: azureLlm, label: `Azure ${AZURE_OPENAI_BASE_URL.replace(/^https?:\/\//, "").split("/")[0]} / ${AZURE_OPENAI_DEPLOYMENT} (MEMORY_LLM_PROVIDER=azure)` }
    }
    console.warn("[standalone] MEMORY_LLM_PROVIDER=azure mas AZURE_OPENAI_* não configuradas; usando heurísticas.")
    return { memoryLlm: undefined, label: "disabled (heurísticas only)" }
  }
  if (MEMORY_LLM_PROVIDER === "openai") {
    if (OPENAI_API_KEY) return { memoryLlm: openaiLlm, label: `OpenAI ${OPENAI_MODEL} (MEMORY_LLM_PROVIDER=openai)` }
    console.warn("[standalone] MEMORY_LLM_PROVIDER=openai mas OPENAI_API_KEY não definida; usando heurísticas.")
    return { memoryLlm: undefined, label: "disabled (heurísticas only)" }
  }
  if (MEMORY_LLM_PROVIDER === "openrouter") {
    if (OPENROUTER_API_KEY) return { memoryLlm: openRouterLlm, label: `OpenRouter ${OPENROUTER_MODEL} (MEMORY_LLM_PROVIDER=openrouter)` }
    console.warn("[standalone] MEMORY_LLM_PROVIDER=openrouter mas OPENROUTER_API_KEY não definida; usando heurísticas.")
    return { memoryLlm: undefined, label: "disabled (heurísticas only)" }
  }
  // Fallback: prioridade Anthropic > OpenRouter > heurísticas
  if (ANTHROPIC_API_KEY) return { memoryLlm: anthropicLlm, label: `Anthropic ${LLM_MODEL}` }
  if (OPENROUTER_API_KEY) return { memoryLlm: openRouterLlm, label: `OpenRouter ${OPENROUTER_MODEL}` }
  return { memoryLlm: undefined, label: "disabled (heurísticas only)" }
}

const { memoryLlm, label: memoryLlmLabel } = resolveMemoryLlm()

// ── Constrói LlmRouter com backends por TaskType ──────────────────────────────
function buildBackendForType(
  taskKey: string,
  defaultFn: LlmFn,
): { fn: LlmFn; modelStr?: string } {
  const cfg = LLM_ROUTING[taskKey]
  if (!cfg) return { fn: defaultFn }

  const apiKey = cfg.apiKey
  const model = cfg.model
  const baseURL = cfg.baseURL

  // openai-compatible quando BASE_URL presente
  if (baseURL && model) {
    const key = apiKey ?? OPENAI_API_KEY ?? ""
    if (!key) {
      console.warn(`[llm-router] LLM_${taskKey.toUpperCase()}_BASE_URL definida mas nenhuma API key encontrada; usando default.`)
      return { fn: defaultFn }
    }
    return {
      fn: createOpenAICompatibleBackend({ apiKey: key, model, baseURL, withRetry }),
      modelStr: `openai-compatible/${model}`,
    }
  }

  const provider = cfg.provider ?? (ANTHROPIC_API_KEY ? "anthropic" : OPENAI_API_KEY ? "openai" : undefined)

  if (provider === "anthropic" && model) {
    const key = apiKey ?? ANTHROPIC_API_KEY
    if (!key) { console.warn(`[llm-router] anthropic key ausente para ${taskKey}; usando default.`); return { fn: defaultFn } }
    return {
      fn: createAnthropicBackend({ apiKey: key, model, withRetry }),
      modelStr: `anthropic/${model}`,
    }
  }

  if (provider === "openai" && model) {
    const key = apiKey ?? OPENAI_API_KEY
    if (!key) { console.warn(`[llm-router] openai key ausente para ${taskKey}; usando default.`); return { fn: defaultFn } }
    return {
      fn: createOpenAIBackend({ apiKey: key, model, withRetry }),
      modelStr: `openai/${model}`,
    }
  }

  return { fn: defaultFn }
}

function buildLlmRouter(defaultFn: LlmFn | undefined): { router: LlmRouter | undefined; routingLog: string[] } {
  if (!defaultFn) return { router: undefined, routingLog: [] }

  const taskTypes: TaskType[] = ["coding", "spec", "analysis", "memory", "docs"]
  const backends: Partial<Record<TaskType, LlmFn>> & { default: LlmFn } = { default: defaultFn }
  const modelMap: Partial<Record<TaskType, string>> = {}
  const routingLog: string[] = []

  for (const t of taskTypes) {
    const { fn, modelStr } = buildBackendForType(t, defaultFn)
    if (fn !== defaultFn) {
      backends[t] = fn
      if (modelStr) modelMap[t] = modelStr
      routingLog.push(`${t} → ${modelStr}`)
    }
  }

  return { router: createLlmRouter(backends, modelMap), routingLog }
}

const { router: llmRouter, routingLog } = buildLlmRouter(memoryLlm)

// ── Inicializa servidor ───────────────────────────────────────────────────────
const instance = createOpenCodeServer({
  dbPath: DB_PATH,
  daemon: true,
  opencodeDbPath: OPENCODE_DB_PATH,
  memoryLlm,
  llmRouter,
  qdrantUrl: QDRANT_URL,
})

// ── Hono app ──────────────────────────────────────────────────────────────────
const app = new Hono()

// CORS
app.use("*", cors({ origin: CORS_ORIGIN, allowMethods: ["GET", "POST", "DELETE", "PATCH"] }))

// Bearer auth opcional (só aplica às rotas /api)
if (API_TOKEN) {
  app.use("/api/*", bearerAuth({ token: API_TOKEN }))
}

// API routes
app.route("/api", instance.routes)

// Dashboard HTML — injeta API_TOKEN no localStorage quando DASHBOARD_INJECT_TOKEN=true
const dashboardPath = path.join(import.meta.dir, "../public/dashboard.html")
let dashboardHtml = await Bun.file(dashboardPath).text().catch(() => "<h1>Dashboard not found</h1>")
const injectToken = process.env.DASHBOARD_INJECT_TOKEN !== "false" && API_TOKEN
if (injectToken && API_TOKEN) {
  const script = `<script>try{localStorage.setItem("api_token",${JSON.stringify(API_TOKEN)})}catch(e){}</script>`
  dashboardHtml = dashboardHtml.replace("</head>", script + "\n</head>")
}

app.get("/", (c) => c.html(dashboardHtml))
app.get("/dashboard", (c) => c.html(dashboardHtml))

// Health
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }))

// ── Start ─────────────────────────────────────────────────────────────────────
instance.startDaemon()

const server = Bun.serve({ port: PORT, hostname: "0.0.0.0", fetch: app.fetch })

const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "") ?? null
const base = publicUrl ?? `http://0.0.0.0:${PORT}`

console.log(`\n🚀 OpenCode Server running at http://0.0.0.0:${PORT}`)
console.log(`   Dashboard:  ${base}/`)
console.log(`   API:        ${base}/api/`)
if (!publicUrl) console.log(`   (Para ver a URL pública no log, defina PUBLIC_URL no .env.server, ex: http://76.13.96.99:3000)`)
console.log(`   DB:         ${DB_PATH}`)
console.log(`   LLM:        ${memoryLlmLabel}`)
if (routingLog.length > 0) {
  console.log(`   LLM Routing:`)
  for (const entry of routingLog) console.log(`     • ${entry}`)
}
console.log(`   Auth:       ${API_TOKEN ? "Bearer token enabled" : "disabled"}`)
if (injectToken) console.log(`   Token:      injetado no dashboard`)
console.log(`   Qdrant:     ${QDRANT_URL ?? "disabled"}`)
console.log()

// Graceful shutdown
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`\n[${sig}] Shutting down...`)
    instance.stopDaemon()
    server.stop()
    process.exit(0)
  })
}
