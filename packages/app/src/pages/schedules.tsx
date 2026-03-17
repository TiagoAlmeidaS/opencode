import {
  createResource,
  createSignal,
  For,
  Show,
  onCleanup,
} from "solid-js"
import { useServer } from "@/context/server"
import { useLanguage } from "@/context/language"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pipeline {
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

interface Job {
  id: string
  pipelineId: string
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  attempt: number
  startedAt: number | null
  completedAt: number | null
  outputJson: string | null
  errorMessage: string | null
  durationMs: number | null
  createdAt: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cronLabel(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [min, hour, , , dow] = parts
  if (min === "0" && hour === "*") return "Every hour"
  if (min !== "*" && hour !== "*" && dow === "*") {
    const h = parseInt(hour)
    const period = h >= 12 ? "PM" : "AM"
    const hDisplay = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `Daily at ${hDisplay}:${parseInt(min).toString().padStart(2, "0")} ${period}`
  }
  if (min !== "*" && hour !== "*" && dow !== "*") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const h = parseInt(hour)
    const period = h >= 12 ? "PM" : "AM"
    const hDisplay = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${days[parseInt(dow)] ?? dow} at ${hDisplay}:${parseInt(min).toString().padStart(2, "0")} ${period}`
  }
  return cron
}

function elapsedMs(ms: number | null): string {
  if (!ms) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString()
}

const JOB_STATUS_COLORS: Record<string, string> = {
  pending: "text-text-warning",
  running: "text-text-info",
  completed: "text-text-success",
  failed: "text-text-critical",
  cancelled: "text-text-weak",
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Schedules() {
  const server = useServer()
  const language = useLanguage()

  const apiBase = () => {
    const url = server.current?.http.url ?? ""
    return url.replace(/\/$/, "") + "/server"
  }

  const [tick, setTick] = createSignal(0)
  const refresh = () => setTick((n) => n + 1)
  const interval = setInterval(refresh, 30_000)
  onCleanup(() => clearInterval(interval))

  // ── Data ──────────────────────────────────────────────────────────────────

  const [pipelines] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/pipelines`)
    if (!res.ok) return [] as Pipeline[]
    return (await res.json()) as Pipeline[]
  })

  const [strategies] = createResource(async () => {
    const res = await fetch(`${apiBase()}/pipelines/strategies`)
    if (!res.ok) return [] as string[]
    const data = await res.json()
    return (Array.isArray(data) ? data : Object.keys(data)) as string[]
  })

  // ── Expanded jobs per pipeline ─────────────────────────────────────────────

  const [expandedId, setExpandedId] = createSignal<string | null>(null)

  const [jobs] = createResource(expandedId, async (id) => {
    if (!id) return [] as Job[]
    const res = await fetch(`${apiBase()}/jobs?pipeline_id=${id}`)
    if (!res.ok) return [] as Job[]
    return (await res.json()) as Job[]
  })

  // ── Actions ───────────────────────────────────────────────────────────────

  const [runningId, setRunningId] = createSignal<string | null>(null)

  async function togglePipeline(pipeline: Pipeline) {
    const action = pipeline.enabled ? "disable" : "enable"
    await fetch(`${apiBase()}/pipelines/${pipeline.id}/${action}`, { method: "POST" })
    refresh()
  }

  async function runNow(id: string) {
    setRunningId(id)
    try {
      await fetch(`${apiBase()}/pipelines/${id}/run`, { method: "POST" })
      refresh()
    } finally {
      setRunningId(null)
    }
  }

  // ── Create form ───────────────────────────────────────────────────────────

  const [showForm, setShowForm] = createSignal(false)
  const [formName, setFormName] = createSignal("")
  const [formStrategy, setFormStrategy] = createSignal("")
  const [formCron, setFormCron] = createSignal("0 3 * * *")
  const [formError, setFormError] = createSignal("")
  const [formSubmitting, setFormSubmitting] = createSignal(false)

  async function submitForm(e: Event) {
    e.preventDefault()
    setFormError("")
    if (!formName().trim()) { setFormError(language.t("schedules.form.error.name")); return }
    if (!formStrategy()) { setFormError(language.t("schedules.form.error.strategy")); return }
    setFormSubmitting(true)
    try {
      const res = await fetch(`${apiBase()}/pipelines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName().trim(), strategy: formStrategy(), schedule_cron: formCron() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        setFormError((err as { error?: string }).error ?? "Request failed")
        return
      }
      setShowForm(false)
      setFormName("")
      setFormStrategy("")
      setFormCron("0 3 * * *")
      refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Network error")
    } finally {
      setFormSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div class="h-dvh w-screen flex flex-col bg-background-base overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-6 py-4 border-b border-border-base shrink-0">
        <h1 class="text-16-medium text-text-strong">{language.t("schedules.title")}</h1>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-12-regular text-text-weak hover:text-text-base transition-colors"
            onClick={refresh}
          >
            {language.t("schedules.action.refresh")}
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base"
            onClick={() => setShowForm(true)}
          >
            {language.t("schedules.action.new")}
          </button>
        </div>
      </div>

      {/* Create form */}
      <Show when={showForm()}>
        <div class="px-6 py-4 border-b border-border-base bg-surface-base shrink-0">
          <form onSubmit={submitForm} class="flex flex-col gap-3 max-w-2xl">
            <div class="text-13-medium text-text-strong">{language.t("schedules.form.title")}</div>
            <div class="flex gap-3 flex-wrap">
              <input
                type="text"
                placeholder={language.t("schedules.form.name.placeholder")}
                value={formName()}
                onInput={(e) => setFormName(e.currentTarget.value)}
                class="flex-1 min-w-40 px-3 py-2 rounded-md bg-surface-raised-base border border-border-base text-12-regular text-text-base placeholder:text-text-weak focus:outline-none focus:border-border-focus"
              />
              <select
                value={formStrategy()}
                onChange={(e) => setFormStrategy(e.currentTarget.value)}
                class="px-3 py-2 rounded-md bg-surface-raised-base border border-border-base text-12-regular text-text-base focus:outline-none focus:border-border-focus"
              >
                <option value="">{language.t("schedules.form.strategy.placeholder")}</option>
                <For each={strategies() ?? []}>
                  {(s) => <option value={s}>{s}</option>}
                </For>
              </select>
              <input
                type="text"
                placeholder="cron: 0 3 * * *"
                value={formCron()}
                onInput={(e) => setFormCron(e.currentTarget.value)}
                class="w-36 px-3 py-2 rounded-md bg-surface-raised-base border border-border-base text-12-regular text-text-base placeholder:text-text-weak focus:outline-none focus:border-border-focus font-mono"
              />
            </div>
            <Show when={formError()}>
              <p class="text-12-regular text-text-critical">{formError()}</p>
            </Show>
            <div class="flex gap-2">
              <button
                type="submit"
                disabled={formSubmitting()}
                class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base disabled:opacity-50"
              >
                {formSubmitting() ? language.t("schedules.form.action.saving") : language.t("schedules.form.action.save")}
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded-md text-12-medium text-text-weak hover:text-text-base transition-colors"
                onClick={() => { setShowForm(false); setFormError("") }}
              >
                {language.t("schedules.form.action.cancel")}
              </button>
            </div>
          </form>
        </div>
      </Show>

      {/* Pipeline list */}
      <div class="flex-1 overflow-y-auto px-6 py-4">
        <Show
          when={!pipelines.loading}
          fallback={<p class="text-12-regular text-text-weak">{language.t("schedules.loading")}</p>}
        >
          <Show
            when={(pipelines() ?? []).length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center h-40 gap-2">
                <p class="text-14-regular text-text-weak">{language.t("schedules.empty")}</p>
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base"
                  onClick={() => setShowForm(true)}
                >
                  {language.t("schedules.action.new")}
                </button>
              </div>
            }
          >
            <div class="flex flex-col gap-3 max-w-4xl">
              <For each={pipelines() ?? []}>
                {(pipeline) => (
                  <div class="rounded-lg border border-border-base bg-surface-base overflow-hidden">
                    {/* Pipeline row */}
                    <div class="flex items-center gap-4 px-4 py-3">
                      {/* Enabled indicator / toggle */}
                      <button
                        type="button"
                        title={pipeline.enabled
                          ? language.t("schedules.action.disable")
                          : language.t("schedules.action.enable")}
                        class={`w-2 h-2 rounded-full shrink-0 transition-colors hover:opacity-70 ${
                          pipeline.enabled ? "bg-icon-success-base" : "bg-border-weak-base"
                        }`}
                        onClick={() => togglePipeline(pipeline)}
                      />

                      {/* Info */}
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-13-medium text-text-strong truncate">{pipeline.name}</span>
                          <span class="text-11-regular text-text-weak bg-surface-raised-base px-1.5 py-0.5 rounded font-mono shrink-0">
                            {pipeline.strategy}
                          </span>
                        </div>
                        <div class="text-11-regular text-text-weak mt-0.5">
                          {cronLabel(pipeline.scheduleCron)}
                          <span class="mx-1.5 text-border-weak-base">·</span>
                          <span class="font-mono">{pipeline.scheduleCron}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div class="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={runningId() === pipeline.id}
                          class="px-2.5 py-1 rounded-md bg-surface-raised-base text-11-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base disabled:opacity-50"
                          onClick={() => runNow(pipeline.id)}
                        >
                          {runningId() === pipeline.id
                            ? language.t("schedules.action.running")
                            : language.t("schedules.action.run")}
                        </button>
                        <button
                          type="button"
                          class="px-2.5 py-1 rounded-md text-11-medium text-text-weak hover:text-text-base hover:bg-surface-raised-base transition-colors border border-border-base"
                          onClick={() => setExpandedId(expandedId() === pipeline.id ? null : pipeline.id)}
                        >
                          {expandedId() === pipeline.id
                            ? language.t("schedules.action.hideJobs")
                            : language.t("schedules.action.showJobs")}
                        </button>
                      </div>
                    </div>

                    {/* Jobs expansion */}
                    <Show when={expandedId() === pipeline.id}>
                      <div class="border-t border-border-base bg-background-base px-4 py-3">
                        <div class="text-11-medium text-text-weak mb-2">{language.t("schedules.jobs.title")}</div>
                        <Show
                          when={!jobs.loading}
                          fallback={<p class="text-11-regular text-text-weak">{language.t("schedules.jobs.loading")}</p>}
                        >
                          <Show
                            when={(jobs() ?? []).length > 0}
                            fallback={<p class="text-11-regular text-text-weak">{language.t("schedules.jobs.empty")}</p>}
                          >
                            <div class="flex flex-col gap-1.5">
                              <For each={jobs() ?? []}>
                                {(job) => (
                                  <div class="flex items-center gap-4 text-11-regular py-0.5">
                                    <span
                                      class={`w-18 shrink-0 font-medium ${JOB_STATUS_COLORS[job.status] ?? "text-text-weak"}`}
                                    >
                                      {job.status}
                                    </span>
                                    <span class="text-text-weak shrink-0 tabular-nums">{formatDate(job.createdAt)}</span>
                                    <span class="text-text-weak shrink-0 tabular-nums w-16">{elapsedMs(job.durationMs)}</span>
                                    <Show when={job.errorMessage}>
                                      <span class="text-text-critical truncate">{job.errorMessage}</span>
                                    </Show>
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                        </Show>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
