import type { Vec3 } from '../ksa/types'
import type { MeasurementUnit } from '../state/measurementStore'

/**
 * Length formatting for measurement readouts. Values are stored in meters (KSA
 * native); the display unit is a user setting. Pure — unit-tested.
 */

const FACTORS: Record<MeasurementUnit, number> = { m: 1, cm: 100, mm: 1000 }
/** Decimal places per unit, chosen so each unit shows a useful sub-unit resolution. */
const DECIMALS: Record<MeasurementUnit, number> = { m: 3, cm: 1, mm: 0 }

/** Formats a length in meters as a string in the given unit, e.g. `1.250 m`. */
export function formatLength(meters: number, unit: MeasurementUnit): string {
  const value = meters * FACTORS[unit]
  return `${value.toFixed(DECIMALS[unit])} ${unit}`
}

/** Formats a length in meters as a bare number string (no unit suffix). */
export function formatLengthValue(meters: number, unit: MeasurementUnit): string {
  return (meters * FACTORS[unit]).toFixed(DECIMALS[unit])
}

/** Formats a Vec3 of meters as `x × y × z` in the given unit. */
export function formatVec(v: Vec3, unit: MeasurementUnit): string {
  return [v.x, v.y, v.z].map((c) => formatLengthValue(c, unit)).join(' × ') + ` ${unit}`
}
