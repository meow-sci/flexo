/** Numeric display helpers shared by the inspector-style panels. */

export const RAD2DEG = 180 / Math.PI
export const DEG2RAD = Math.PI / 180

/** Format a number for display: round to ~5 decimals, drop trailing zeros. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 1e5) / 1e5)
}
