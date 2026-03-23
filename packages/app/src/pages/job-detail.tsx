import { createResource, createSignal, For, Show, onCleanup } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { useServer } from "@/context/server"

// ── Types ──────────────────────────────────────────────────────────────────

interface RepoIssueJobDetail {
  id: string
  repoFullName: string
  issueNumber: number | null
  issueTitle: string
  issueBody: string | null
  status: string
  specJson: string | null
  testFiles: string | null
  docsMarkdown: string | null
  branchName: string | null
  forkRepoFullName: string | null
  prUrl: string | null
  prNumber: number | null
  session_id: string | null
  cli_output: string | null
  retry_count: number
  opportunityId: string | null
  createdAt: number
  updatedAt: number
}

interface StepItem {
  id: string
  activityType: string
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  priority: number
  errorMessage: string | null
  outputJson: string | null
  startedAt: number | null
  completedAt: number | null
  durationMs: number | null
  createdAt: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:      "text-text-warning border-border-warning-base bg-surface-warning-base",
  spec:         "text-text-info border-border-info-base bg-surface-info-base",
  tests:        "text-text-info border-border-info-base bg-surface-info-base",
  implementing: "text-text-info border-border-info-base bg-surface-info-base",
  docs:         "text-text-info border-border-info-base bg-surface-info-base",
  "pr-open":    "text-text-info border-border-info-base bg-surface-info-base",
  completed:    "text-text-success border-border-success-base bg-surface-success-base",
  failed:       "text-text-critical border-border-critical-base bg-surface-critical-base",
  skipped:      "text-text-weak border-border-base bg-surface-base",
}

const STEP_STATUS_COLORS: Record<string, string> = {
  pending:   "text-text-warning",
  running:   "text-text-info",
  completed: "text-text-success",
  failed:    "text-text-critical",
  cancelled: "text-text-weak",
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function formatTs(ts: number | null): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toLocaleString()
}

// ── Component ────────────────────────────────────────────────────────────────

export default function JobDetail() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const server = useServer()

  const apiBase = () => {
    const url = server.current?.http.url ?? ""
    return url.replace(/\/$/, "") + "/server"
  }

  const [tick, setTick] = createSignal(0)
  const interval = setInterval(() => setTick((n) => n + 1), 15_000)
  onCleanup(() => clearInterval(interval))

  const [section, setSection] = createSignal<"overview" | "steps" | "spec" | "cli" | "docs">("overview")

  const [job, { refetch: refetchJob }] = createResource(
    () => [params.id, tick()] as const,
    async ([id]) => {
      const res = await fetch(`${apiBase()}/repo-issue-jobs/${id}`)
      if (!res.ok) return null
      return (await res.json()) as RepoIssueJobDetail
    },
  )

  const [steps, { refetch: refetchSteps }] = createResource(
    () => [params.id, tick()] as const,
    async ([id]) => {
      const res = await fetch(`${apiBase()}/repo-issue-jobs/${id}/steps`)
      if (!res.ok) return [] as StepItem[]
      return (await res.json()) as StepItem[]
    },
  )

  async function handleRetry() {
    const confirmed = confirm("Re-enfileirar o job do início?")
    if (!confirmed) return
    await fetch(`${apiBase()}/repo-issue-jobs/${params.id}/retry`, { method: "POST" })
    refetchJob()
    refetchSteps()
  }

  async function handleCancel() {
    const confirmed = confirm("Cancelar e marcar como falho?")
    if (!confirmed) return
    await fetch(`${apiBase()}/repo-issue-jobs/${params.id}/cancel`, { method: "POST" })
    refetchJob()
    refetchSteps()
  }

  const sections = [
    { key: "overview", label: "Overview" },
    { key: "steps",    label: "Steps" },
    { key: "spec",     label: "Spec" },
    { key: "cli",      label: "CLI Output" },
    { key: "docs",     label: "Docs" },
  ] as const

  return (
    <div class="flex flex-col h-full overflow-hidden bg-background-base">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div class="flex items-start gap-4 px-6 py-4 border-b border-border-base shrink-0">
        <button
          onClick={() => navigate("/board")}
          class="mt-0.5 text-text-weak hover:text-text-base text-12-regular shrink-0"
        >
          ← Board
        </button>
        <div class="flex-1 min-w-0">
          <Show when={job()} fallback={<p class="text-13-regular text-text-weak">Carregando…</p>}>
            {(j) => (
              <>
                <div class="flex items-center gap-3 flex-wrap">
                  <span
                    class={`px-2 py-0.5 rounded border text-11-medium shrink-0 ${STATUS_COLORS[j().status] ?? "text-text-weak border-border-base"}`}
                  >
                    {j().status}
                  </span>
                  <h1 class="text-15-medium text-text-strong truncate">
                    <Show when={j().issueNumber != null}>
                      <span class="text-text-weak mr-2">#{j().issueNumber}</span>
                    </Show>
                    {j().issueTitle}
                  </h1>
                </div>
                <p class="text-11-regular text-text-weak mt-1 font-mono">{j().repoFullName}</p>
              </>
            )}
          </Show>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={job()?.prUrl}>
            <a
              href={job()!.prUrl!}
              target="_blank"
              rel="noopener noreferrer"
              class="px-3 py-1.5 rounded-md bg-surface-raised-base border border-border-base text-12-medium text-text-info hover:underline"
            >
              Ver PR #{job()!.prNumber}
            </a>
          </Show>
          <button
            onClick={handleRetry}
            class="px-3 py-1.5 rounded-md bg-surface-raised-base border border-border-base text-12-medium text-text-base hover:bg-surface-hover-base"
          >
            Retry
          </button>
          <button
            onClick={handleCancel}
            class="px-3 py-1.5 rounded-md bg-surface-raised-base border border-border-base text-12-medium text-text-critical hover:bg-surface-critical-base"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div class="flex gap-1 px-6 pt-3 border-b border-border-base shrink-0">
        <For each={sections}>
          {(s) => (
            <button
              onClick={() => setSection(s.key)}
              class={`px-3 py-1.5 text-12-medium rounded-t-md border border-b-0 transition-colors ${
                section() === s.key
                  ? "border-border-base bg-background-base text-text-strong"
                  : "border-transparent text-text-weak hover:text-text-base"
              }`}
            >
              {s.label}
            </button>
          )}
        </For>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div class="flex-1 overflow-y-auto p-6">

        {/* Overview */}
        <Show when={section() === "overview" && job()}>
          {(j) => (
            <div class="space-y-4 max-w-3xl">
              <div class="grid grid-cols-2 gap-3 text-12-regular">
                <div class="rounded-lg border border-border-base bg-surface-base p-3">
                  <p class="text-10-regular text-text-weak mb-1">Status</p>
                  <p class={`text-13-medium ${STATUS_COLORS[j().status] ?? ""}`}>{j().status}</p>
                </div>
                <div class="rounded-lg border border-border-base bg-surface-base p-3">
                  <p class="text-10-regular text-text-weak mb-1">Retries</p>
                  <p class="text-13-medium text-text-strong">{j().retry_count}</p>
                </div>
                <div class="rounded-lg border border-border-base bg-surface-base p-3">
                  <p class="text-10-regular text-text-weak mb-1">Criado em</p>
                  <p class="text-12-regular text-text-base">{formatTs(j().createdAt)}</p>
                </div>
                <div class="rounded-lg border border-border-base bg-surface-base p-3">
                  <p class="text-10-regular text-text-weak mb-1">Atualizado em</p>
                  <p class="text-12-regular text-text-base">{formatTs(j().updatedAt)}</p>
                </div>
                <Show when={j().branchName}>
                  <div class="rounded-lg border border-border-base bg-surface-base p-3 col-span-2">
                    <p class="text-10-regular text-text-weak mb-1">Branch</p>
                    <p class="text-12-regular font-mono text-text-base">{j().branchName}</p>
                  </div>
                </Show>
                <Show when={j().forkRepoFullName}>
                  <div class="rounded-lg border border-border-base bg-surface-base p-3 col-span-2">
                    <p class="text-10-regular text-text-weak mb-1">Fork</p>
                    <p class="text-12-regular font-mono text-text-base">{j().forkRepoFullName}</p>
                  </div>
                </Show>
              </div>
              <Show when={j().issueBody}>
                <div class="rounded-lg border border-border-base bg-surface-base p-4">
                  <p class="text-11-medium text-text-weak mb-2">Issue Body</p>
                  <pre class="text-12-regular text-text-base whitespace-pre-wrap font-sans">{j().issueBody}</pre>
                </div>
              </Show>
            </div>
          )}
        </Show>

        {/* Steps */}
        <Show when={section() === "steps"}>
          <div class="space-y-2 max-w-3xl">
            <Show when={(steps() ?? []).length === 0 && !steps.loading}>
              <p class="text-12-regular text-text-weak">Nenhum step encontrado.</p>
            </Show>
            <For each={steps() ?? []}>
              {(step) => (
                <div class="rounded-lg border border-border-base bg-surface-base p-4">
                  <div class="flex items-center gap-3 flex-wrap">
                    <span class={`text-11-medium font-mono ${STEP_STATUS_COLORS[step.status] ?? "text-text-weak"}`}>
                      {step.status}
                    </span>
                    <span class="text-13-medium text-text-strong font-mono">{step.activityType}</span>
                    <span class="text-11-regular text-text-weak ml-auto">{formatDuration(step.durationMs)}</span>
                  </div>
                  <div class="flex gap-4 mt-1 text-11-regular text-text-weak">
                    <Show when={step.startedAt}>
                      <span>Iniciou: {formatTs(step.startedAt)}</span>
                    </Show>
                    <Show when={step.completedAt}>
                      <span>Terminou: {formatTs(step.completedAt)}</span>
                    </Show>
                  </div>
                  <Show when={step.errorMessage}>
                    <div class="mt-2 rounded bg-surface-critical-base border border-border-critical-base p-2">
                      <p class="text-11-medium text-text-critical mb-1">Erro</p>
                      <pre class="text-11-regular text-text-critical whitespace-pre-wrap font-mono">{step.errorMessage}</pre>
                    </div>
                  </Show>
                  <Show when={step.outputJson && step.outputJson !== "null"}>
                    <div class="mt-2 rounded bg-surface-base border border-border-base p-2">
                      <p class="text-11-medium text-text-weak mb-1">Output</p>
                      <pre class="text-11-regular text-text-base font-mono whitespace-pre-wrap">
                        {(() => {
                          try { return JSON.stringify(JSON.parse(step.outputJson!), null, 2) }
                          catch { return step.outputJson }
                        })()}
                      </pre>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Spec */}
        <Show when={section() === "spec"}>
          <div class="max-w-3xl">
            <Show
              when={job()?.specJson}
              fallback={<p class="text-12-regular text-text-weak">Spec não gerada ainda.</p>}
            >
              <pre class="text-12-regular font-mono text-text-base whitespace-pre-wrap bg-surface-base border border-border-base rounded-lg p-4 overflow-x-auto">
                {(() => {
                  try { return JSON.stringify(JSON.parse(job()!.specJson!), null, 2) }
                  catch { return job()!.specJson }
                })()}
              </pre>
            </Show>
          </div>
        </Show>

        {/* CLI Output */}
        <Show when={section() === "cli"}>
          <div class="max-w-4xl space-y-3">
            <Show when={job()?.session_id}>
              <div class="text-11-regular text-text-weak">
                Session ID: <span class="font-mono text-text-base">{job()!.session_id}</span>
              </div>
            </Show>
            <Show
              when={job()?.cli_output}
              fallback={<p class="text-12-regular text-text-weak">CLI output não disponível.</p>}
            >
              <pre class="text-11-regular font-mono text-text-base whitespace-pre-wrap bg-surface-base border border-border-base rounded-lg p-4 overflow-x-auto max-h-[70vh]">
                {job()!.cli_output}
              </pre>
            </Show>
          </div>
        </Show>

        {/* Docs */}
        <Show when={section() === "docs"}>
          <div class="max-w-3xl">
            <Show
              when={job()?.docsMarkdown}
              fallback={<p class="text-12-regular text-text-weak">Documentação não gerada ainda.</p>}
            >
              <pre class="text-12-regular font-sans text-text-base whitespace-pre-wrap bg-surface-base border border-border-base rounded-lg p-4 overflow-x-auto">
                {job()!.docsMarkdown}
              </pre>
            </Show>
          </div>
        </Show>

      </div>
    </div>
  )
}
