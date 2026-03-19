import { Hono } from "hono"
import { lazy } from "../../util/lazy"

/**
 * GitHub OAuth Device Flow proxy.
 *
 * Required server env vars:
 *   GITHUB_OAUTH_CLIENT_ID     – OAuth App / GitHub App client ID
 *   GITHUB_OAUTH_CLIENT_SECRET – OAuth App / GitHub App client secret
 *
 * The client secret never leaves the server; Flutter only receives the
 * final access_token after the user authorises on github.com/login/device.
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

      const r = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, scope: "repo,read:user" }),
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
     * Returns: { status: "pending" | "done" | "expired" | "denied" | "error", token?: string, error?: string }
     */
    .post("/poll", async (c) => {
      const clientId = process.env["GITHUB_OAUTH_CLIENT_ID"]
      const clientSecret = process.env["GITHUB_OAUTH_CLIENT_SECRET"]
      if (!clientId || !clientSecret) {
        return c.json({ status: "error", error: "GitHub OAuth not configured on this server" }, 503)
      }

      let deviceCode: string
      try {
        const body = (await c.req.json()) as { deviceCode?: string }
        if (!body.deviceCode) return c.json({ status: "error", error: "deviceCode required" }, 400)
        deviceCode = body.deviceCode
      } catch {
        return c.json({ status: "error", error: "Invalid JSON body" }, 400)
      }

      const r = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      })

      if (!r.ok) return c.json({ status: "error", error: `GitHub returned ${r.status}` }, 502)

      const data = (await r.json()) as Record<string, unknown>

      if (data["access_token"]) return c.json({ status: "done", token: data["access_token"] })

      const error = data["error"] as string | undefined
      if (error === "authorization_pending" || error === "slow_down") return c.json({ status: "pending" })
      if (error === "expired_token") return c.json({ status: "expired" })
      if (error === "access_denied") return c.json({ status: "denied" })
      return c.json({ status: "error", error: error ?? "unknown" })
    }),
)
