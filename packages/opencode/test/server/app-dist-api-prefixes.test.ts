import { describe, expect, test } from "bun:test"
import { APP_DIST_API_PREFIXES } from "../../src/server/app-dist-bypass"

describe("APP_DIST_API_PREFIXES", () => {
  test("includes API routes required when OPENCODE_APP_DIST serves the SPA", () => {
    const required = ["/agent", "/file", "/find", "/provider", "/session", "/github", "/global"]
    for (const prefix of required) {
      expect(APP_DIST_API_PREFIXES).toContain(prefix)
    }
  })
})
