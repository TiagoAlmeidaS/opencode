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
import type { MemoryLlmOptions } from "./types"

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

// ── LLM via Anthropic API direta (pago) ──────────────────────────────────────
async function anthropicLlm(opts: MemoryLlmOptions): Promise<string> {
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
}

// ── LLM via OpenRouter (free tier: openrouter/free) ───────────────────────────
async function openRouterLlm(opts: MemoryLlmOptions): Promise<string> {
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
}

// ── LLM via Azure OpenAI (OpenAI-compatible endpoint) ─────────────────────────
async function azureLlm(opts: MemoryLlmOptions): Promise<string> {
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
}

// ── LLM via OpenAI (api.openai.com) ─────────────────────────────────────────
async function openaiLlm(opts: MemoryLlmOptions): Promise<string> {
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

// ── Inicializa servidor ───────────────────────────────────────────────────────
const instance = createOpenCodeServer({
  dbPath: DB_PATH,
  daemon: true,
  opencodeDbPath: OPENCODE_DB_PATH,
  memoryLlm,
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
