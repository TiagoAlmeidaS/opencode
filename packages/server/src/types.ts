/**
 * OpenCode Server (daemon) types.
 * Pipeline context and interface aligned with Jarvis daemon for migration.
 */

export interface MemoryLlmOptions {
  prompt: string
  system?: string
  maxTokens?: number
}

export interface PipelineContext {
  pipelineId: string
  jobId: string
  config: Record<string, unknown>
  /** Directory/workspace path when running in OpenCode */
  directory?: string
  /** DB instance (optional; runner may pass it for pipelines that need it) */
  db?: import("./db").ServerDb
  /** Path to opencode.db for memory pipelines (sessions/messages). */
  opencodeDbPath?: string
  /** Optional LLM for memory extraction/consolidation (injected by host). */
  memoryLlm?: (opts: MemoryLlmOptions) => Promise<string>
  /** Optional embedding function for RAG (injected by host). */
  embed?: (text: string) => Promise<number[]>
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

export interface ActivityContext {
  queueItemId: string
  input: Record<string, unknown>
  db: import("./db").ServerDb
  spawnOpenCode: (task: string, cwd: string, timeoutMs?: number, onProgress?: (chunk: string) => Promise<void>) => Promise<import("./spawn").SpawnResult>
  enqueue: (type: string, input: unknown, opts?: { priority?: number; dependsOn?: string; relatedOpportunityId?: string }) => Promise<string>
  /** Atualiza o passo atual visível no card "Running" do Activity Queue. */
  updateProgress?: (step: string) => Promise<void>
  /** LLM injetado pelo host (ex: OpenCode provider). Disponível quando daemon é iniciado com memoryLlm. */
  memoryLlm?: (opts: MemoryLlmOptions) => Promise<string>
  /** Embedding function para RAG. */
  embed?: (text: string) => Promise<number[]>
}

export interface ActivityOutput {
  summary?: string
  extra?: Record<string, unknown>
}

export interface Activity {
  type: string
  displayName: string
  description: string
  execute(ctx: ActivityContext): Promise<ActivityOutput | void>
}

export interface DaemonPipelineRow {
  id: string
  name: string
  strategy: string
  configJson: string
  scheduleCron: string
  enabled: number
  maxRetries: number
  retryDelaySec: number
  maxRunsPerDay: number
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
