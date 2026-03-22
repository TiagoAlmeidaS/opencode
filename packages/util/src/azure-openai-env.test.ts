import { describe, expect, test } from "bun:test"
import { applyAzureOpenAiEnvAliases } from "./azure-openai-env"

describe("applyAzureOpenAiEnvAliases", () => {
  const keys = [
    "AZURE_OPENAI_API_KEY",
    "AZURE_API_KEY",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_RESOURCE_NAME",
  ] as const

  const snapshot = () =>
    Object.fromEntries(keys.map((k) => [k, process.env[k]])) as Record<(typeof keys)[number], string | undefined>

  const restore = (prev: Record<(typeof keys)[number], string | undefined>) => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
  }

  test("maps AZURE_OPENAI_API_KEY to AZURE_API_KEY when AZURE_API_KEY is unset", () => {
    const prev = snapshot()
    delete process.env.AZURE_API_KEY
    process.env.AZURE_OPENAI_API_KEY = "k-from-openai"
    applyAzureOpenAiEnvAliases()
    const key = process.env["AZURE_API_KEY"]
    expect(key === "k-from-openai").toBe(true)
    restore(prev)
  })

  test("does not override existing AZURE_API_KEY", () => {
    const prev = snapshot()
    process.env.AZURE_API_KEY = "existing"
    process.env.AZURE_OPENAI_API_KEY = "other"
    applyAzureOpenAiEnvAliases()
    expect(process.env["AZURE_API_KEY"] === "existing").toBe(true)
    restore(prev)
  })

  test("derives AZURE_RESOURCE_NAME from AZURE_OPENAI_BASE_URL hostname when unset", () => {
    const prev = snapshot()
    delete process.env.AZURE_RESOURCE_NAME
    process.env.AZURE_OPENAI_BASE_URL = "https://myresource.openai.azure.com/openai/v1"
    applyAzureOpenAiEnvAliases()
    const name = process.env["AZURE_RESOURCE_NAME"]
    expect(name === "myresource").toBe(true)
    restore(prev)
  })
})
