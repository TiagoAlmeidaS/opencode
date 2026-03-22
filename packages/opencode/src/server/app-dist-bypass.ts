/**
 * Path prefixes that must call `next()` instead of serving SPA assets when
 * `OPENCODE_APP_DIST` is set. Missing a real API route here makes the client
 * receive `index.html` and break JSON parsing (e.g. GET /agent).
 */
export const APP_DIST_API_PREFIXES: readonly string[] = [
  "/global",
  "/auth",
  "/doc",
  "/project",
  "/pty",
  "/config",
  "/experimental",
  "/session",
  "/permission",
  "/question",
  "/provider",
  "/mcp",
  "/tui",
  "/server",
  "/path",
  "/event",
  "/instance",
  "/openapi",
  "/agent",
  "/command",
  "/log",
  "/vcs",
  "/skill",
  "/lsp",
  "/formatter",
  "/file",
  "/find",
  "/github",
]
