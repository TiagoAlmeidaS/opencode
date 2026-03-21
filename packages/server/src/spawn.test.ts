/**
 * Unit tests — spawn.ts
 *
 * Testa que spawnOpenCode constrói os args corretamente,
 * especialmente a flag --model introduzida na v2.0.0.
 */
import { describe, test, expect, spyOn, afterEach } from "bun:test"
import { spawnOpenCode } from "./spawn"

// ─── Helper: mock proc compatível com o código do spawn.ts ──────────────────

function makeMockProc(exitCode = 0, stdout = "cli output", stderr = "") {
  return {
    stdout: new ReadableStream<Uint8Array>({
      start(c) {
        if (stdout) c.enqueue(new TextEncoder().encode(stdout))
        c.close()
      },
    }),
    stderr: new ReadableStream<Uint8Array>({
      start(c) {
        if (stderr) c.enqueue(new TextEncoder().encode(stderr))
        c.close()
      },
    }),
    exited: Promise.resolve(exitCode),
    exitCode,
    kill: () => {},
  }
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe("spawnOpenCode — construção de args", () => {
  const capturedCalls: { args: string[]; cwd: string }[] = []
  let spawnSpy: ReturnType<typeof spyOn>

  afterEach(() => {
    capturedCalls.length = 0
    spawnSpy?.mockRestore()
  })

  function setupSpy(exitCode = 0) {
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(((
      args: string[],
      opts: { cwd: string },
    ) => {
      capturedCalls.push({ args, cwd: opts.cwd })
      return makeMockProc(exitCode)
    }) as never)
  }

  test("inclui --model quando opts.model é fornecido", async () => {
    setupSpy()

    await spawnOpenCode("implement feature X", "/tmp/repo", { model: "anthropic/claude-sonnet-4-5" })

    expect(capturedCalls).toHaveLength(1)
    const args = capturedCalls[0].args
    expect(args).toContain("--model")
    expect(args).toContain("anthropic/claude-sonnet-4-5")
    expect(args.indexOf("--model")).toBe(args.indexOf("anthropic/claude-sonnet-4-5") - 1)
  })

  test("NÃO inclui --model quando opts.model é undefined", async () => {
    setupSpy()

    await spawnOpenCode("implement feature X", "/tmp/repo", { model: undefined })

    expect(capturedCalls).toHaveLength(1)
    const args = capturedCalls[0].args
    expect(args).not.toContain("--model")
  })

  test("NÃO inclui --model quando opts não é fornecido", async () => {
    setupSpy()

    await spawnOpenCode("implement feature X", "/tmp/repo")

    expect(capturedCalls).toHaveLength(1)
    const args = capturedCalls[0].args
    expect(args).not.toContain("--model")
  })

  test("sempre inclui 'run' e '--task' nos args", async () => {
    setupSpy()

    await spawnOpenCode("minha tarefa", "/tmp/dir")

    const args = capturedCalls[0].args
    expect(args).toContain("run")
    expect(args).toContain("--task")
    expect(args).toContain("minha tarefa")
    expect(args.indexOf("--task")).toBe(args.indexOf("minha tarefa") - 1)
  })

  test("--model é adicionado depois de --task na lista de args", async () => {
    setupSpy()

    await spawnOpenCode("task", "/tmp/dir", { model: "kimi/moonshot-v1-128k" })

    const args = capturedCalls[0].args
    const taskIdx = args.indexOf("--task")
    const modelIdx = args.indexOf("--model")
    expect(taskIdx).toBeLessThan(modelIdx)
  })

  test("retorna o output da CLI no campo .output", async () => {
    setupSpy(0)

    const result = await spawnOpenCode("task", "/tmp/dir")

    expect(result.output).toBe("cli output")
  })

  test("lança erro quando exitCode !== 0", async () => {
    setupSpy(1) // simula falha

    await expect(spawnOpenCode("task", "/tmp/dir")).rejects.toThrow(
      "OpenCode CLI exited with code 1",
    )
  })

  test("passa cwd corretamente para Bun.spawn", async () => {
    setupSpy()

    await spawnOpenCode("task", "/my/project/dir")

    expect(capturedCalls[0].cwd).toBe("/my/project/dir")
  })
})

describe("spawnOpenCode — compatibilidade com provider/model strings", () => {
  afterEach(() => {
    // cleanup handled by afterEach above
  })

  const modelStrings = [
    "anthropic/claude-sonnet-4-5",
    "openai/gpt-4o-mini",
    "kimi/moonshot-v1-128k",
    "openai-compatible/deepseek-coder",
  ]

  for (const model of modelStrings) {
    test(`aceita model string: ${model}`, async () => {
      const spy = spyOn(Bun, "spawn").mockImplementation((() => makeMockProc()) as never)

      await spawnOpenCode("task", "/tmp", { model })

      const args = (spy.mock.calls[0] as [string[]])[0]
      expect(args).toContain("--model")
      expect(args).toContain(model)

      spy.mockRestore()
    })
  }
})
