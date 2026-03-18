import {
  createResource,
  createSignal,
  For,
  Show,
  onCleanup,
  Switch,
  Match,
} from "solid-js"
import { useServer } from "@/context/server"
import { DialogSpecEditor } from "@/components/dialog-spec-editor"

// ── Types ──────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string
  activityType: string
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  priority: number
  dependsOn: string | null
  inputJson: string
  outputJson: string | null
  errorMessage: string | null
  startedAt: number | null
  completedAt: number | null
  durationMs: number | null
  triggeredBy: string | null
  createdAt: number
}

interface ActivityType {
  type: string
  displayName: string
  description: string
}

interface Opportunity {
  id: string
  type: string
  title: string
  url: string | null
  status: string
  score: number | null
  rewardMin: number | null
  rewardMax: number | null
  difficulty: string | null
  sourcePlatform: string
  createdAt: number
}

interface Niche {
  id: string
  name: string
  displayName: string
  description: string | null
  aiAgentFit: number
  opportunityCount: number
  trendScore: number | null
}

interface MarketEntry {
  id: string
  symbol: string
  assetType: string
  price: number | null
  change24h: number | null
  volume24h: number | null
  source: string
  collectedAt: number
}

interface DiscoveryReport {
  id: string
  idea_text: string
  status: "pending" | "done" | "failed"
  report_md: string | null
  report_json: string | null
  session_id: string | null
  job_id: string | null
  created_at: number
  updated_at: number
}

interface ProjectSpec {
  id: string
  name: string
  description: string | null
  ontologyJson: string | null
  contracts: string | null
  constraintsJson: string | null
  architecture: string | null
  context: string | null
  linkedProjectId: string | null
  createdAt: number
  updatedAt: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

const COLUMNS: { status: QueueItem["status"]; label: string; color: string }[] = [
  { status: "pending", label: "Pending", color: "text-text-warning border-border-warning-base" },
  { status: "running", label: "Running", color: "text-text-info border-border-info-base" },
  { status: "completed", label: "Completed", color: "text-text-success border-border-success-base" },
  { status: "failed", label: "Failed", color: "text-text-critical border-border-critical-base" },
]

const OPP_STATUS_COLORS: Record<string, string> = {
  new: "text-text-weak bg-surface-raised-base",
  scored: "text-text-info bg-surface-raised-base",
  shortlisted: "text-text-warning bg-surface-raised-base",
  applied: "text-text-success bg-surface-raised-base",
  won: "text-text-success bg-green-900/20",
  ignored: "text-text-weak bg-surface-base",
  expired: "text-text-critical bg-surface-base",
}

function elapsed(startedAt: number | null, completedAt: number | null): string {
  if (!startedAt) return "—"
  const end = completedAt ?? Math.floor(Date.now() / 1000)
  const secs = end - startedAt
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-text-weak"
  if (score >= 80) return "text-text-success"
  if (score >= 60) return "text-text-warning"
  return "text-text-weak"
}

function changeColor(change: number | null): string {
  if (change === null) return "text-text-weak"
  return change >= 0 ? "text-text-success" : "text-text-critical"
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function Board() {
  const server = useServer()

  const apiBase = () => {
    const url = server.current?.http.url ?? ""
    return url.replace(/\/$/, "") + "/server"
  }

  const [tab, setTab] = createSignal<"queue" | "opportunities" | "niches" | "market" | "discovery" | "specs" | "cerebro">("queue")
  const [tick, setTick] = createSignal(0)
  const refresh = () => setTick((n) => n + 1)
  const interval = setInterval(refresh, 30_000)
  onCleanup(() => clearInterval(interval))

  // ── Queue ────────────────────────────────────────────────────────────────
  const [items] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/queue?limit=200`)
    if (!res.ok) return [] as QueueItem[]
    return (await res.json()) as QueueItem[]
  })

  const [activityTypes] = createResource(async () => {
    const res = await fetch(`${apiBase()}/activities/types`)
    if (!res.ok) return [] as ActivityType[]
    return (await res.json()) as ActivityType[]
  })

  // ── Opportunities ────────────────────────────────────────────────────────
  const [opportunities] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/opportunities?limit=100`)
    if (!res.ok) return [] as Opportunity[]
    return (await res.json()) as Opportunity[]
  })

  const [oppStats] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/opportunities/stats`)
    if (!res.ok) return null
    return (await res.json()) as { total: number; by_status: Record<string, number>; avg_score: string }
  })

  // ── Niches ───────────────────────────────────────────────────────────────
  const [niches] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/niches`)
    if (!res.ok) return [] as Niche[]
    return (await res.json()) as Niche[]
  })

  // ── Market Data ──────────────────────────────────────────────────────────
  const [market] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/market-data/latest`)
    if (!res.ok) return [] as MarketEntry[]
    return (await res.json()) as MarketEntry[]
  })

  // ── Discovery ─────────────────────────────────────────────────────────────
  const [discoveryList] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/discovery?limit=100`)
    if (!res.ok) return [] as DiscoveryReport[]
    return (await res.json()) as DiscoveryReport[]
  })

  interface PipelineRow {
    id: string
    name: string
    strategy: string
    enabled: number
  }
  const [pipelines] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/pipelines`)
    if (!res.ok) return [] as PipelineRow[]
    return (await res.json()) as PipelineRow[]
  })
  const discoveryPipelineId = () => pipelines()?.find((p) => p.strategy === "project_discovery")?.id

  const [discoveryFormOpen, setDiscoveryFormOpen] = createSignal(false)
  const [discoveryIdea, setDiscoveryIdea] = createSignal("")
  const [discoverySpecId, setDiscoverySpecId] = createSignal("")
  const [discoveryTriggerPipeline, setDiscoveryTriggerPipeline] = createSignal(false)
  const [discoverySubmitting, setDiscoverySubmitting] = createSignal(false)
  const [discoveryError, setDiscoveryError] = createSignal("")
  const [discoveryViewId, setDiscoveryViewId] = createSignal<string | null>(null)
  const [discoveryViewReport] = createResource(discoveryViewId, async (id) => {
    if (!id) return null
    const res = await fetch(`${apiBase()}/discovery/${id}`)
    if (!res.ok) return null
    return (await res.json()) as DiscoveryReport
  })
  const [discoveryRunning, setDiscoveryRunning] = createSignal(false)

  async function submitDiscovery(e: Event) {
    e.preventDefault()
    setDiscoveryError("")
    const text = discoveryIdea().trim()
    if (!text) { setDiscoveryError("Enter an idea"); return }
    setDiscoverySubmitting(true)
    try {
      const res = await fetch(`${apiBase()}/discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_text: text,
          trigger_pipeline: discoveryTriggerPipeline(),
          ...(discoverySpecId() ? { spec_id: discoverySpecId() } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        setDiscoveryError((err as { error?: string }).error ?? "Request failed")
        return
      }
      setDiscoveryFormOpen(false)
      setDiscoveryIdea("")
      setDiscoverySpecId("")
      setDiscoveryTriggerPipeline(false)
      refresh()
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : "Network error")
    } finally { setDiscoverySubmitting(false) }
  }

  async function runDiscoveryPipeline() {
    const id = discoveryPipelineId()
    if (!id) return
    setDiscoveryRunning(true)
    try {
      const res = await fetch(`${apiBase()}/pipelines/${id}/run`, { method: "POST" })
      if (res.ok) refresh()
    } finally { setDiscoveryRunning(false) }
  }

  const discoveryPendingCount = () => (discoveryList() ?? []).filter((r) => r.status === "pending").length

  // ── Specs ─────────────────────────────────────────────────────────────────
  const [specsList] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/specs?limit=100`)
    if (!res.ok) return [] as ProjectSpec[]
    return (await res.json()) as ProjectSpec[]
  })

  const [specsFormOpen, setSpecsFormOpen] = createSignal(false)
  const [editingSpec, setEditingSpec] = createSignal<ProjectSpec | undefined>(undefined)
  const [specPreviewId, setSpecPreviewId] = createSignal<string | null>(null)
  const [specPreview] = createResource(specPreviewId, async (id) => {
    if (!id) return null
    const res = await fetch(`${apiBase()}/specs/${id}/prompt`)
    if (!res.ok) return null
    return (await res.json()) as { spec_id: string; prompt: string }
  })

  async function deleteSpec(id: string) {
    await fetch(`${apiBase()}/specs/${id}`, { method: "DELETE" })
    refresh()
  }

  // ── Cérebro (Agent Learnings) ─────────────────────────────────────────────
  interface AgentLearning {
    id: string
    category: "skill" | "niche" | "platform" | "pattern"
    key: string
    title: string
    body: string
    confidence: number
    source: string | null
    relatedNicheId: string | null
    positiveCount: number
    negativeCount: number
    tags: string | null
    createdAt: number
    updatedAt: number
  }

  const [learnings] = createResource(tick, async () => {
    const res = await fetch(`${apiBase()}/learnings?limit=200`)
    if (!res.ok) return [] as AgentLearning[]
    return (await res.json()) as AgentLearning[]
  })

  const [extracting, setExtracting] = createSignal(false)

  async function triggerExtract() {
    setExtracting(true)
    try {
      await fetch(`${apiBase()}/learnings/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "batch", limit: 30, since_hours: 720 }),
      })
      refresh()
    } finally { setExtracting(false) }
  }

  const learningsByCategory = (cat: AgentLearning["category"]) =>
    (learnings() ?? []).filter((l) => l.category === cat)

  const LEARNING_CATEGORIES: { id: AgentLearning["category"]; label: string; icon: string; color: string }[] = [
    { id: "skill", label: "Skills", icon: "⚡", color: "text-text-info border-border-info-base" },
    { id: "niche", label: "Nichos", icon: "🎯", color: "text-text-success border-border-success-base" },
    { id: "platform", label: "Plataformas", icon: "🏗", color: "text-text-warning border-border-warning-base" },
    { id: "pattern", label: "Padrões", icon: "🔄", color: "text-text-base border-border-base" },
  ]

  // ── Add Activity Form ────────────────────────────────────────────────────
  const [showForm, setShowForm] = createSignal(false)
  const [formType, setFormType] = createSignal("")
  const [formInput, setFormInput] = createSignal("{}")
  const [formPriority, setFormPriority] = createSignal("5")
  const [formError, setFormError] = createSignal("")
  const [submitting, setSubmitting] = createSignal(false)

  async function submitForm(e: Event) {
    e.preventDefault()
    setFormError("")
    let input: Record<string, unknown>
    try { input = JSON.parse(formInput()) } catch {
      setFormError("Invalid JSON in input field"); return
    }
    if (!formType()) { setFormError("Please select an activity type"); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase()}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type: formType(), input, priority: parseInt(formPriority(), 10), triggered_by: "manual" }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        setFormError((err as { error: string }).error ?? "Request failed"); return
      }
      setShowForm(false); setFormType(""); setFormInput("{}"); setFormPriority("5")
      refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Network error")
    } finally { setSubmitting(false) }
  }

  async function cancelItem(id: string) {
    await fetch(`${apiBase()}/queue/${id}`, { method: "DELETE" })
    refresh()
  }

  async function executeOpp(id: string) {
    await fetch(`${apiBase()}/opportunities/${id}/execute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    refresh()
  }

  async function ignoreOpp(id: string) {
    await fetch(`${apiBase()}/opportunities/${id}/ignore`, { method: "POST" })
    refresh()
  }

  async function shortlistOpp(id: string) {
    await fetch(`${apiBase()}/opportunities/${id}/shortlist`, { method: "POST" })
    refresh()
  }

  const itemsByStatus = (status: QueueItem["status"]) => (items() ?? []).filter((i) => i.status === status)

  const TABS = [
    { id: "queue" as const, label: "Activity Queue" },
    { id: "opportunities" as const, label: "Opportunities" },
    { id: "niches" as const, label: "Niches" },
    { id: "market" as const, label: "Market Data" },
    { id: "discovery" as const, label: "Discovery" },
    { id: "specs" as const, label: "Specs" },
    { id: "cerebro" as const, label: "Cérebro" },
  ]

  return (
    <div class="h-dvh w-screen flex flex-col bg-background-base overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-6 py-4 border-b border-border-base shrink-0">
        <div class="flex items-center gap-6">
          <h1 class="text-16-medium text-text-strong">Activity Board</h1>
          <div class="flex items-center gap-1">
            <For each={TABS}>
              {(t) => (
                <button
                  type="button"
                  class={`px-3 py-1.5 rounded-md text-12-medium transition-colors ${tab() === t.id ? "bg-surface-raised-base text-text-strong border border-border-base" : "text-text-weak hover:text-text-base"}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button type="button" class="text-12-regular text-text-weak hover:text-text-base transition-colors" onClick={refresh}>
            Refresh
          </button>
          <Show when={tab() === "queue"}>
            <button
              type="button"
              class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base"
              onClick={() => setShowForm(true)}
            >
              + Add Activity
            </button>
          </Show>
          <Show when={tab() === "discovery"}>
            <div class="flex items-center gap-2">
              <Show when={discoveryPipelineId() && discoveryPendingCount() > 0}>
                <button
                  type="button"
                  disabled={discoveryRunning()}
                  class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base disabled:opacity-50"
                  onClick={runDiscoveryPipeline}
                >
                  {discoveryRunning() ? "Running…" : "Process now"}
                </button>
              </Show>
              <button
                type="button"
                class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base"
                onClick={() => setDiscoveryFormOpen(true)}
              >
                + New idea
              </button>
            </div>
          </Show>
          <Show when={tab() === "specs"}>
            <button
              type="button"
              class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base"
              onClick={() => { setEditingSpec(undefined); setSpecsFormOpen(true) }}
            >
              + New Spec
            </button>
          </Show>
          <Show when={tab() === "cerebro"}>
            <button
              type="button"
              disabled={extracting()}
              class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base disabled:opacity-50"
              onClick={triggerExtract}
            >
              {extracting() ? "Extraindo…" : "Extrair aprendizados"}
            </button>
          </Show>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 min-h-0 overflow-hidden">

        {/* ── Queue Tab ── */}
        <Show when={tab() === "queue"}>
          <div class="flex gap-4 p-6 h-full overflow-x-auto overflow-y-hidden">
            <For each={COLUMNS}>
              {(col) => (
                <div class="flex flex-col w-72 shrink-0 min-h-0">
                  <div class={`flex items-center gap-2 mb-3 pb-2 border-b ${col.color}`}>
                    <span class={`text-13-medium ${col.color.split(" ")[0]}`}>{col.label}</span>
                    <span class="text-12-regular text-text-weak ml-auto">{itemsByStatus(col.status).length}</span>
                  </div>
                  <div class="flex-1 flex flex-col gap-2 overflow-y-auto">
                    <For each={itemsByStatus(col.status)}>
                      {(item) => (
                        <div class="rounded-lg border border-border-base bg-surface-base p-3 flex flex-col gap-1.5 group">
                          <div class="flex items-start justify-between gap-2">
                            <span class="text-12-medium text-text-strong break-all">{item.activityType}</span>
                            <span class="text-11-regular text-text-weak shrink-0">p{item.priority}</span>
                          </div>
                          <div class="flex items-center gap-2 text-11-regular text-text-weak">
                            <span>{elapsed(item.startedAt, item.completedAt)}</span>
                            <Show when={item.triggeredBy}>
                              <span>·</span>
                              <span class="truncate max-w-24" title={item.triggeredBy ?? ""}>
                                {item.triggeredBy === "manual" ? "manual" : `→${item.triggeredBy?.slice(-6)}`}
                              </span>
                            </Show>
                          </div>
                          <Show when={item.errorMessage}>
                            <p class="text-11-regular text-text-critical break-all line-clamp-2">{item.errorMessage}</p>
                          </Show>
                          <Show when={item.outputJson}>
                            {(_) => {
                              try {
                                const out = JSON.parse(item.outputJson!)
                                return out.summary ? <p class="text-11-regular text-text-weak break-all line-clamp-2">{out.summary}</p> : null
                              } catch { return null }
                            }}
                          </Show>
                          <Show when={item.status === "pending"}>
                            <button
                              type="button"
                              class="mt-1 text-11-regular text-text-weak hover:text-text-critical transition-colors text-left opacity-0 group-hover:opacity-100"
                              onClick={() => cancelItem(item.id)}
                            >
                              Cancel
                            </button>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* ── Opportunities Tab ── */}
        <Show when={tab() === "opportunities"}>
          <div class="flex flex-col h-full overflow-hidden">
            {/* Stats bar */}
            <Show when={oppStats()}>
              {(stats) => (
                <div class="flex items-center gap-6 px-6 py-3 border-b border-border-base text-12-regular text-text-weak shrink-0">
                  <span>Total: <strong class="text-text-strong">{stats().total}</strong></span>
                  <For each={Object.entries(stats().by_status)}>
                    {([status, count]) => (
                      <span>{status}: <strong class="text-text-strong">{count}</strong></span>
                    )}
                  </For>
                  <span>Avg Score: <strong class="text-text-strong">{stats().avg_score}</strong></span>
                </div>
              )}
            </Show>
            {/* Table */}
            <div class="flex-1 overflow-y-auto">
              <table class="w-full text-12-regular">
                <thead class="sticky top-0 bg-background-base border-b border-border-base">
                  <tr>
                    <th class="text-left px-4 py-2 text-text-weak font-medium">Title</th>
                    <th class="text-left px-3 py-2 text-text-weak font-medium w-24">Type</th>
                    <th class="text-left px-3 py-2 text-text-weak font-medium w-20">Score</th>
                    <th class="text-left px-3 py-2 text-text-weak font-medium w-24">Reward</th>
                    <th class="text-left px-3 py-2 text-text-weak font-medium w-24">Status</th>
                    <th class="text-left px-3 py-2 text-text-weak font-medium w-20">Source</th>
                    <th class="px-3 py-2 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  <For each={opportunities() ?? []}>
                    {(opp) => (
                      <tr class="border-b border-border-base hover:bg-surface-base transition-colors group">
                        <td class="px-4 py-2 text-text-strong">
                          <Show when={opp.url} fallback={<span>{opp.title}</span>}>
                            <a href={opp.url!} target="_blank" rel="noopener noreferrer" class="hover:underline">{opp.title}</a>
                          </Show>
                        </td>
                        <td class="px-3 py-2 text-text-weak">{opp.type}</td>
                        <td class={`px-3 py-2 font-medium ${scoreColor(opp.score)}`}>{opp.score?.toFixed(0) ?? "—"}</td>
                        <td class="px-3 py-2 text-text-weak">
                          {opp.rewardMax ?? opp.rewardMin ? `$${(opp.rewardMax ?? opp.rewardMin)!.toLocaleString()}` : "—"}
                        </td>
                        <td class="px-3 py-2">
                          <span class={`px-2 py-0.5 rounded text-11-regular ${OPP_STATUS_COLORS[opp.status] ?? "text-text-weak"}`}>
                            {opp.status}
                          </span>
                        </td>
                        <td class="px-3 py-2 text-text-weak truncate max-w-20">{opp.sourcePlatform}</td>
                        <td class="px-3 py-2">
                          <Show when={opp.status !== "ignored" && opp.status !== "won"}>
                            <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Show when={opp.status === "scored" || opp.status === "shortlisted"}>
                                <button
                                  type="button"
                                  class="text-11-regular text-text-success hover:underline"
                                  onClick={() => executeOpp(opp.id)}
                                  title="Execute via OpenCode"
                                >
                                  Execute
                                </button>
                              </Show>
                              <Show when={opp.status !== "shortlisted"}>
                                <button
                                  type="button"
                                  class="text-11-regular text-text-info hover:underline"
                                  onClick={() => shortlistOpp(opp.id)}
                                >
                                  Shortlist
                                </button>
                              </Show>
                              <button
                                type="button"
                                class="text-11-regular text-text-weak hover:text-text-critical hover:underline"
                                onClick={() => ignoreOpp(opp.id)}
                              >
                                Ignore
                              </button>
                            </div>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </Show>

        {/* ── Niches Tab ── */}
        <Show when={tab() === "niches"}>
          <div class="flex-1 overflow-y-auto p-6 h-full">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <For each={niches() ?? []}>
                {(niche) => (
                  <div class="rounded-xl border border-border-base bg-surface-base p-4 flex flex-col gap-2">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <p class="text-13-medium text-text-strong">{niche.displayName}</p>
                        <p class="text-11-regular text-text-weak font-mono">{niche.name}</p>
                      </div>
                      <div class="flex flex-col items-end gap-1 shrink-0">
                        <span class={`text-13-medium ${niche.aiAgentFit >= 70 ? "text-text-success" : niche.aiAgentFit >= 40 ? "text-text-warning" : "text-text-weak"}`}>
                          {niche.aiAgentFit}
                        </span>
                        <span class="text-10-regular text-text-weak">AI fit</span>
                      </div>
                    </div>
                    <Show when={niche.description}>
                      <p class="text-12-regular text-text-weak line-clamp-2">{niche.description}</p>
                    </Show>
                    <div class="flex items-center gap-3 mt-1 text-11-regular text-text-weak">
                      <span>{niche.opportunityCount} opps</span>
                      <Show when={niche.trendScore !== null}>
                        <span>trend: {niche.trendScore}</span>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* ── Discovery Tab ── */}
        <Show when={tab() === "discovery"}>
          <div class="flex flex-col h-full overflow-hidden">
            <div class="flex-1 overflow-y-auto">
              <table class="w-full text-12-regular">
                <thead class="sticky top-0 bg-background-base border-b border-border-base">
                  <tr>
                    <th class="text-left px-4 py-2 text-text-weak font-medium">Idea</th>
                    <th class="text-left px-3 py-2 text-text-weak font-medium w-24">Status</th>
                    <th class="text-left px-3 py-2 text-text-weak font-medium w-36">Created</th>
                    <th class="px-3 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  <For each={discoveryList() ?? []}>
                    {(r) => (
                      <tr class="border-b border-border-base hover:bg-surface-base transition-colors group">
                        <td class="px-4 py-2 text-text-strong max-w-md">
                          <span class="line-clamp-2">{r.idea_text}</span>
                        </td>
                        <td class="px-3 py-2">
                          <span
                            class={`px-2 py-0.5 rounded text-11-regular ${
                              r.status === "done"
                                ? "text-text-success bg-surface-raised-base"
                                : r.status === "failed"
                                  ? "text-text-critical bg-surface-raised-base"
                                  : "text-text-warning bg-surface-raised-base"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td class="px-3 py-2 text-text-weak">
                          {new Date(r.created_at * 1000).toLocaleString()}
                        </td>
                        <td class="px-3 py-2">
                          <Show when={r.report_md || r.status === "pending"}>
                            <button
                              type="button"
                              class="text-11-regular text-text-info hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => setDiscoveryViewId(r.id)}
                            >
                              {r.status === "done" ? "View" : r.status === "pending" ? "…" : "View"}
                            </button>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </Show>

        {/* ── Market Data Tab ── */}
        <Show when={tab() === "market"}>
          <div class="flex-1 overflow-y-auto h-full">
            <table class="w-full text-12-regular">
              <thead class="sticky top-0 bg-background-base border-b border-border-base">
                <tr>
                  <th class="text-left px-4 py-2 text-text-weak font-medium">Symbol</th>
                  <th class="text-left px-3 py-2 text-text-weak font-medium w-24">Type</th>
                  <th class="text-right px-3 py-2 text-text-weak font-medium w-28">Price</th>
                  <th class="text-right px-3 py-2 text-text-weak font-medium w-24">24h %</th>
                  <th class="text-right px-3 py-2 text-text-weak font-medium w-32">Volume 24h</th>
                  <th class="text-left px-3 py-2 text-text-weak font-medium w-24">Source</th>
                  <th class="text-left px-3 py-2 text-text-weak font-medium w-28">Collected</th>
                </tr>
              </thead>
              <tbody>
                <For each={market() ?? []}>
                  {(entry) => (
                    <tr class="border-b border-border-base hover:bg-surface-base transition-colors">
                      <td class="px-4 py-2 text-text-strong font-medium">{entry.symbol}</td>
                      <td class="px-3 py-2 text-text-weak">{entry.assetType}</td>
                      <td class="px-3 py-2 text-text-strong text-right">
                        {entry.price != null ? `$${entry.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : "—"}
                      </td>
                      <td class={`px-3 py-2 text-right font-medium ${changeColor(entry.change24h)}`}>
                        {entry.change24h != null ? `${entry.change24h >= 0 ? "+" : ""}${entry.change24h.toFixed(2)}%` : "—"}
                      </td>
                      <td class="px-3 py-2 text-text-weak text-right">
                        {entry.volume24h != null ? `$${(entry.volume24h / 1_000_000).toFixed(1)}M` : "—"}
                      </td>
                      <td class="px-3 py-2 text-text-weak">{entry.source}</td>
                      <td class="px-3 py-2 text-text-weak">
                        {new Date(entry.collectedAt * 1000).toLocaleTimeString()}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>

        {/* ── Specs Tab ── */}
        <Show when={tab() === "specs"}>
          <div class="flex flex-col h-full overflow-hidden">
            <div class="flex-1 overflow-y-auto">
              <Show when={(specsList() ?? []).length === 0}>
                <p class="px-6 py-8 text-12-regular text-text-weak">
                  No specs yet. Create one to provide domain context to AI pipelines.
                </p>
              </Show>
              <Show when={(specsList() ?? []).length > 0}>
                <table class="w-full text-12-regular">
                  <thead class="sticky top-0 bg-background-base border-b border-border-base">
                    <tr>
                      <th class="text-left px-4 py-2 text-text-weak font-medium">Name</th>
                      <th class="text-left px-3 py-2 text-text-weak font-medium">Description</th>
                      <th class="text-left px-3 py-2 text-text-weak font-medium w-36">Created</th>
                      <th class="px-3 py-2 w-36"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={specsList() ?? []}>
                      {(spec) => (
                        <tr class="border-b border-border-base hover:bg-surface-base transition-colors group">
                          <td class="px-4 py-2 text-text-strong font-medium">{spec.name}</td>
                          <td class="px-3 py-2 text-text-weak max-w-xs truncate">{spec.description ?? "—"}</td>
                          <td class="px-3 py-2 text-text-weak">
                            {new Date(spec.createdAt * 1000).toLocaleDateString()}
                          </td>
                          <td class="px-3 py-2">
                            <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                class="text-11-regular text-text-info hover:underline"
                                onClick={() => setSpecPreviewId(spec.id)}
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                class="text-11-regular text-text-weak hover:underline"
                                onClick={() => { setEditingSpec(spec); setSpecsFormOpen(true) }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                class="text-11-regular text-text-weak hover:text-text-critical hover:underline"
                                onClick={() => deleteSpec(spec.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>
            </div>
          </div>
        </Show>

        {/* ── Cérebro Tab ── */}
        <Show when={tab() === "cerebro"}>
          <div class="h-full overflow-y-auto p-6">
            {/* Stats bar */}
            <div class="flex items-center gap-6 mb-6">
              <div class="text-12-regular text-text-weak">
                <span class="text-text-strong text-13-medium">{(learnings() ?? []).length}</span> aprendizados registrados
              </div>
              <For each={LEARNING_CATEGORIES}>
                {(cat) => (
                  <div class="text-12-regular text-text-weak">
                    <span class="mr-1">{cat.icon}</span>
                    <span class="text-text-base">{learningsByCategory(cat.id).length}</span>
                    <span class="ml-1">{cat.label.toLowerCase()}</span>
                  </div>
                )}
              </For>
              <Show when={(learnings() ?? []).length === 0}>
                <span class="text-12-regular text-text-weak italic">
                  Nenhum aprendizado ainda — clique em "Extrair aprendizados" para gerar os primeiros insights a partir das submissions.
                </span>
              </Show>
            </div>

            {/* Knowledge map — 4 columns */}
            <div class="grid grid-cols-4 gap-4 items-start">
              <For each={LEARNING_CATEGORIES}>
                {(cat) => (
                  <div class="flex flex-col gap-3">
                    {/* Column header */}
                    <div class={`flex items-center gap-2 pb-2 border-b ${cat.color}`}>
                      <span class="text-base leading-none">{cat.icon}</span>
                      <span class={`text-13-medium ${cat.color.split(" ")[0]}`}>{cat.label}</span>
                      <span class="text-11-regular text-text-weak ml-auto">{learningsByCategory(cat.id).length}</span>
                    </div>

                    {/* Cards */}
                    <Show when={learningsByCategory(cat.id).length === 0}>
                      <p class="text-11-regular text-text-weak italic px-1">Sem aprendizados nessa categoria ainda.</p>
                    </Show>
                    <For each={learningsByCategory(cat.id)}>
                      {(l) => {
                        const tags = () => {
                          try { return JSON.parse(l.tags ?? "[]") as string[] } catch { return [] }
                        }
                        const confidencePct = () => Math.round(l.confidence * 100)
                        const confColor = () =>
                          l.confidence >= 0.75 ? "bg-[color:var(--color-border-success-base)]" :
                          l.confidence >= 0.5  ? "bg-[color:var(--color-border-warning-base)]" :
                          "bg-[color:var(--color-border-base)]"

                        return (
                          <div class="rounded-lg border border-border-base bg-surface-base p-3 flex flex-col gap-2">
                            {/* Title */}
                            <p class="text-12-medium text-text-strong leading-snug">{l.title}</p>

                            {/* Body */}
                            <p class="text-11-regular text-text-base leading-relaxed">{l.body}</p>

                            {/* Confidence bar */}
                            <div class="flex items-center gap-2">
                              <div class="flex-1 h-1 rounded-full bg-surface-raised-base overflow-hidden">
                                <div
                                  class={`h-full rounded-full transition-all ${confColor()}`}
                                  style={{ width: `${confidencePct()}%` }}
                                />
                              </div>
                              <span class="text-10-regular text-text-weak shrink-0">{confidencePct()}%</span>
                            </div>

                            {/* Signals + source */}
                            <div class="flex items-center gap-3 text-11-regular text-text-weak">
                              <Show when={l.positiveCount > 0}>
                                <span class="text-text-success">+{l.positiveCount}</span>
                              </Show>
                              <Show when={l.negativeCount > 0}>
                                <span class="text-text-critical">−{l.negativeCount}</span>
                              </Show>
                              <Show when={tags().length > 0}>
                                <div class="flex gap-1 flex-wrap">
                                  <For each={tags().slice(0, 3)}>
                                    {(tag) => (
                                      <span class="px-1.5 py-0.5 rounded bg-surface-raised-base text-10-regular text-text-weak">{tag}</span>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      {/* Discovery View Modal */}
      <Show when={discoveryViewId()}>
        <div
          class="fixed inset-0 bg-background-base/80 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={(e) => { if (e.target === e.currentTarget) setDiscoveryViewId(null) }}
        >
          <div class="bg-surface-base border border-border-base rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-lg">
            <div class="flex items-center justify-between px-6 py-4 border-b border-border-base shrink-0">
              <h2 class="text-15-medium text-text-strong">Discovery report</h2>
              <button type="button" class="text-text-weak hover:text-text-base" onClick={() => setDiscoveryViewId(null)}>✕</button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 min-h-0">
              <Show when={discoveryViewReport()} fallback={<p class="text-text-weak">Loading…</p>}>
                {(report) => (
                  <>
                    <Show when={report().status === "pending"}>
                      <p class="text-text-warning text-12-regular mb-4">Report is pending. Run the project_discovery pipeline to process it.</p>
                    </Show>
                    <Show when={report().idea_text}>
                      <p class="text-12-regular text-text-weak mb-4 line-clamp-2">{report().idea_text}</p>
                    </Show>
                    <Show when={report().report_md}>
                      <div class="prose prose-sm dark:prose-invert max-w-none text-text-base whitespace-pre-wrap font-sans">
                        {report().report_md}
                      </div>
                    </Show>
                  </>
                )}
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Discovery New Idea Modal */}
      <Show when={discoveryFormOpen()}>
        <div
          class="fixed inset-0 bg-background-base/80 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setDiscoveryFormOpen(false) }}
        >
          <form
            class="bg-surface-base border border-border-base rounded-xl p-6 w-full max-w-lg flex flex-col gap-4 shadow-lg"
            onSubmit={submitDiscovery}
          >
            <h2 class="text-15-medium text-text-strong">New discovery idea</h2>
            <p class="text-12-regular text-text-weak">Enqueue a project/venture idea. Process it by running the project_discovery pipeline (or use the chat with /project-discovery).</p>
            <label class="flex flex-col gap-1">
              <span class="text-12-medium text-text-base">Idea</span>
              <textarea
                class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-13-regular text-text-strong focus:outline-none focus:border-border-focus-base resize-none"
                rows={4}
                placeholder="Describe your project or venture idea…"
                value={discoveryIdea()}
                onInput={(e) => setDiscoveryIdea(e.currentTarget.value)}
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-12-medium text-text-base">Spec <span class="text-text-weak font-normal">(optional)</span></span>
              <select
                class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-13-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                value={discoverySpecId()}
                onChange={(e) => setDiscoverySpecId(e.currentTarget.value)}
              >
                <option value="">— no spec —</option>
                <For each={specsList() ?? []}>
                  {(spec) => <option value={spec.id}>{spec.name}</option>}
                </For>
              </select>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={discoveryTriggerPipeline()}
                onInput={(e) => setDiscoveryTriggerPipeline(e.currentTarget.checked)}
                class="rounded border-border-base"
              />
              <span class="text-12-regular text-text-base">Process now (run pipeline after adding)</span>
            </label>
            <Show when={discoveryError()}>
              <p class="text-12-regular text-text-critical">{discoveryError()}</p>
            </Show>
            <div class="flex items-center justify-end gap-3 pt-1">
              <button type="button" class="px-4 py-2 text-13-regular text-text-weak hover:text-text-base transition-colors" onClick={() => setDiscoveryFormOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={discoverySubmitting()}
                class="px-4 py-2 rounded-md bg-surface-raised-base border border-border-base text-13-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors disabled:opacity-50"
              >
                {discoverySubmitting() ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      </Show>

      {/* Spec Prompt Preview Modal */}
      <Show when={specPreviewId()}>
        <div
          class="fixed inset-0 bg-background-base/80 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={(e) => { if (e.target === e.currentTarget) setSpecPreviewId(null) }}
        >
          <div class="bg-surface-base border border-border-base rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-lg">
            <div class="flex items-center justify-between px-6 py-4 border-b border-border-base shrink-0">
              <h2 class="text-15-medium text-text-strong">Compiled Prompt</h2>
              <button type="button" class="text-text-weak hover:text-text-base" onClick={() => setSpecPreviewId(null)}>✕</button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 min-h-0">
              <Show when={specPreview()} fallback={<p class="text-text-weak text-12-regular">Loading…</p>}>
                {(preview) => (
                  <pre class="text-12-regular font-mono text-text-base whitespace-pre-wrap break-words">
                    {preview().prompt}
                  </pre>
                )}
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Spec Editor Dialog */}
      <Show when={specsFormOpen()}>
        <DialogSpecEditor
          apiBase={apiBase()}
          spec={editingSpec()}
          onClose={() => { setSpecsFormOpen(false); setEditingSpec(undefined) }}
          onSaved={() => { setSpecsFormOpen(false); setEditingSpec(undefined); refresh() }}
        />
      </Show>

      {/* Add Activity Modal */}
      <Show when={showForm()}>
        <div
          class="fixed inset-0 bg-background-base/80 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <form
            class="bg-surface-base border border-border-base rounded-xl p-6 w-full max-w-md flex flex-col gap-4 shadow-lg"
            onSubmit={submitForm}
          >
            <h2 class="text-15-medium text-text-strong">Add Activity</h2>

            <label class="flex flex-col gap-1">
              <span class="text-12-medium text-text-base">Activity Type</span>
              <select
                class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-13-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                value={formType()}
                onChange={(e) => setFormType(e.currentTarget.value)}
                required
              >
                <option value="">— select —</option>
                <For each={activityTypes() ?? []}>
                  {(at) => <option value={at.type}>{at.displayName} ({at.type})</option>}
                </For>
              </select>
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-12-medium text-text-base">Priority (1=highest, 10=lowest)</span>
              <input
                type="number" min="1" max="10"
                class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-13-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                value={formPriority()}
                onInput={(e) => setFormPriority(e.currentTarget.value)}
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-12-medium text-text-base">Input (JSON)</span>
              <textarea
                class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-12-regular font-mono text-text-strong focus:outline-none focus:border-border-focus-base resize-none"
                rows={6}
                value={formInput()}
                onInput={(e) => setFormInput(e.currentTarget.value)}
                spellcheck={false}
              />
            </label>

            <Show when={formError()}>
              <p class="text-12-regular text-text-critical">{formError()}</p>
            </Show>

            <div class="flex items-center justify-end gap-3 pt-1">
              <button type="button" class="px-4 py-2 text-13-regular text-text-weak hover:text-text-base transition-colors" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button
                type="submit" disabled={submitting()}
                class="px-4 py-2 rounded-md bg-surface-raised-base border border-border-base text-13-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors disabled:opacity-50"
              >
                {submitting() ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      </Show>
    </div>
  )
}
