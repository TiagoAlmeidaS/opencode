/**
 * OpenCode Server — Standalone entry point para deploy em VPS/Docker.
 *
 * Variáveis de ambiente:
 *   PORT                  Porta HTTP (default: 3000)
 *   DB_PATH               Caminho do SQLite (default: /data/server.db)
 *   OPENCODE_DB_PATH      Caminho do opencode.db para memory pipelines
 *   ANTHROPIC_API_KEY     API key Anthropic (pago). Se setada, usa para memory LLM.
 *   LLM_MODEL             Modelo Anthropic (default: claude-haiku-4-5-20251001)
 *   OPENROUTER_API_KEY    API key OpenRouter. Se setada (e sem Anthropic), usa LLM free para memory.
 *   OPENROUTER_MODEL      Modelo OpenRouter (default: openrouter/free = gratis)
 *   TELEGRAM_BOT_TOKEN    Token do bot Telegram
 *   TELEGRAM_CHAT_ID      Chat ID para relatórios
 *   QDRANT_URL            URL do Qdrant para RAG (opcional)
 *   API_TOKEN             Token de autenticação da API (opcional)
 *   CORS_ORIGIN           Origem permitida para CORS (default: *)
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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const LLM_MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001"
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

// Prioridade: Anthropic (pago) > OpenRouter (free) > nenhum (somente heurísticas)
const memoryLlm = ANTHROPIC_API_KEY ? anthropicLlm : OPENROUTER_API_KEY ? openRouterLlm : undefined

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

// Dashboard HTML
const dashboardPath = path.join(import.meta.dir, "../public/dashboard.html")
const dashboardHtml = await Bun.file(dashboardPath).text().catch(() => "<h1>Dashboard not found</h1>")

app.get("/", (c) => c.html(dashboardHtml))
app.get("/dashboard", (c) => c.html(dashboardHtml))

// Health
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }))

// ── Start ─────────────────────────────────────────────────────────────────────
instance.startDaemon()

const server = Bun.serve({ port: PORT, hostname: "0.0.0.0", fetch: app.fetch })

console.log(`\n🚀 OpenCode Server running at http://0.0.0.0:${PORT}`)
console.log(`   Dashboard:  http://0.0.0.0:${PORT}/`)
console.log(`   API:        http://0.0.0.0:${PORT}/api/`)
console.log(`   DB:         ${DB_PATH}`)
console.log(
  `   LLM:        ${ANTHROPIC_API_KEY ? `Anthropic ${LLM_MODEL}` : OPENROUTER_API_KEY ? `OpenRouter ${OPENROUTER_MODEL} (free)` : "disabled (heurísticas only)"}`
)
console.log(`   Auth:       ${API_TOKEN ? "Bearer token enabled" : "disabled"}`)
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
