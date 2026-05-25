import { atom } from 'nanostores'
import type { Connector, ConnectorFlag, EditingPart, EulerXYZ, SubPartPlacement, Vec3 } from '../ksa/types'
import { createEmptyPart } from '../ksa/types'

/**
 * Framework-agnostic editor state (nanostores). No React / three.js imports —
 * the three.js scene subscribes via `$part.subscribe(...)` and React reads via
 * `useStore($...)`. Actions are plain exported functions; `$part` is treated as
 * immutable (every mutation replaces it with a fresh object so subscribers fire).
 *
 * Mirrors space-tape's PartEditorController (undo/redo, selection, add/remove/
 * duplicate, transform updates).
 */

export type ToolMode = 'translate' | 'rotate' | 'scale'
export interface SnapSettings {
  translate?: number
  rotateDeg?: number
}

export interface PlacementTransform {
  position: Vec3
  rotation: EulerXYZ
  scale: Vec3
}

export const $part = atom<EditingPart>(createEmptyPart())
/** Selected SubPart index, or -1. At most one of this / {@link $selectedConnectorIndex} is >= 0. */
export const $selectedIndex = atom<number>(-1)
/** Selected connector index, or -1. Mutually exclusive with {@link $selectedIndex}. */
export const $selectedConnectorIndex = atom<number>(-1)
export const $toolMode = atom<ToolMode>('translate')
export const $snap = atom<SnapSettings>({})
export const $canUndo = atom(false)
export const $canRedo = atom(false)

const MAX_UNDO = 50
const undoStack: EditingPart[] = []
const redoStack: EditingPart[] = []

function clone(part: EditingPart): EditingPart {
  return structuredClone(part)
}

function refreshHistoryFlags(): void {
  $canUndo.set(undoStack.length > 0)
  $canRedo.set(redoStack.length > 0)
}

function clampSelection(): void {
  const part = $part.get()
  if ($selectedIndex.get() > part.placements.length - 1) {
    $selectedIndex.set(part.placements.length - 1)
  }
  if ($selectedConnectorIndex.get() > part.connectors.length - 1) {
    $selectedConnectorIndex.set(part.connectors.length - 1)
  }
}

/** Snapshot current state onto the undo stack (call before a mutation). */
export function pushUndo(): void {
  undoStack.push(clone($part.get()))
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  redoStack.length = 0
  refreshHistoryFlags()
}

export function undo(): void {
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(clone($part.get()))
  $part.set(prev)
  clampSelection()
  refreshHistoryFlags()
}

export function redo(): void {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(clone($part.get()))
  $part.set(next)
  clampSelection()
  refreshHistoryFlags()
}

function lastSegmentLower(templateId: string): string {
  const seg = templateId.split('.').pop() ?? templateId
  return seg.toLowerCase()
}

/** Adds a SubPart from the catalog at the origin and selects it. */
export function addSubPart(templateId: string): void {
  pushUndo()
  const part = clone($part.get())
  const base = lastSegmentLower(templateId)
  const count = part.placements.filter((p) => p.subPartTemplateId === templateId).length
  part.placements.push({
    instanceId: `${base}_${count + 1}`,
    subPartTemplateId: templateId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  })
  $part.set(part)
  selectPlacement(part.placements.length - 1)
}

/**
 * Imports a whole Part by appending all of its SubPart instances to the current
 * project, preserving each one's position/rotation/scale, along with the Part's
 * connectors (transforms + flags). InstanceIds and connector ids are regenerated
 * so they never collide with entities already in the project. The last added
 * SubPart is selected (or the last connector if the Part has no SubParts).
 */
export function addPart(
  placements: readonly SubPartPlacement[],
  connectors: readonly Connector[] = [],
): void {
  if (placements.length === 0 && connectors.length === 0) return
  pushUndo()
  const part = clone($part.get())
  for (const src of placements) {
    const base = lastSegmentLower(src.subPartTemplateId)
    const count = part.placements.filter((p) => p.subPartTemplateId === src.subPartTemplateId).length
    part.placements.push({
      instanceId: `${base}_${count + 1}`,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
    })
  }
  for (const src of connectors) {
    part.connectors.push({
      id: nextConnectorId(part), // regenerated against the growing list
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      flags: src.flags,
    })
  }
  $part.set(part)
  if (part.placements.length > 0) selectPlacement(part.placements.length - 1)
  else selectConnector(part.connectors.length - 1)
}

/** Adds a connector at the origin (facing local +X) and selects it. */
export function addConnector(): void {
  pushUndo()
  const part = clone($part.get())
  part.connectors.push({
    id: nextConnectorId(part),
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    flags: 'None',
  })
  $part.set(part)
  selectConnector(part.connectors.length - 1)
}

/** Returns the next free "_connectorN" id (max existing N + 1). */
function nextConnectorId(part: EditingPart): string {
  let max = 0
  for (const c of part.connectors) {
    const m = /^_connector(\d+)$/.exec(c.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `_connector${max + 1}`
}

export function setConnectorFlags(index: number, flags: ConnectorFlag): void {
  const current = $part.get()
  if (index < 0 || index >= current.connectors.length) return
  pushUndo()
  const part = clone(current)
  part.connectors[index].flags = flags
  $part.set(part)
}

/** Removes the selected entity (SubPart or connector) and clamps selection. */
export function removeSelected(): void {
  const ci = $selectedConnectorIndex.get()
  if (ci >= 0 && ci < $part.get().connectors.length) {
    pushUndo()
    const part = clone($part.get())
    part.connectors.splice(ci, 1)
    $part.set(part)
    $selectedConnectorIndex.set(Math.min(ci, part.connectors.length - 1))
    return
  }
  const i = $selectedIndex.get()
  if (i < 0 || i >= $part.get().placements.length) return
  pushUndo()
  const part = clone($part.get())
  part.placements.splice(i, 1)
  $part.set(part)
  $selectedIndex.set(Math.min(i, part.placements.length - 1))
}

/** Duplicates the selected entity (SubPart or connector) and selects the copy. */
export function duplicateSelected(): void {
  const ci = $selectedConnectorIndex.get()
  const srcConnector = $part.get().connectors[ci]
  if (ci >= 0 && srcConnector) {
    pushUndo()
    const part = clone($part.get())
    part.connectors.push({
      id: nextConnectorId(part),
      position: { ...srcConnector.position },
      rotation: { ...srcConnector.rotation },
      scale: { ...srcConnector.scale },
      flags: srcConnector.flags,
    })
    $part.set(part)
    selectConnector(part.connectors.length - 1)
    return
  }
  const i = $selectedIndex.get()
  const src = $part.get().placements[i]
  if (!src) return
  pushUndo()
  const part = clone($part.get())
  const base = lastSegmentLower(src.subPartTemplateId)
  const count = part.placements.filter((p) => p.subPartTemplateId === src.subPartTemplateId).length
  part.placements.push({
    instanceId: `${base}_${count + 1}`,
    subPartTemplateId: src.subPartTemplateId,
    position: { ...src.position },
    rotation: { ...src.rotation },
    scale: { ...src.scale },
  })
  $part.set(part)
  selectPlacement(part.placements.length - 1)
}

/** Selects a SubPart by index (clears any connector selection). */
export function selectPlacement(index: number): void {
  $selectedConnectorIndex.set(-1)
  $selectedIndex.set(index)
}

/** Selects a connector by index (clears any SubPart selection). */
export function selectConnector(index: number): void {
  $selectedIndex.set(-1)
  $selectedConnectorIndex.set(index)
}

/** Clears all selection. */
export function clearSelection(): void {
  $selectedIndex.set(-1)
  $selectedConnectorIndex.set(-1)
}

/**
 * Updates the transform of the placement at `index`. Does NOT push undo — the
 * caller pushes once at the start of an interaction (gizmo drag / field focus).
 */
export function updatePlacementTransform(index: number, t: PlacementTransform): void {
  const current = $part.get()
  if (index < 0 || index >= current.placements.length) return
  const part = clone(current)
  const p = part.placements[index]
  p.position = { ...t.position }
  p.rotation = { ...t.rotation }
  p.scale = { ...t.scale }
  $part.set(part)
}

/** Like {@link updatePlacementTransform} but for a connector. No undo (see above). */
export function updateConnectorTransform(index: number, t: PlacementTransform): void {
  const current = $part.get()
  if (index < 0 || index >= current.connectors.length) return
  const part = clone(current)
  const c = part.connectors[index]
  c.position = { ...t.position }
  c.rotation = { ...t.rotation }
  c.scale = { ...t.scale }
  $part.set(part)
}

/**
 * Updates the transform of whichever entity is selected (SubPart or connector).
 * No undo — the caller pushes once at interaction start.
 */
export function updateSelectedTransform(t: PlacementTransform): void {
  const ci = $selectedConnectorIndex.get()
  if (ci >= 0) {
    updateConnectorTransform(ci, t)
    return
  }
  updatePlacementTransform($selectedIndex.get(), t)
}

export function setPartId(partId: string): void {
  const part = clone($part.get())
  part.partId = partId
  $part.set(part)
}

export function newPart(): void {
  undoStack.length = 0
  redoStack.length = 0
  refreshHistoryFlags()
  $part.set(createEmptyPart())
  clearSelection()
}

export function setToolMode(mode: ToolMode): void {
  $toolMode.set(mode)
}

export function setSnap(snap: SnapSettings): void {
  $snap.set(snap)
}
