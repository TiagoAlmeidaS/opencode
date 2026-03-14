import type { Pipeline } from "./types"

const strategies = new Map<string, Pipeline>()

export function registerPipeline(pipeline: Pipeline) {
  strategies.set(pipeline.strategy, pipeline)
}

export function getPipeline(strategy: string): Pipeline | undefined {
  return strategies.get(strategy)
}

export function listPipelineStrategies(): string[] {
  return Array.from(strategies.keys())
}

export function clearRegistry() {
  strategies.clear()
}
