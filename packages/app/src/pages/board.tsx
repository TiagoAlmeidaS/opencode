import {
  createResource,
  createSignal,
  For,
  Show,
  onCleanup,
  type JSX,
} from "solid-js"
import { useServer } from "@/context/server"

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

const COLUMNS: { status: QueueItem["status"]; label: string; color: string }[] = [
  { status: "pending", label: "Pending", color: "text-text-warning border-border-warning-base" },
  { status: "running", label: "Running", color: "text-text-info border-border-info-base" },
  { status: "completed", label: "Completed", color: "text-text-success border-border-success-base" },
  { status: "failed", label: "Failed", color: "text-text-critical border-border-critical-base" },
]

function elapsed(startedAt: number | null, completedAt: number | null): string {
  if (!startedAt) return "—"
  const end = completedAt ?? Math.floor(Date.now() / 1000)
  const secs = end - startedAt
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function priorityLabel(p: number): string {
  if (p <= 2) return "high"
  if (p <= 4) return "medium-high"
  if (p === 5) return "normal"
  if (p <= 7) return "medium-low"
  return "low"
}

export default function Board() {
  const server = useServer()

  const apiBase = () => {
    const url = server.current?.http.url ?? ""
    return url.replace(/\/$/, "") + "/server"
  }

  const [tick, setTick] = createSignal(0)

  const refresh = () => setTick((n) => n + 1)

  const interval = setInterval(refresh, 30_000)
  onCleanup(() => clearInterval(interval))

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
    try {
      input = JSON.parse(formInput())
    } catch {
      setFormError("Invalid JSON in input field")
      return
    }

    if (!formType()) {
      setFormError("Please select an activity type")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase()}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: formType(),
          input,
          priority: parseInt(formPriority(), 10),
          triggered_by: "manual",
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        setFormError((err as { error: string }).error ?? "Request failed")
        return
      }
      setShowForm(false)
      setFormType("")
      setFormInput("{}")
      setFormPriority("5")
      refresh()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Network error")
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelItem(id: string) {
    await fetch(`${apiBase()}/queue/${id}`, { method: "DELETE" })
    refresh()
  }

  const itemsByStatus = (status: QueueItem["status"]) =>
    (items() ?? []).filter((i) => i.status === status)

  return (
    <div class="h-dvh w-screen flex flex-col bg-background-base overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-6 py-4 border-b border-border-base shrink-0">
        <h1 class="text-16-medium text-text-strong">Activity Board</h1>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-12-regular text-text-weak hover:text-text-base transition-colors"
            onClick={refresh}
          >
            Refresh
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md bg-surface-raised-base text-12-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors border border-border-base"
            onClick={() => setShowForm(true)}
          >
            + Add Activity
          </button>
        </div>
      </div>

      {/* Board columns */}
      <div class="flex-1 flex gap-4 p-6 overflow-x-auto overflow-y-hidden min-h-0">
        <For each={COLUMNS}>
          {(col) => (
            <div class="flex flex-col w-72 shrink-0 min-h-0">
              <div class={`flex items-center gap-2 mb-3 pb-2 border-b ${col.color}`}>
                <span class={`text-13-medium ${col.color.split(" ")[0]}`}>{col.label}</span>
                <span class="text-12-regular text-text-weak ml-auto">
                  {itemsByStatus(col.status).length}
                </span>
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
                        <span title="elapsed">{elapsed(item.startedAt, item.completedAt)}</span>
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
                            return out.summary ? (
                              <p class="text-11-regular text-text-weak break-all line-clamp-2">{out.summary}</p>
                            ) : null
                          } catch {
                            return null
                          }
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
                type="number"
                min="1"
                max="10"
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
              <button
                type="button"
                class="px-4 py-2 text-13-regular text-text-weak hover:text-text-base transition-colors"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting()}
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
