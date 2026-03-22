/**
 * Map common Azure OpenAI env names (e.g. in .env.server) to the names the
 * OpenCode provider catalog expects (`AZURE_API_KEY`, `AZURE_RESOURCE_NAME`).
 * Does not override values already set.
 */
export function applyAzureOpenAiEnvAliases(): void {
  const openaiKey = process.env.AZURE_OPENAI_API_KEY
  if (openaiKey && !process.env.AZURE_API_KEY) process.env.AZURE_API_KEY = openaiKey

  const baseUrl = process.env.AZURE_OPENAI_BASE_URL
  if (!baseUrl || process.env.AZURE_RESOURCE_NAME) return
  try {
    const name = new URL(baseUrl).hostname.split(".")[0]
    if (name) process.env.AZURE_RESOURCE_NAME = name
  } catch {
    /* ignore invalid URL */
  }
}
