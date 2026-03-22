import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("OPENCODE_APP_DIST static middleware vs API routes", () => {
  test("GET /agent returns JSON array, not index.html", async () => {
    await using tmp = await tmpdir({ git: true, config: { model: "openai/gpt-4.1" } })
    await using dist = await tmpdir()
    await Bun.write(path.join(dist.path, "index.html"), "<!doctype html><title>spa</title>")

    const prev = process.env.OPENCODE_APP_DIST
    process.env.OPENCODE_APP_DIST = dist.path

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.createApp({})
        const res = await app.request("/agent", {
          headers: { "x-opencode-directory": tmp.path },
        })
        expect(res.status).toBe(200)
        const ct = res.headers.get("content-type") ?? ""
        expect(ct.includes("application/json")).toBe(true)
        const text = await res.text()
        expect(text.trimStart().startsWith("[")).toBe(true)
        expect(text.includes("<!doctype")).toBe(false)
      },
    })

    process.env.OPENCODE_APP_DIST = prev
  })

  test("GET /file returns JSON, not index.html", async () => {
    await using tmp = await tmpdir({ git: true, config: { model: "openai/gpt-4.1" } })
    await using dist = await tmpdir()
    await Bun.write(path.join(dist.path, "index.html"), "<!doctype html><title>spa</title>")

    const prev = process.env.OPENCODE_APP_DIST
    process.env.OPENCODE_APP_DIST = dist.path

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.createApp({})
        const url = `/file?path=${encodeURIComponent(tmp.path)}`
        const res = await app.request(url, {
          headers: { "x-opencode-directory": tmp.path },
        })
        expect(res.status).toBe(200)
        const ct = res.headers.get("content-type") ?? ""
        expect(ct.includes("application/json")).toBe(true)
        const text = await res.text()
        expect(text.trimStart().startsWith("<!")).toBe(false)
      },
    })

    process.env.OPENCODE_APP_DIST = prev
  })
})
