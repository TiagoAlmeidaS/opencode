/**
 * LLM Router — roteamento de LLM por tipo de tarefa (v2.0.0+).
 *
 * Permite mapear TaskTypes (coding, spec, analysis, memory, docs) para
 * backends LLM distintos, otimizando custo/qualidade por operação.
 *
 * Uso:
 *   const router = createLlmRouter(
 *     { coding: myStrongModel, analysis: myCheapModel, default: myDefaultModel },
 *     { coding: "anthropic/claude-sonnet-4-5" }
 *   )
 *   await router.call("analysis", { prompt: "...", maxTokens: 512 })
 *   const model = router.modelFor("coding") // "anthropic/claude-sonnet-4-5"
 */

import type { MemoryLlmOptions, LlmRouter, TaskType } from "./types"

export type LlmFn = (opts: MemoryLlmOptions) => Promise<string>

/** Cria um backend Anthropic com modelo e chave configuráveis. */
export function createAnthropicBackend(opts: {
  apiKey: string
  model: string
  withRetry?: (fn: () => Promise<string>, label: string) => Promise<string>
}): LlmFn {
  const retry = opts.withRetry ?? ((fn) => fn())
  return (callOpts) =>
    retry(async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: callOpts.maxTokens ?? 1024,
          system: callOpts.system ?? "You are a helpful assistant.",
          messages: [{ role: "user", content: callOpts.prompt }],
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Anthropic API ${res.status}: ${err.slice(0, 200)}`)
      }
      const data = (await res.json()) as { content: Array<{ type: string; text: string }> }
      return data.content.find((c) => c.type === "text")?.text ?? ""
    }, `Anthropic/${opts.model}`)
}

/** Cria um backend OpenAI (api.openai.com) com modelo configurável. */
export function createOpenAIBackend(opts: {
  apiKey: string
  model: string
  withRetry?: (fn: () => Promise<string>, label: string) => Promise<string>
}): LlmFn {
  const retry = opts.withRetry ?? ((fn) => fn())
  return (callOpts) =>
    retry(async () => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: callOpts.maxTokens ?? 1024,
          messages: [
            ...(callOpts.system ? [{ role: "system" as const, content: callOpts.system }] : []),
            { role: "user" as const, content: callOpts.prompt },
          ],
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`OpenAI API ${res.status}: ${err.slice(0, 200)}`)
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      return data.choices?.[0]?.message?.content ?? ""
    }, `OpenAI/${opts.model}`)
}

/**
 * Cria um backend para qualquer API OpenAI-compatible (KIMI, DeepSeek, etc.).
 * Basta fornecer baseURL + apiKey + model.
 */
export function createOpenAICompatibleBackend(opts: {
  apiKey: string
  model: string
  baseURL: string
  label?: string
  withRetry?: (fn: () => Promise<string>, label: string) => Promise<string>
}): LlmFn {
  const retry = opts.withRetry ?? ((fn) => fn())
  const base = opts.baseURL.replace(/\/$/, "")
  const label = opts.label ?? base.replace(/^https?:\/\//, "").split("/")[0]
  return (callOpts) =>
    retry(async () => {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: callOpts.maxTokens ?? 1024,
          messages: [
            ...(callOpts.system ? [{ role: "system" as const, content: callOpts.system }] : []),
            { role: "user" as const, content: callOpts.prompt },
          ],
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`${label} API ${res.status}: ${err.slice(0, 200)}`)
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      return data.choices?.[0]?.message?.content ?? ""
    }, `${label}/${opts.model}`)
}

/**
 * Cria o LlmRouter a partir de um mapa de backends por TaskType.
 *
 * @param backends - mapa de TaskType → LlmFn. "default" é obrigatório e usado como fallback.
 * @param modelMap - mapa de TaskType → "provider/model" para gerar a flag --model no CLI.
 */
export function createLlmRouter(
  backends: Partial<Record<TaskType, LlmFn>> & { default: LlmFn },
  modelMap: Partial<Record<TaskType, string>> = {},
): LlmRouter {
  return {
    call(taskType, opts) {
      const fn = backends[taskType] ?? backends.default
      return fn(opts)
    },
    modelFor(taskType) {
      return modelMap[taskType]
    },
  }
}
