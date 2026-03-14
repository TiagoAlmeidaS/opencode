/**
 * OpenCode Server (daemon) types.
 * Pipeline context and interface aligned with Jarvis daemon for migration.
 */

export interface PipelineContext {
  pipelineId: string
  jobId: string
  config: Record<string, unknown>
  /** Directory/workspace path when running in OpenCode */
  directory?: string
  /** DB instance (optional; runner may pass it for pipelines that need it) */
  db?: import("./db").ServerDb
}

export interface ContentOutput {
  contentId?: string
  contentType?: string
  platform?: string
  title?: string
  slug?: string
  url?: string
  status?: string
  wordCount?: number
  llmModel?: string
  llmTokensUsed?: number
  llmCostUsd?: number
  /** Extra JSON for pipeline-specific data */
  extra?: Record<string, unknown>
}

export interface Pipeline {
  strategy: string
  displayName: string
  validateConfig?(config: unknown): Promise<void>
  execute(ctx: PipelineContext): Promise<ContentOutput | void>
}

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface DaemonPipelineRow {
  id: string
  name: string
  strategy: string
  configJson: string
  scheduleCron: string
  enabled: number
  maxRetries: number
  retryDelaySec: number
  createdAt: number
  updatedAt: number
}

export interface DaemonJobRow {
  id: string
  pipelineId: string
  status: string
  attempt: number
  startedAt: number | null
  completedAt: number | null
  inputJson: string | null
  outputJson: string | null
  errorMessage: string | null
  errorStack: string | null
  durationMs: number | null
  createdAt: number
}
