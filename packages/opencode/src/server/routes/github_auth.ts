import { Hono } from "hono"
import { lazy } from "../../util/lazy"

function parseTokenBody(raw: string): Record<string, unknown> | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const c0 = t[0]
  if (c0 === "{" || c0 === "[") {
    try {
      return JSON.parse(t) as Record<string, unknown>
    } catch {
      return undefined
    }
  }
  if (t.includes("=")) {
    const p = new URLSearchParams(t)
    const o: Record<string, unknown> = {}
    for (const [k, v] of p) o[k] = v
    if (Object.keys(o).length > 0) return o
  }
  try {
    return JSON.parse(t) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function intervalField(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/**
 * GitHub OAuth Device Flow proxy.
 *
 * Required server env var:
 *   GITHUB_OAUTH_CLIENT_ID – OAuth App or GitHub App client ID (device flow enabled)
 *
 * GitHub **Apps** use only `client_id` on `POST /login/device/code` (no `scope`).
 * Set `GITHUB_OAUTH_SKIP_SCOPE=1` or `GITHUB_OAUTH_SCOPES=` (empty, if your env loader keeps it).
 * Omit both to send default `repo read:user` (classic OAuth Apps).
 *
 * If `GITHUB_OAUTH_CLIENT_SECRET` is set, it is sent on the token poll (helps some registrations).
 *
 * Flutter only receives the access_token after the user authorises on github.com/login/device.
 */
export const GithubAuthRoutes = lazy(() =>
  new Hono()
    /**
     * POST /github/auth/start
     * Initiates the Device Flow. Returns the user_code the user must enter
     * at github.com/login/device and the device_code used for polling.
     */
    .post("/start", async (c) => {
      const clientId = process.env["GITHUB_OAUTH_CLIENT_ID"]
      if (!clientId) {
        return c.json({ error: "GITHUB_OAUTH_CLIENT_ID not configured on this server" }, 503)
      }

      const startForm = new URLSearchParams({ client_id: clientId })
      const skip =
        process.env["GITHUB_OAUTH_SKIP_SCOPE"] === "1" ||
        process.env["GITHUB_OAUTH_SKIP_SCOPE"] === "true"
      const scoped = process.env["GITHUB_OAUTH_SCOPES"]
      if (!skip) {
        if (scoped === undefined) startForm.set("scope", "repo read:user")
        else if (scoped !== "") startForm.set("scope", scoped)
      }
      const r = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: startForm.toString(),
      })

      if (!r.ok) return c.json({ error: `GitHub returned ${r.status}` }, 502)

      const data = (await r.json()) as Record<string, unknown>
      return c.json({
        deviceCode: data["device_code"],
        userCode: data["user_code"],
        verificationUri: data["verification_uri"],
        expiresIn: data["expires_in"],
        interval: (data["interval"] as number) ?? 5,
      })
    })

    /**
     * POST /github/auth/poll
     * Body: { deviceCode: string }
     * Returns: { status: "pending" | "slow_down" | "done" | "expired" | "denied" | "error", token?: string, error?: string, interval?: number }
     */
    .post("/poll", async (c) => {
      const clientId = process.env["GITHUB_OAUTH_CLIENT_ID"]
      if (!clientId) {
        return c.json({ status: "error", error: "GitHub OAuth not configured on this server" }, 503)
      }

      let deviceCode: string
      try {
        const body = (await c.req.json()) as { deviceCode?: string }
        if (!body.deviceCode) return c.json({ status: "error", error: "deviceCode required" }, 400)
        deviceCode = String(body.deviceCode).trim()
        if (!deviceCode) return c.json({ status: "error", error: "deviceCode required" }, 400)
      } catch {
        return c.json({ status: "error", error: "Invalid JSON body" }, 400)
      }

      const tokenForm = new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      })
      const secret = process.env["GITHUB_OAUTH_CLIENT_SECRET"]
      if (secret) tokenForm.set("client_secret", secret)
      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenForm.toString(),
      })

      const raw = await r.text()
      const data = parseTokenBody(raw)
      if (!data)
        return c.json({ status: "error", error: `GitHub returned ${r.status} (unparseable body)` }, 502)

      const tok = data["access_token"]
      if (typeof tok === "string" && tok.length > 0) return c.json({ status: "done", token: tok })

      const error = typeof data["error"] === "string" ? data["error"] : undefined
      if (error === "authorization_pending") return c.json({ status: "pending" })
      if (error === "slow_down") {
        const next = intervalField(data["interval"])
        return c.json({ status: "slow_down", ...(next !== undefined ? { interval: next } : {}) })
      }
      if (error === "expired_token" || error === "token_expired") return c.json({ status: "expired" })
      if (error === "access_denied") return c.json({ status: "denied" })
      if (error === "bad_verification_code" || error === "incorrect_device_code") {
        return c.json({
          status: "error",
          error: "GitHub rejected the device code (wrong app, expired, or restart sign-in).",
        })
      }
      if (!r.ok)
        return c.json({ status: "error", error: error ?? `GitHub returned ${r.status}` }, 502)
      return c.json({ status: "error", error: error ?? "unknown" })
    }),
)
