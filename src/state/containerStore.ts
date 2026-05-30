import { atom } from 'nanostores'
import { persistentJSON } from '@nanostores/persistent'
import type { Vec3 } from '../ksa/types'

/**
 * Reference-container state (nanostores). Like {@link measurementStore} this has
 * no React / three.js imports: the three.js layer ({@link ContainerLayer})
 * subscribes and renders, React reads via `useStore`.
 *
 * Containers are an EDITOR AID only — rect / cylinder / sphere shapes used as a
 * visual working-area reference. They are never written to the exported KSA XML.
 * Placed containers persist with the project (see projectStore); the warn-precision
 * setting is a global user pref.
 */

export type ReferenceShape = 'rect' | 'cylinder' | 'sphere'
/** Which method is used to test whether part meshes leave a container. */
export type WarnPrecision = 'bbox' | 'vertex'
/** Active gizmo mode for the edited container (ephemeral). */
export type ContainerGizmoMode = 'translate' | 'rotate' | 'scale'

/** A placed reference container. Persisted, never exported. */
export interface ReferenceContainer {
  id: string
  shape: ReferenceShape
  /** Center in world/part meters. */
  center: Vec3
  /** Orientation as a quaternion [x, y, z, w]. */
  rotation: [number, number, number, number]
  /**
   * Full extents in meters. rect: width/height/depth; cylinder: x=z=diameter,
   * y=height; sphere: x=y=z=diameter. Constrained via {@link normalizeSize}.
   */
  size: Vec3
  /**
   * Number of wireframe lines drawn across a curved surface (cylinder: vertical
   * struts on the side; sphere: meridian + parallel rings). Ignored for rect.
   */
  segments: number
  /** Outline hex color, e.g. '#38bdf8'. */
  color: string
  /** Outline opacity 0..1. */
  lineOpacity: number
  /** Outline thickness in px (fat-line linewidth). */
  lineWidth: number
  /** When locked, editing gizmos/inputs are hidden and the container is read-only. */
  locked: boolean
  /** When on, regions that part meshes exceed are highlighted translucent. */
  warnEnabled: boolean
  /** Warning highlight hex color (default red). */
  warnColor: string
  /** Warning highlight opacity 0..1. */
  warnOpacity: number
}

export interface ContainerSettings {
  /** Global precision of the containment test (fast bbox vs accurate per-vertex). */
  warnPrecision: WarnPrecision
}

const DEFAULT_COLOR = '#38bdf8'
const DEFAULT_WARN_COLOR = '#ef4444'

/** Placed reference containers (persisted with the project, never exported). */
export const $containers = atom<ReferenceContainer[]>([])

/** Global settings (localStorage, not per-project — like $measurementSettings). */
export const $containerSettings = persistentJSON<ContainerSettings>('flexo:containers', {
  warnPrecision: 'bbox',
})

/** Currently-edited container id (ephemeral). */
export const $activeContainerId = atom<string | null>(null)

/** Gizmo mode for the active container (ephemeral). */
export const $containerGizmoMode = atom<ContainerGizmoMode>('translate')

function newId(): string {
  return crypto.randomUUID()
}

/**
 * Constrains a size to its shape's valid form: cylinder keeps x=z (a circular
 * cross-section, using the larger of the two), sphere is uniform. Used by both
 * the numeric inputs and the scale gizmo so a non-uniform drag snaps back.
 */
export function normalizeSize(shape: ReferenceShape, size: Vec3): Vec3 {
  if (shape === 'cylinder') {
    const d = Math.max(size.x, size.z)
    return { x: d, y: size.y, z: d }
  }
  if (shape === 'sphere') {
    const d = Math.max(size.x, size.y, size.z)
    return { x: d, y: d, z: d }
  }
  return size
}

/** Adds a 1m default-sized container at the origin and makes it active. Returns its id. */
export function addContainer(shape: ReferenceShape): string {
  const id = newId()
  const container: ReferenceContainer = {
    id,
    shape,
    center: { x: 0, y: 0, z: 0 },
    rotation: [0, 0, 0, 1],
    size: { x: 1, y: 1, z: 1 },
    segments: 16,
    color: DEFAULT_COLOR,
    lineOpacity: 1,
    lineWidth: 1,
    locked: false,
    warnEnabled: false,
    warnColor: DEFAULT_WARN_COLOR,
    warnOpacity: 0.33,
  }
  $containers.set([...$containers.get(), container])
  $activeContainerId.set(id)
  return id
}

export function updateContainer(id: string, patch: Partial<Omit<ReferenceContainer, 'id'>>): void {
  $containers.set($containers.get().map((c) => (c.id === id ? { ...c, ...patch } : c)))
}

export function removeContainer(id: string): void {
  $containers.set($containers.get().filter((c) => c.id !== id))
  if ($activeContainerId.get() === id) $activeContainerId.set(null)
}

export function setContainerLocked(id: string, locked: boolean): void {
  updateContainer(id, { locked })
}

export function setActiveContainer(id: string | null): void {
  $activeContainerId.set(id)
}

export function setContainerGizmoMode(mode: ContainerGizmoMode): void {
  $containerGizmoMode.set(mode)
}

export function setContainerSettings(patch: Partial<ContainerSettings>): void {
  $containerSettings.set({ ...$containerSettings.get(), ...patch })
}
