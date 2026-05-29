import { atom } from 'nanostores'
import { persistentJSON } from '@nanostores/persistent'
import type { Vec3 } from '../ksa/types'

/**
 * Measurement state (nanostores). Like {@link editorStore} this has no React /
 * three.js imports: the three.js layer ({@link MeasurementLayer}) subscribes and
 * renders, React reads via `useStore`.
 *
 * Measurements are an EDITOR AID only — they are never written to the exported
 * KSA XML (that serializes `EditingPart`). Placed line measurements persist with
 * the project (see projectStore); display settings are a global user pref.
 */

export type MeasurementUnit = 'm' | 'cm' | 'mm'
export type BoundsMode = 'world' | 'oriented'
export type AxisLock = 'none' | 'x' | 'y' | 'z'
/** Active click-to-create interaction (ephemeral). */
export type MeasureTool = 'none' | 'point' | 'meshDistance'

/** A placed line measurement (reference line or point-to-point). Persisted, never exported. */
export interface LineMeasurement {
  id: string
  /** Endpoint A in world/part meters. */
  a: Vec3
  /** Endpoint B in world/part meters. */
  b: Vec3
  /** Constrains the line direction to an axis when not 'none'. */
  axisLock: AxisLock
  /** Hex color, e.g. '#38bdf8'. */
  color: string
  /** When locked, editing gizmos/inputs are hidden and the line is read-only. */
  locked: boolean
  /** Creation method; rendering is identical. */
  source: 'reference' | 'point'
}

export interface MeasurementSettings {
  unit: MeasurementUnit
  boundsMode: BoundsMode
  showSelectionBounds: boolean
  showPerMesh: boolean
  /** When on and exactly two meshes are selected, show the gap between them. */
  showMeshDistance: boolean
}

/** Computed AABB/OBB of the current selection, written by {@link MeasurementLayer}. */
export interface SelectionBounds {
  size: Vec3
  min: Vec3
  max: Vec3
  mode: BoundsMode
}

const DEFAULT_COLOR = '#38bdf8'

/** Placed line measurements (persisted with the project, never exported). */
export const $measurements = atom<LineMeasurement[]>([])

/** Global display settings (localStorage, not per-project — like $grids). */
export const $measurementSettings = persistentJSON<MeasurementSettings>('flexo:measure', {
  unit: 'm',
  boundsMode: 'world',
  showSelectionBounds: true,
  showPerMesh: false,
  showMeshDistance: false,
})

/** Active click-to-create tool (ephemeral). */
export const $measureTool = atom<MeasureTool>('none')

/** Currently-edited measurement id (ephemeral). */
export const $activeMeasurementId = atom<string | null>(null)

/** Which endpoint the editing gizmo controls (ephemeral). */
export const $activeEndpoint = atom<'a' | 'b'>('b')

/** Selection bounds, written by the three layer; read by the React info display. */
export const $selectionBounds = atom<SelectionBounds | null>(null)

function newId(): string {
  return crypto.randomUUID()
}

/** Adds a measurement and makes it the active (editable) one. Returns its id. */
export function addMeasurement(
  m: Omit<LineMeasurement, 'id' | 'color' | 'locked' | 'axisLock'> &
    Partial<Pick<LineMeasurement, 'color' | 'locked' | 'axisLock'>>,
): string {
  const id = newId()
  const measurement: LineMeasurement = {
    id,
    a: m.a,
    b: m.b,
    source: m.source,
    axisLock: m.axisLock ?? 'none',
    color: m.color ?? DEFAULT_COLOR,
    locked: m.locked ?? false,
  }
  $measurements.set([...$measurements.get(), measurement])
  $activeMeasurementId.set(id)
  return id
}

export function updateMeasurement(id: string, patch: Partial<Omit<LineMeasurement, 'id'>>): void {
  $measurements.set($measurements.get().map((m) => (m.id === id ? { ...m, ...patch } : m)))
}

export function removeMeasurement(id: string): void {
  $measurements.set($measurements.get().filter((m) => m.id !== id))
  if ($activeMeasurementId.get() === id) $activeMeasurementId.set(null)
}

export function setMeasurementLocked(id: string, locked: boolean): void {
  updateMeasurement(id, { locked })
}

export function setMeasurementSettings(patch: Partial<MeasurementSettings>): void {
  $measurementSettings.set({ ...$measurementSettings.get(), ...patch })
}

export function setMeasureTool(tool: MeasureTool): void {
  $measureTool.set(tool)
}

export function setActiveMeasurement(id: string | null): void {
  $activeMeasurementId.set(id)
}

export function setActiveEndpoint(end: 'a' | 'b'): void {
  $activeEndpoint.set(end)
}

/** Adds a 1m reference line centered on `center` (defaults to the origin), along X. */
export function addReferenceLine(center: Vec3 = { x: 0, y: 0, z: 0 }): string {
  return addMeasurement({
    source: 'reference',
    a: { x: center.x - 0.5, y: center.y, z: center.z },
    b: { x: center.x + 0.5, y: center.y, z: center.z },
  })
}

/** Re-aligns endpoint `b` so the segment is parallel to `axis` (keeps b's axis component). */
export function snappedToAxis(a: Vec3, b: Vec3, axis: AxisLock): Vec3 {
  if (axis === 'none') return b
  return {
    x: axis === 'x' ? b.x : a.x,
    y: axis === 'y' ? b.y : a.y,
    z: axis === 'z' ? b.z : a.z,
  }
}
