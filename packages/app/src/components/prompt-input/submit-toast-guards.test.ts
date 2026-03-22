import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import type { Prompt } from "@/context/prompt"

let createPromptSubmit: typeof import("./submit").createPromptSubmit

const promptValue: Prompt = [{ type: "text", content: "ls", start: 0, end: 2 }]
const toastTitles: string[] = []

type AgentRow = { name: string; mode?: string; hidden?: boolean }

let scenario: "no-providers" | "bootstrap-partial" | "only-subagents" = "no-providers"
let rawAgents: AgentRow[] = []
let syncStatus: "complete" | "partial" | "loading" = "complete"

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useNavigate: () => () => undefined,
    useParams: () => ({}),
  }))

  mock.module("@opencode-ai/sdk/v2/client", () => ({
    createOpencodeClient: () => ({
      session: {
        create: async () => ({ data: { id: "s1", title: "t" } }),
        shell: async () => ({ data: undefined }),
        prompt: async () => ({ data: undefined }),
        promptAsync: async () => ({ data: undefined }),
        command: async () => ({ data: undefined }),
        abort: async () => ({ data: undefined }),
      },
      worktree: {
        create: async () => ({ data: { directory: "/x/new" } }),
      },
    }),
  }))

  mock.module("@opencode-ai/ui/toast", () => ({
    showToast: (opts: { title: string }) => {
      toastTitles.push(opts.title)
      return 0
    },
  }))

  mock.module("@opencode-ai/util/encode", () => ({
    base64Encode: (value: string) => value,
  }))

  mock.module("@/hooks/use-providers", () => ({
    useProviders: () => ({
      connected: () => (scenario === "no-providers" ? [] : [{ id: "openai" }]),
    }),
  }))

  mock.module("@/context/local", () => ({
    useLocal: () => {
      const list = () => rawAgents.filter((a) => a.mode !== "subagent" && !a.hidden)
      return {
        model: {
          current: () => undefined,
          variant: { current: () => undefined },
        },
        agent: {
          current: () => undefined,
          list,
        },
        session: {
          promote: () => undefined,
        },
      }
    },
  }))

  mock.module("@/context/permission", () => ({
    usePermission: () => ({
      enableAutoAccept: () => undefined,
    }),
  }))

  mock.module("@/context/prompt", () => ({
    usePrompt: () => ({
      current: () => promptValue,
      reset: () => undefined,
      set: () => undefined,
      context: {
        add: () => undefined,
        remove: () => undefined,
        items: () => [],
      },
    }),
  }))

  mock.module("@/context/layout", () => ({
    useLayout: () => ({
      handoff: {
        setTabs: () => undefined,
      },
    }),
  }))

  mock.module("@/context/sdk", () => ({
    useSDK: () => ({
      directory: "/proj",
      client: {
        session: {
          create: async () => ({ data: { id: "s1", title: "t" } }),
          shell: async () => ({ data: undefined }),
          prompt: async () => ({ data: undefined }),
          promptAsync: async () => ({ data: undefined }),
          command: async () => ({ data: undefined }),
          abort: async () => ({ data: undefined }),
        },
        worktree: {
          create: async () => ({ data: { directory: "/proj/w" } }),
        },
      },
      url: "http://localhost:4096",
      createClient: () => ({
        session: {
          create: async () => ({ data: { id: "s1", title: "t" } }),
          shell: async () => ({ data: undefined }),
          prompt: async () => ({ data: undefined }),
          promptAsync: async () => ({ data: undefined }),
          command: async () => ({ data: undefined }),
          abort: async () => ({ data: undefined }),
        },
        worktree: {
          create: async () => ({ data: { directory: "/proj/w" } }),
        },
      }),
    }),
  }))

  mock.module("@/context/sync", () => ({
    useSync: () => ({
      ready: syncStatus !== "loading",
      status: syncStatus,
      data: {
        agent: rawAgents,
        command: [],
      },
      session: {
        optimistic: {
          add: () => undefined,
          remove: () => undefined,
        },
      },
      set: () => undefined,
    }),
  }))

  mock.module("@/context/global-sync", () => ({
    useGlobalSync: () => ({
      child: () => [{ session: [] }, () => undefined],
      todo: { set: () => undefined },
    }),
  }))

  mock.module("@/context/platform", () => ({
    usePlatform: () => ({
      fetch,
    }),
  }))

  mock.module("@/context/language", () => ({
    useLanguage: () => ({
      t: (key: string) => key,
    }),
  }))

  const mod = await import("./submit")
  createPromptSubmit = mod.createPromptSubmit
})

beforeEach(() => {
  toastTitles.length = 0
  scenario = "no-providers"
  rawAgents = []
  syncStatus = "complete"
})

describe("prompt submit guard toasts", () => {
  test("shows noConnectedProviders when no provider is connected", async () => {
    scenario = "no-providers"
    syncStatus = "complete"

    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => "/proj",
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(toastTitles).toContain("prompt.toast.noConnectedProviders.title")
  })

  test("shows bootstrapFailed when bootstrap is partial and agents are empty", async () => {
    scenario = "bootstrap-partial"
    syncStatus = "partial"
    rawAgents = []

    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => "/proj",
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(toastTitles).toContain("prompt.toast.bootstrapFailed.title")
  })

  test("shows noAgentsAvailable when only subagent modes exist", async () => {
    scenario = "only-subagents"
    syncStatus = "complete"
    rawAgents = [{ name: "explore", mode: "subagent" }]

    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => "/proj",
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(toastTitles).toContain("prompt.toast.noAgentsAvailable.title")
  })
})
