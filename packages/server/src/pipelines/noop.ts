import type { Pipeline } from "../types"
import { registerPipeline } from "../registry"

const noop: Pipeline = {
  strategy: "noop",
  displayName: "No-op (placeholder)",
  async execute(ctx) {
    return {
      contentType: "article",
      platform: "local",
      title: `Noop run ${ctx.jobId}`,
      status: "draft",
    }
  },
}

registerPipeline(noop)
