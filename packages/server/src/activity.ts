import type { Activity } from "./types"

const registry = new Map<string, Activity>()

export function registerActivity(a: Activity) {
  registry.set(a.type, a)
}

export function getActivity(type: string): Activity | undefined {
  return registry.get(type)
}

export function listActivityTypes(): string[] {
  return Array.from(registry.keys())
}

export function listActivities(): Activity[] {
  return Array.from(registry.values())
}
