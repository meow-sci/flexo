import { atom, computed } from 'nanostores'
import type { Connector, ConnectorFlag, EditingPart, EulerXYZ, SubPartPlacement, Vec3 } from '../ksa/types'
import { BUILT_IN_LAYER_IDS, CONNECTOR_LAYER_ID, createEmptyPart, DEFAULT_LAYER_ID } from '../ksa/types'

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
/**
 * The layer new SubParts/connectors are added to. Ephemeral UI state (like
 * selection) — NOT persisted and NOT in undo history. Always clamped to an
 * existing layer; falls back to {@link DEFAULT_LAYER_ID}.
 */
export const $activeLayerId = atom<string>(DEFAULT_LAYER_ID)
export const $toolMode = atom<ToolMode>('translate')
export const $snap = atom<SnapSettings>({})
export const $canUndo = atom(false)
export const $canRedo = atom(false)

/**
 * UNDO/REDO INVARIANT — read this before adding or changing any action.
 *
 * History is a snapshot of `$part` only (the serialized document: partId,
 * editorTags, layers, placements, connectors — including each entity's layerId).
 * Selection / toolMode / snap / activeLayer are ephemeral UI state and are
 * deliberately NOT in history (selection + active layer are clamped on restore).
 * Per-layer visibility/lock is also excluded — it's persisted view state living
 * in src/state/layerStore.ts, not part of the document.
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

/** Resets the active layer to Default if it no longer exists (e.g. after undo). */
function clampActiveLayer(): void {
  const part = $part.get()
  if (!part.layers.some((l) => l.id === $activeLayerId.get())) {
    $activeLayerId.set(DEFAULT_LAYER_ID)
  }
}

/** The active layer id, clamped to a layer that exists in `part`. */
function currentLayerId(part: EditingPart): string {
  const active = $activeLayerId.get()
  return part.layers.some((l) => l.id === active) ? active : DEFAULT_LAYER_ID
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
  clampActiveLayer()
  refreshHistoryFlags()
}

export function redo(): void {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(clone($part.get()))
  $part.set(next)
  clampSelection()
  clampActiveLayer()
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
    layerId: currentLayerId(part),
  })
  $part.set(part)
  selectPlacement(part.placements.length - 1)
}

/**
 * Imports a whole Part by appending all of its SubPart instances to the current
 * project, preserving each one's position/rotation/scale, along with the Part's
 * connectors (transforms + flags) and editor tags. InstanceIds and connector ids
 * are regenerated so they never collide with entities already in the project; the
 * imported editor tags are unioned into the project's tags. Imported SubParts land
 * in the active layer; connectors always go to the built-in Connectors layer
 * (layers are editor-only and absent from KSA XML). The last added SubPart is
 * selected (or the last connector if the Part has no SubParts).
 */
export function addPart(
  placements: readonly SubPartPlacement[],
  connectors: readonly Connector[] = [],
  editorTags: readonly string[] = [],
): void {
  if (placements.length === 0 && connectors.length === 0) return
  pushUndo()
  const part = clone($part.get())
  const layerId = currentLayerId(part)
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
      layerId,
    })
  }
  for (const src of connectors) {
    part.connectors.push({
      id: nextConnectorId(part), // regenerated against the growing list
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      flags: src.flags,
      layerId: CONNECTOR_LAYER_ID, // connectors always live in the Connectors layer
    })
  }
  $part.set(part)
  if (part.placements.length > 0) selectPlacement(part.placements.length - 1)
  else selectConnector(part.connectors.length - 1)
}

/** Adds a connector at the origin (facing local +X) and selects it. Connectors
 * always belong to the built-in Connectors layer, not the active layer. */
export function addConnector(): void {
  pushUndo()
  const part = clone($part.get())
  part.connectors.push({
    id: nextConnectorId(part),
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    flags: 'None',
    layerId: CONNECTOR_LAYER_ID,
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
      layerId: srcConnector.layerId,
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
      layerId: src.layerId,
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

/**
 * Sets the instanceId of the SubPart at `index`. Streaming mutation (per-keystroke
 * from a text field): does NOT push undo — the caller pushes once on field focus so
 * a typing session collapses into a single undo step. No-op when blank.
 */
export function setSubPartInstanceId(index: number, instanceId: string): void {
  if (!instanceId.trim()) return
  const part = clone($part.get())
  const placement = part.placements[index]
  if (!placement) return
  placement.instanceId = instanceId
  $part.set(part)
}

/** Replaces the editor tags. Discrete mutation (add/remove one tag) → self-records undo. */
export function setEditorTags(editorTags: readonly string[]): void {
  pushUndo()
  const part = clone($part.get())
  part.editorTags = [...editorTags]
  $part.set(part)
}

// ---------------------------------------------------------------------------
// Layers
//
// Layer *definitions* (the layers[] list) and *membership* (each entity's
// layerId) are document state, so every mutating layer action below enrolls in
// undo as a discrete mutation (it calls pushUndo() itself). The active layer is
// ephemeral and never recorded. Per-layer visibility/lock lives in layerStore.ts.
// ---------------------------------------------------------------------------

/** Returns the next free "layerN" id (max existing numeric suffix + 1). */
function nextLayerId(part: EditingPart): string {
  let max = 0
  for (const l of part.layers) {
    const m = /^layer(\d+)$/.exec(l.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `layer${max + 1}`
}

/** Creates a layer (name trimmed; blank → "Layer N"), makes it active, returns its id. */
export function createLayer(name: string): string {
  pushUndo()
  const part = clone($part.get())
  const id = nextLayerId(part)
  const trimmed = name.trim() || `Layer ${part.layers.length + 1}`
  part.layers.push({ id, name: trimmed })
  $part.set(part)
  $activeLayerId.set(id)
  return id
}

/** Renames a layer. No-op when unchanged/blank/unknown. Discrete (commit once). */
export function renameLayer(id: string, name: string): void {
  const current = $part.get()
  const layer = current.layers.find((l) => l.id === id)
  const trimmed = name.trim()
  if (!layer || !trimmed || layer.name === trimmed) return
  pushUndo()
  const part = clone(current)
  const target = part.layers.find((l) => l.id === id)!
  target.name = trimmed
  $part.set(part)
}

export interface DeleteLayerOptions {
  /** 'delete-items' removes the layer's entities; 'move-items' reassigns them. */
  mode: 'delete-items' | 'move-items'
  /** Destination layer for 'move-items' (falls back to Default if missing/invalid). */
  targetLayerId?: string
}

/**
 * Deletes a layer. The built-in Default/Connectors layers are protected (no-op).
 * Entities in the layer are either removed ('delete-items') or moved to another
 * layer ('move-items').
 */
export function deleteLayer(id: string, opts: DeleteLayerOptions): void {
  if (BUILT_IN_LAYER_IDS.includes(id)) return
  const current = $part.get()
  if (!current.layers.some((l) => l.id === id)) return
  pushUndo()
  const part = clone(current)
  if (opts.mode === 'move-items') {
    const valid = opts.targetLayerId && opts.targetLayerId !== id &&
      part.layers.some((l) => l.id === opts.targetLayerId)
    const target = valid ? opts.targetLayerId! : DEFAULT_LAYER_ID
    for (const p of part.placements) if (p.layerId === id) p.layerId = target
    for (const c of part.connectors) if (c.layerId === id) c.layerId = target
  } else {
    part.placements = part.placements.filter((p) => p.layerId !== id)
    part.connectors = part.connectors.filter((c) => c.layerId !== id)
  }
  part.layers = part.layers.filter((l) => l.id !== id)
  $part.set(part)
  if ($activeLayerId.get() === id) $activeLayerId.set(DEFAULT_LAYER_ID)
  clampSelection()
}

/** Reorders layers to `orderedIds` (must be a permutation of the existing ids). */
export function reorderLayers(orderedIds: readonly string[]): void {
  const current = $part.get()
  if (orderedIds.length !== current.layers.length) return
  const ids = new Set(current.layers.map((l) => l.id))
  if (!orderedIds.every((lid) => ids.has(lid))) return
  pushUndo()
  const part = clone(current)
  const byId = new Map(part.layers.map((l) => [l.id, l] as const))
  part.layers = orderedIds.map((lid) => byId.get(lid)!)
  $part.set(part)
}

/** Sets the active layer (where new items land). No-op for unknown ids. Ephemeral. */
export function setActiveLayer(id: string): void {
  if ($part.get().layers.some((l) => l.id === id)) $activeLayerId.set(id)
}

/**
 * Selects every entity in a layer. SubPart+connector selection is mutually
 * exclusive, so this prefers the layer's SubParts (multi-select); only when the
 * layer has no SubParts does it select its first connector. Clears when empty.
 */
export function selectLayerEntities(id: string): void {
  const part = $part.get()
  const subIndices = part.placements.flatMap((p, i) => (p.layerId === id ? [i] : []))
  if (subIndices.length > 0) {
    setSelectedPlacements(subIndices)
    return
  }
  const conIndex = part.connectors.findIndex((c) => c.layerId === id)
  if (conIndex >= 0) selectConnector(conIndex)
  else clearSelection()
}

/** Drops any selected entities belonging to `layerId` (used when a layer is locked). */
export function deselectLayer(layerId: string): void {
  const part = $part.get()
  const current = $selectedIndices.get()
  const kept = current.filter((i) => part.placements[i]?.layerId !== layerId)
  if (kept.length !== current.length) $selectedIndices.set(kept)
  const ci = $selectedConnectorIndex.get()
  if (ci >= 0 && part.connectors[ci]?.layerId === layerId) $selectedConnectorIndex.set(-1)
}

export function newPart(): void {
  undoStack.length = 0
  redoStack.length = 0
  refreshHistoryFlags()
  $part.set(createEmptyPart())
  clearSelection()
  $activeLayerId.set(DEFAULT_LAYER_ID)
}

export function setToolMode(mode: ToolMode): void {
  $toolMode.set(mode)
}

export function setSnap(snap: SnapSettings): void {
  $snap.set(snap)
}
