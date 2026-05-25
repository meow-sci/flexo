import { atom, computed } from 'nanostores'
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
/**
 * Selected SubPart indices, ordered by selection (empty when none). This is the
 * source of truth for SubPart selection. SubPart and connector selection are
 * mutually exclusive: when this is non-empty, {@link $selectedConnectorIndex} is -1.
 */
export const $selectedIndices = atom<number[]>([])
/**
 * Primary selected SubPart index (the last one added to the selection), or -1.
 * Derived from {@link $selectedIndices}; drives single-entity behavior (gizmo
 * attach, the per-entity inspector) and back-compat for existing readers.
 */
export const $selectedIndex = computed($selectedIndices, (indices) =>
  indices.length > 0 ? indices[indices.length - 1] : -1,
)
/** Selected connector index, or -1. Mutually exclusive with {@link $selectedIndices}. */
export const $selectedConnectorIndex = atom<number>(-1)
export const $toolMode = atom<ToolMode>('translate')
export const $snap = atom<SnapSettings>({})
export const $canUndo = atom(false)
export const $canRedo = atom(false)

/**
 * UNDO/REDO INVARIANT — read this before adding or changing any action.
 *
 * History is a snapshot of `$part` only (the serialized document: partId,
 * editorTags, placements, connectors). Selection / toolMode / snap are ephemeral
 * UI state and are deliberately NOT in history (selection is clamped on restore).
 *
 * Every action that mutates `$part` MUST enroll in undo using exactly one of two
 * patterns — there is no third option:
 *
 *   1. Discrete mutation (one user gesture = one change): call `pushUndo()`
 *      internally, before cloning. Examples: addSubPart, addConnector,
 *      removeSelected, duplicateSelected, setConnectorFlags, setEditorTags.
 *
 *   2. Streaming mutation (many rapid updates that collapse into one undo step,
 *      e.g. a gizmo drag or a typing session): do NOT call `pushUndo()` here; the
 *      caller pushes once at interaction start (gizmo drag-start, field focus).
 *      Examples: updatePlacementTransform(s), updateConnectorTransform,
 *      updateSelectedTransform, and setPartId (focus-pushed by PartDataButton).
 *
 * If you add a `$part` mutator and pick neither pattern, that change silently
 * bypasses undo — a bug. Keep docs/editor-state.md and AGENTS.md in sync.
 */
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
  const max = part.placements.length - 1
  const current = $selectedIndices.get()
  const filtered = current.filter((i) => i >= 0 && i <= max)
  if (filtered.length !== current.length) $selectedIndices.set(filtered)
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
 * connectors (transforms + flags) and editor tags. InstanceIds and connector ids
 * are regenerated so they never collide with entities already in the project; the
 * imported editor tags are unioned into the project's tags. The last added SubPart
 * is selected (or the last connector if the Part has no SubParts).
 */
export function addPart(
  placements: readonly SubPartPlacement[],
  connectors: readonly Connector[] = [],
  editorTags: readonly string[] = [],
): void {
  if (placements.length === 0 && connectors.length === 0) return
  pushUndo()
  const part = clone($part.get())
  for (const tag of editorTags) {
    if (!part.editorTags.includes(tag)) part.editorTags.push(tag)
  }
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

/** Removes the selected entity/entities (SubParts or a connector) and clamps selection. */
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
  const indices = $selectedIndices.get()
  if (indices.length === 0) return
  pushUndo()
  const part = clone($part.get())
  // Splice in descending order so earlier indices stay valid.
  for (const i of [...indices].sort((a, b) => b - a)) {
    if (i >= 0 && i < part.placements.length) part.placements.splice(i, 1)
  }
  $part.set(part)
  // When a single SubPart was removed, keep the neighbor selected; otherwise clear.
  if (indices.length === 1 && part.placements.length > 0) {
    $selectedIndices.set([Math.min(indices[0], part.placements.length - 1)])
  } else {
    $selectedIndices.set([])
  }
}

/** Duplicates the selected entity/entities (SubParts or a connector) and selects the copies. */
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
  const indices = $selectedIndices.get()
  if (indices.length === 0) return
  pushUndo()
  const part = clone($part.get())
  const newIndices: number[] = []
  for (const i of [...indices].sort((a, b) => a - b)) {
    const src = part.placements[i]
    if (!src) continue
    const base = lastSegmentLower(src.subPartTemplateId)
    const count = part.placements.filter((p) => p.subPartTemplateId === src.subPartTemplateId).length
    part.placements.push({
      instanceId: `${base}_${count + 1}`,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
    })
    newIndices.push(part.placements.length - 1)
  }
  $part.set(part)
  setSelectedPlacements(newIndices)
}

/** Replaces the SubPart selection with a single index (clears any connector selection). */
export function selectPlacement(index: number): void {
  $selectedConnectorIndex.set(-1)
  $selectedIndices.set(index >= 0 ? [index] : [])
}

/** Replaces the SubPart selection with the given indices (deduped, order-preserving). */
export function setSelectedPlacements(indices: readonly number[]): void {
  $selectedConnectorIndex.set(-1)
  const seen = new Set<number>()
  const next: number[] = []
  for (const i of indices) {
    if (i >= 0 && !seen.has(i)) {
      seen.add(i)
      next.push(i)
    }
  }
  $selectedIndices.set(next)
}

/** Adds or removes a SubPart index from the current selection (clears connector selection). */
export function togglePlacement(index: number): void {
  if (index < 0) return
  $selectedConnectorIndex.set(-1)
  const current = $selectedIndices.get()
  $selectedIndices.set(
    current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
  )
}

/** Selects a connector by index (clears any SubPart selection). */
export function selectConnector(index: number): void {
  $selectedIndices.set([])
  $selectedConnectorIndex.set(index)
}

/** Clears all selection. */
export function clearSelection(): void {
  $selectedIndices.set([])
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

/**
 * Applies several placement transforms in a single store update (one subscriber
 * fire, one reconcile). Used for bulk transforms of a multi-selection. Does NOT
 * push undo — the caller pushes once at interaction start (gizmo drag / Apply).
 */
export function updatePlacementTransforms(
  updates: readonly { index: number; transform: PlacementTransform }[],
): void {
  if (updates.length === 0) return
  const current = $part.get()
  const part = clone(current)
  for (const { index, transform } of updates) {
    if (index < 0 || index >= part.placements.length) continue
    const p = part.placements[index]
    p.position = { ...transform.position }
    p.rotation = { ...transform.rotation }
    p.scale = { ...transform.scale }
  }
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

/**
 * Sets the Part id. Streaming mutation (per-keystroke from a text field): does NOT
 * push undo — the caller pushes once on field focus (see PartDataButton) so a
 * typing session collapses into a single undo step.
 */
export function setPartId(partId: string): void {
  const part = clone($part.get())
  part.partId = partId
  $part.set(part)
}

/** Replaces the editor tags. Discrete mutation (add/remove one tag) → self-records undo. */
export function setEditorTags(editorTags: readonly string[]): void {
  pushUndo()
  const part = clone($part.get())
  part.editorTags = [...editorTags]
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
