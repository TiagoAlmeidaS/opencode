/**
 * SEO Blog pipeline (stub).
 * Full flow: sources -> LLM article -> format -> publish to WordPress/Ghost -> record.
 * This stub records a placeholder; wire OpenCode provider for real generation.
 */
import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"

export interface SeoBlogConfig {
  llm?: { provider?: string; model?: string }
  seo?: {
    niche?: string
    target_audience?: string
    language?: string
    tone?: string
    min_word_count?: number
    max_word_count?: number
  }
  publisher?: {
    platform?: string
    base_url?: string
    username?: string
    password?: string
    default_status?: string
  }
}

const seoBlog: Pipeline = {
  strategy: "seo_blog",
  displayName: "SEO Blog",
  async execute(ctx) {
    const config = ctx.config as SeoBlogConfig
    const niche = config?.seo?.niche ?? "Technology"
    const platform = config?.publisher?.platform ?? "local"
    return {
      contentType: "article",
      platform: platform as "local" | "wordpress" | "ghost",
      title: `[Stub] SEO article: ${niche} — ${ctx.jobId}`,
      status: config?.publisher?.default_status ?? "draft",
      wordCount: config?.seo?.min_word_count ?? 800,
    }
  },
}

registerPipeline(seoBlog)
