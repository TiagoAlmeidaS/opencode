import { createSignal, For, Show } from "solid-js"

interface OntologyEntry {
  term: string
  definition: string
  canonical_name: string
}

interface ConstraintEntry {
  rule: string
  reason: string
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

type SpecTab = "basic" | "ontology" | "contracts" | "rules" | "architecture" | "context"

interface Props {
  apiBase: string
  spec?: ProjectSpec  // present when editing
  onClose: () => void
  onSaved: () => void
}

export function DialogSpecEditor(props: Props) {
  const isEdit = () => !!props.spec

  // Basic
  const [name, setName] = createSignal(props.spec?.name ?? "")
  const [description, setDescription] = createSignal(props.spec?.description ?? "")

  // Context
  const [context, setContext] = createSignal(props.spec?.context ?? "")

  // Ontology
  const parseOntology = (): OntologyEntry[] => {
    if (!props.spec?.ontologyJson) return []
    try { return JSON.parse(props.spec.ontologyJson) as OntologyEntry[] } catch { return [] }
  }
  const [ontology, setOntology] = createSignal<OntologyEntry[]>(parseOntology())

  // Contracts
  const [contracts, setContracts] = createSignal(props.spec?.contracts ?? "")

  // Constraints / Rules
  const parseConstraints = (): ConstraintEntry[] => {
    if (!props.spec?.constraintsJson) return []
    try { return JSON.parse(props.spec.constraintsJson) as ConstraintEntry[] } catch { return [] }
  }
  const [constraints, setConstraints] = createSignal<ConstraintEntry[]>(parseConstraints())

  // Architecture
  const [architecture, setArchitecture] = createSignal(props.spec?.architecture ?? "")

  // UI state
  const [activeTab, setActiveTab] = createSignal<SpecTab>("basic")
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal("")

  const TABS: { id: SpecTab; label: string }[] = [
    { id: "basic", label: "Basic" },
    { id: "ontology", label: "Ontology" },
    { id: "contracts", label: "Contracts" },
    { id: "rules", label: "Rules" },
    { id: "architecture", label: "Architecture" },
    { id: "context", label: "Context" },
  ]

  function addOntologyEntry() {
    setOntology([...ontology(), { term: "", definition: "", canonical_name: "" }])
  }

  function updateOntologyEntry(idx: number, field: keyof OntologyEntry, value: string) {
    const next = ontology().map((e, i) => i === idx ? { ...e, [field]: value } : e)
    setOntology(next)
  }

  function removeOntologyEntry(idx: number) {
    setOntology(ontology().filter((_, i) => i !== idx))
  }

  function addConstraint() {
    setConstraints([...constraints(), { rule: "", reason: "" }])
  }

  function updateConstraint(idx: number, field: keyof ConstraintEntry, value: string) {
    const next = constraints().map((c, i) => i === idx ? { ...c, [field]: value } : c)
    setConstraints(next)
  }

  function removeConstraint(idx: number) {
    setConstraints(constraints().filter((_, i) => i !== idx))
  }

  async function handleSave(e: Event) {
    e.preventDefault()
    setError("")
    if (!name().trim()) { setError("Name is required"); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: name().trim(),
        description: description().trim() || null,
        ontologyJson: ontology().length > 0 ? JSON.stringify(ontology()) : null,
        contracts: contracts().trim() || null,
        constraintsJson: constraints().length > 0 ? JSON.stringify(constraints()) : null,
        architecture: architecture().trim() || null,
        context: context().trim() || null,
      }

      const url = isEdit()
        ? `${props.apiBase}/specs/${props.spec!.id}`
        : `${props.apiBase}/specs`
      const method = isEdit() ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        setError((err as { error?: string }).error ?? "Request failed")
        return
      }
      props.onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      class="fixed inset-0 bg-background-base/80 backdrop-blur-sm flex items-center justify-center z-50 p-6"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose() }}
    >
      <form
        class="bg-surface-base border border-border-base rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-lg"
        onSubmit={handleSave}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-6 py-4 border-b border-border-base shrink-0">
          <h2 class="text-15-medium text-text-strong">
            {isEdit() ? "Edit Spec" : "New Spec"}
          </h2>
          <button type="button" class="text-text-weak hover:text-text-base" onClick={props.onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div class="flex items-center gap-1 px-6 pt-3 shrink-0 border-b border-border-base pb-3">
          <For each={TABS}>
            {(t) => (
              <button
                type="button"
                class={`px-3 py-1 rounded-md text-12-medium transition-colors ${activeTab() === t.id ? "bg-surface-raised-base text-text-strong border border-border-base" : "text-text-weak hover:text-text-base"}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            )}
          </For>
        </div>

        {/* Content */}
        <div class="flex-1 overflow-y-auto p-6 min-h-0">

          {/* Basic Tab */}
          <Show when={activeTab() === "basic"}>
            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-1">
                <span class="text-12-medium text-text-base">Name <span class="text-text-critical">*</span></span>
                <input
                  class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-13-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                  placeholder="e.g. My SaaS Domain"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  required
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-12-medium text-text-base">Description</span>
                <input
                  class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-13-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                  placeholder="Short description of this spec"
                  value={description()}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                />
              </label>
            </div>
          </Show>

          {/* Context Tab */}
          <Show when={activeTab() === "context"}>
            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-1">
                <span class="text-12-medium text-text-base">Business Context</span>
                <textarea
                  class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-13-regular text-text-strong focus:outline-none focus:border-border-focus-base resize-none"
                  rows={12}
                  placeholder="Background business context, goals, target users…"
                  value={context()}
                  onInput={(e) => setContext(e.currentTarget.value)}
                />
              </label>
            </div>
          </Show>

          {/* Ontology Tab */}
          <Show when={activeTab() === "ontology"}>
            <div class="flex flex-col gap-3">
              <p class="text-12-regular text-text-weak">Define domain terms that the AI should use consistently.</p>
              <For each={ontology()}>
                {(entry, idx) => (
                  <div class="flex flex-col gap-2 p-3 rounded-lg border border-border-base bg-surface-raised-base">
                    <div class="flex items-center justify-between">
                      <span class="text-11-medium text-text-weak">Entry {idx() + 1}</span>
                      <button
                        type="button"
                        class="text-11-regular text-text-weak hover:text-text-critical"
                        onClick={() => removeOntologyEntry(idx())}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      class="bg-surface-base border border-border-base rounded px-2 py-1.5 text-12-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                      placeholder="Term (e.g. Bounty)"
                      value={entry.term}
                      onInput={(e) => updateOntologyEntry(idx(), "term", e.currentTarget.value)}
                    />
                    <input
                      class="bg-surface-base border border-border-base rounded px-2 py-1.5 text-12-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                      placeholder="Canonical name (kebab-case, e.g. oss-bounty)"
                      value={entry.canonical_name}
                      onInput={(e) => updateOntologyEntry(idx(), "canonical_name", e.currentTarget.value)}
                    />
                    <input
                      class="bg-surface-base border border-border-base rounded px-2 py-1.5 text-12-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                      placeholder="Definition"
                      value={entry.definition}
                      onInput={(e) => updateOntologyEntry(idx(), "definition", e.currentTarget.value)}
                    />
                  </div>
                )}
              </For>
              <button
                type="button"
                class="self-start text-12-regular text-text-info hover:underline"
                onClick={addOntologyEntry}
              >
                + Add term
              </button>
            </div>
          </Show>

          {/* Contracts Tab */}
          <Show when={activeTab() === "contracts"}>
            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-1">
                <span class="text-12-medium text-text-base">TypeScript Interfaces</span>
                <textarea
                  class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-12-regular font-mono text-text-strong focus:outline-none focus:border-border-focus-base resize-none"
                  rows={14}
                  placeholder={"interface MyEntity {\n  id: string\n  // …\n}"}
                  value={contracts()}
                  onInput={(e) => setContracts(e.currentTarget.value)}
                  spellcheck={false}
                />
              </label>
            </div>
          </Show>

          {/* Rules Tab */}
          <Show when={activeTab() === "rules"}>
            <div class="flex flex-col gap-3">
              <p class="text-12-regular text-text-weak">Inviolable constraints the AI must always respect.</p>
              <For each={constraints()}>
                {(constraint, idx) => (
                  <div class="flex flex-col gap-2 p-3 rounded-lg border border-border-base bg-surface-raised-base">
                    <div class="flex items-center justify-between">
                      <span class="text-11-medium text-text-weak">Rule {idx() + 1}</span>
                      <button
                        type="button"
                        class="text-11-regular text-text-weak hover:text-text-critical"
                        onClick={() => removeConstraint(idx())}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      class="bg-surface-base border border-border-base rounded px-2 py-1.5 text-12-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                      placeholder="Rule (e.g. Never mutate state directly)"
                      value={constraint.rule}
                      onInput={(e) => updateConstraint(idx(), "rule", e.currentTarget.value)}
                    />
                    <input
                      class="bg-surface-base border border-border-base rounded px-2 py-1.5 text-12-regular text-text-strong focus:outline-none focus:border-border-focus-base"
                      placeholder="Reason (e.g. CQRS pattern)"
                      value={constraint.reason}
                      onInput={(e) => updateConstraint(idx(), "reason", e.currentTarget.value)}
                    />
                  </div>
                )}
              </For>
              <button
                type="button"
                class="self-start text-12-regular text-text-info hover:underline"
                onClick={addConstraint}
              >
                + Add rule
              </button>
            </div>
          </Show>

          {/* Architecture Tab */}
          <Show when={activeTab() === "architecture"}>
            <div class="flex flex-col gap-4">
              <label class="flex flex-col gap-1">
                <span class="text-12-medium text-text-base">Architecture Diagram (Mermaid)</span>
                <textarea
                  class="bg-surface-raised-base border border-border-base rounded-md px-3 py-2 text-12-regular font-mono text-text-strong focus:outline-none focus:border-border-focus-base resize-none"
                  rows={14}
                  placeholder={"graph TD\n  A[Client] --> B[API]\n  B --> C[DB]"}
                  value={architecture()}
                  onInput={(e) => setArchitecture(e.currentTarget.value)}
                  spellcheck={false}
                />
              </label>
            </div>
          </Show>

        </div>

        {/* Footer */}
        <div class="shrink-0 px-6 py-4 border-t border-border-base flex flex-col gap-2">
          <Show when={error()}>
            <p class="text-12-regular text-text-critical">{error()}</p>
          </Show>
          <div class="flex items-center justify-end gap-3">
            <button
              type="button"
              class="px-4 py-2 text-13-regular text-text-weak hover:text-text-base transition-colors"
              onClick={props.onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving()}
              class="px-4 py-2 rounded-md bg-surface-raised-base border border-border-base text-13-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors disabled:opacity-50"
            >
              {saving() ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
