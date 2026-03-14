/**
 * Simple 5-field cron match (minute hour day_of_month month day_of_week).
 * Supports * and numeric values. Used by scheduler to decide if a pipeline should run.
 */
export function cronMatches(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return false
  const [min, hour, dom, month, dow] = parts
  const minV = date.getMinutes()
  const hourV = date.getHours()
  const domV = date.getDate()
  const monthV = date.getMonth() + 1
  const dowV = date.getDay()

  return (
    matchField(min, minV, 0, 59) &&
    matchField(hour, hourV, 0, 23) &&
    matchField(dom, domV, 1, 31) &&
    matchField(month, monthV, 1, 12) &&
    matchField(dow, dowV, 0, 6)
  )
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true
  for (const part of field.split(",")) {
    const p = part.trim()
    if (p.startsWith("*/")) {
      const step = parseInt(p.slice(2), 10)
      if (!Number.isNaN(step) && step > 0 && value % step === 0) return true
    } else {
      const v = parseInt(p, 10)
      if (!Number.isNaN(v) && v >= min && v <= max && v === value) return true
    }
  }
  return false
}
