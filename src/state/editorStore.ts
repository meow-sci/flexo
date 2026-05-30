import { atom, computed } from 'nanostores'
import type {
  Connector,
  ConnectorFlag,
  EditingPart,
  EulerXYZ,
  PartGameData,
  SubPartPlacement,
  Tank,
  TankShape,
  Vec3,
} from '../ksa/types'
import {
  BUILT_IN_LAYER_IDS,
  CONNECTOR_LAYER_ID,
  createEmptyPart,
  createTank,
  DEFAULT_LAYER_ID,
} from '../ksa/types'

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

/**
 * The single world axis the arrow-key nudge tool moves along: ↑/↓ translate the
 * selection by ±step on this axis, ←/→ cycle which axis is active (see
 * src/three/nudgeSelection.ts). Ephemeral UI state.
 */
export type NudgeAxis = 'x' | 'y' | 'z'

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
/**
 * Selected connector indices (multi-select), ordered by selection. Mutually
 * exclusive with {@link $selectedIndices} — when this is non-empty,
 * {@link $selectedIndices} is [].
 */
export const $selectedConnectorIndices = atom<number[]>([])
/**
 * Primary selected connector index (the last one added to the selection), or -1.
 * Derived from {@link $selectedConnectorIndices}; drives single-entity behavior
 * (gizmo attach, the per-entity inspector) and back-compat for existing readers.
 */
export const $selectedConnectorIndex = computed(
  $selectedConnectorIndices,
  (indices) => (indices.length > 0 ? indices[indices.length - 1] : -1),
)
/**
 * The layer new SubParts/connectors are added to. Ephemeral UI state (like
 * selection) — NOT persisted and NOT in undo history. Always clamped to an
 * existing layer; falls back to {@link DEFAULT_LAYER_ID}.
 */
export const $activeLayerId = atom<string>(DEFAULT_LAYER_ID)
export const $toolMode = atom<ToolMode>('translate')
export const $snap = atom<SnapSettings>({})
/** Active nudge axis. Default 'y' — the vertical/world-up axis. */
export const $nudgeAxis = atom<NudgeAxis>('y')
/** Distance (m) each arrow-key nudge moves the selection. Adjusted by the M keys. */
export const $nudgeStep = atom<number>(0.1)
export const $canUndo = atom(false)
export const $canRedo = atom(false)
/** Description of the action that will be undone next (empty when nothing to undo). */
export const $undoDescription = atom<string>('')
/** Description of the action that will be redone next (empty when nothing to redo). */
export const $redoDescription = atom<string>('')

/** An entry in the undo or redo stack: the document snapshot plus a human-readable label. */
export interface HistoryEntry {
  part: EditingPart
  description: string
  /** Contextual detail, e.g. entity name, layer name. Empty string if none. */
  detail: string
}

/**
 * One row in the history-list popover.
 * `stepsFromCurrent < 0` → undo that many steps; `> 0` → redo; `0` → current state.
 */
export interface HistoryListItem {
  description: string
  detail: string
  stepsFromCurrent: number
}

/** All history entries ordered redo-first → current → undo-last, for the history popover. */
export const $historyList = atom<HistoryListItem[]>([])

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
const undoStack: HistoryEntry[] = []
const redoStack: HistoryEntry[] = []

function clone(part: EditingPart): EditingPart {
  return structuredClone(part)
}

function refreshHistoryFlags(): void {
  $canUndo.set(undoStack.length > 0)
  $canRedo.set(redoStack.length > 0)
  $undoDescription.set(undoStack.at(-1)?.description ?? '')
  $redoDescription.set(redoStack.at(-1)?.description ?? '')
  const items: HistoryListItem[] = []
  for (let i = 0; i < redoStack.length; i++) {
    items.push({ description: redoStack[i].description, detail: redoStack[i].detail, stepsFromCurrent: redoStack.length - i })
  }
  items.push({ description: '', detail: '', stepsFromCurrent: 0 })
  for (let i = undoStack.length - 1; i >= 0; i--) {
    items.push({ description: undoStack[i].description, detail: undoStack[i].detail, stepsFromCurrent: -(undoStack.length - i) })
  }
  $historyList.set(items)
}

function clampSelection(): void {
  const part = $part.get()
  const max = part.placements.length - 1
  const current = $selectedIndices.get()
  const filtered = current.filter((i) => i >= 0 && i <= max)
  if (filtered.length !== current.length) $selectedIndices.set(filtered)
  const clampedCon = $selectedConnectorIndices.get().filter((i) => i < part.connectors.length)
  if (clampedCon.length !== $selectedConnectorIndices.get().length) $selectedConnectorIndices.set(clampedCon)
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

/** Snapshot current state onto the undo stack before a mutation. `description` labels the action; `detail` adds context (entity name, layer, etc.). */
export function pushUndo(description: string, detail: string = ''): void {
  undoStack.push({ part: clone($part.get()), description, detail })
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  redoStack.length = 0
  refreshHistoryFlags()
}

/** Undoes the last action. Returns a formatted label (e.g. "move · thruster_1_1") for toast display. */
export function undo(): string {
  const entry = undoStack.pop()
  if (!entry) return ''
  redoStack.push({ part: clone($part.get()), description: entry.description, detail: entry.detail })
  $part.set(entry.part)
  clampSelection()
  clampActiveLayer()
  refreshHistoryFlags()
  return entry.detail ? `${entry.description} · ${entry.detail}` : entry.description
}

/** Redoes the next action. Returns a formatted label (e.g. "add part · bolt_2") for toast display. */
export function redo(): string {
  const entry = redoStack.pop()
  if (!entry) return ''
  undoStack.push({ part: clone($part.get()), description: entry.description, detail: entry.detail })
  $part.set(entry.part)
  clampSelection()
  clampActiveLayer()
  refreshHistoryFlags()
  return entry.detail ? `${entry.description} · ${entry.detail}` : entry.description
}

/** A serializable snapshot of the undo/redo stacks (newest-last), for project persistence. */
export interface HistorySnapshot {
  undo: Array<{ part: EditingPart; description: string; detail: string }>
  redo: Array<{ part: EditingPart; description: string; detail: string }>
}

/**
 * Exports a deep copy of the current undo/redo stacks. Used by projectStore to
 * persist history as part of a project (so undo survives a reload), keeping the
 * stacks module-private otherwise.
 */
export function exportHistory(): HistorySnapshot {
  return {
    undo: undoStack.map((e) => ({ part: clone(e.part), description: e.description, detail: e.detail })),
    redo: redoStack.map((e) => ({ part: clone(e.part), description: e.description, detail: e.detail })),
  }
}

/**
 * Replaces the undo/redo stacks with deep copies of `snapshot` (used when a project
 * is loaded). Does NOT touch `$part` — the caller sets the document separately; this
 * only restores the history that goes with it. Refreshes the can-undo/redo flags.
 * Handles legacy saves where entries were plain EditingPart or lacked detail/description.
 */
export function importHistory(snapshot: HistorySnapshot): void {
  undoStack.length = 0
  redoStack.length = 0
  for (const raw of snapshot.undo as unknown[]) {
    const e = raw as { part?: EditingPart; description?: string; detail?: string } & EditingPart
    undoStack.push({ part: clone(e.part ?? (e as EditingPart)), description: e.description ?? 'edit', detail: e.detail ?? '' })
  }
  for (const raw of snapshot.redo as unknown[]) {
    const e = raw as { part?: EditingPart; description?: string; detail?: string } & EditingPart
    redoStack.push({ part: clone(e.part ?? (e as EditingPart)), description: e.description ?? 'edit', detail: e.detail ?? '' })
  }
  if (undoStack.length > MAX_UNDO) undoStack.splice(0, undoStack.length - MAX_UNDO)
  refreshHistoryFlags()
}

/**
 * Jumps to a specific point in history by applying N undo or redo steps.
 * Negative `steps` = undo that many times; positive = redo. Returns the
 * description of the last step applied (empty if no steps taken).
 */
export function jumpToHistory(steps: number): string {
  if (steps === 0) return ''
  let last = ''
  if (steps < 0) {
    for (let i = 0; i < -steps; i++) last = undo()
  } else {
    for (let i = 0; i < steps; i++) last = redo()
  }
  return last
}

function lastSegmentLower(templateId: string): string {
  const seg = templateId.split('.').pop() ?? templateId
  return seg.toLowerCase()
}

/** Adds a SubPart from the catalog at the origin and selects it. */
export function addSubPart(templateId: string): void {
  const current = $part.get()
  const base = lastSegmentLower(templateId)
  const count = current.placements.filter((p) => p.subPartTemplateId === templateId).length
  const instanceId = `${base}_${count + 1}`
  pushUndo('add part', instanceId)
  const part = clone(current)
  part.placements.push({
    instanceId,
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
 * in `targetLayerId` when given (and it exists), else the active layer; connectors
 * always go to the built-in Connectors layer
 * (layers are editor-only and absent from KSA XML). The last added SubPart is
 * selected (or the last connector if the Part has no SubParts).
 */
export function addPart(
  placements: readonly SubPartPlacement[],
  connectors: readonly Connector[] = [],
  editorTags: readonly string[] = [],
  targetLayerId?: string,
): void {
  if (placements.length === 0 && connectors.length === 0) return
  const importDetail = placements.length > 0 && connectors.length === 0
    ? (placements.length === 1 ? lastSegmentLower(placements[0].subPartTemplateId) : `${placements.length} parts`)
    : connectors.length > 0 && placements.length === 0
      ? `${connectors.length} connector${connectors.length > 1 ? 's' : ''}`
      : `${placements.length} parts, ${connectors.length} connectors`
  pushUndo('import', importDetail)
  const part = clone($part.get())
  const layerId =
    targetLayerId && part.layers.some((l) => l.id === targetLayerId)
      ? targetLayerId
      : currentLayerId(part)
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
      flags: [...src.flags],
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
  const current = $part.get()
  const newId = nextConnectorId(current)
  pushUndo('add connector', newId)
  const part = clone(current)
  part.connectors.push({
    id: newId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    flags: [],
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

export function setConnectorFlags(index: number, flags: readonly ConnectorFlag[]): void {
  const current = $part.get()
  if (index < 0 || index >= current.connectors.length) return
  pushUndo('connector flags', `${current.connectors[index].id} → ${flags.length ? flags.join(', ') : 'none'}`)
  const part = clone(current)
  part.connectors[index].flags = [...flags]
  $part.set(part)
}

/** Removes the selected entity/entities (SubParts or connectors) and clamps selection. */
export function removeSelected(): void {
  const conIndices = $selectedConnectorIndices.get()
  if (conIndices.length > 0) {
    const part0 = $part.get()
    const valid = conIndices.filter((i) => i >= 0 && i < part0.connectors.length)
    if (valid.length === 0) return
    const names = valid.map((i) => part0.connectors[i]?.id).filter(Boolean)
    pushUndo(valid.length > 1 ? 'delete connectors' : 'delete connector', names.length === 1 ? names[0] : `${names.length} connectors`)
    const part = clone(part0)
    for (const i of [...valid].sort((a, b) => b - a)) part.connectors.splice(i, 1)
    $part.set(part)
    if (valid.length === 1 && part.connectors.length > 0) {
      $selectedConnectorIndices.set([Math.min(valid[0], part.connectors.length - 1)])
    } else {
      $selectedConnectorIndices.set([])
    }
    return
  }
  const indices = $selectedIndices.get()
  if (indices.length === 0) return
  const deletePart = $part.get()
  const deleteNames = indices.map((i) => deletePart.placements[i]?.instanceId).filter(Boolean)
  const deleteDetail = deleteNames.length === 1 ? deleteNames[0] : `${deleteNames.length} parts`
  pushUndo(indices.length > 1 ? 'delete parts' : 'delete part', deleteDetail)
  const part = clone(deletePart)
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

/**
 * Removes a single SubPart by index (used by the per-row context menu, which acts
 * on its own row regardless of the current selection). Discrete mutation → records
 * undo. Selection is adjusted: the removed index is dropped and indices after it
 * shift down by one so the selection keeps pointing at the same SubParts.
 */
export function removePlacement(index: number): void {
  const current = $part.get()
  if (index < 0 || index >= current.placements.length) return
  pushUndo('delete part', current.placements[index].instanceId)
  const part = clone(current)
  part.placements.splice(index, 1)
  $part.set(part)
  const sel = $selectedIndices.get()
  const next = sel.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
  if (next.length !== sel.length) $selectedIndices.set(next)
  else if (next.some((v, k) => v !== sel[k])) $selectedIndices.set(next)
}

/** Duplicates the selected entity/entities (SubParts or connectors) and selects the copies. */
export function duplicateSelected(): void {
  const conIndices = $selectedConnectorIndices.get()
  if (conIndices.length > 0) {
    const part0 = $part.get()
    const valid = conIndices.filter((i) => i >= 0 && i < part0.connectors.length)
    if (valid.length === 0) return
    const names = valid.map((i) => part0.connectors[i]?.id).filter(Boolean)
    pushUndo('duplicate', names.length === 1 ? names[0] : `${names.length} connectors`)
    const part = clone(part0)
    const newIndices: number[] = []
    for (const i of [...valid].sort((a, b) => a - b)) {
      const src = part.connectors[i]
      if (!src) continue
      part.connectors.push({
        id: nextConnectorId(part),
        position: { ...src.position },
        rotation: { ...src.rotation },
        scale: { ...src.scale },
        flags: [...src.flags],
        layerId: src.layerId,
      })
      newIndices.push(part.connectors.length - 1)
    }
    $part.set(part)
    setSelectedConnectors(newIndices)
    return
  }
  const indices = $selectedIndices.get()
  if (indices.length === 0) return
  const dupPart = $part.get()
  const dupNames = indices.map((i) => dupPart.placements[i]?.instanceId).filter(Boolean)
  pushUndo('duplicate', dupNames.length === 1 ? dupNames[0] : `${dupNames.length} parts`)
  const part = clone(dupPart)
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
  $selectedConnectorIndices.set([])
  $selectedIndices.set(index >= 0 ? [index] : [])
}

/** Replaces the SubPart selection with the given indices (deduped, order-preserving). */
export function setSelectedPlacements(indices: readonly number[]): void {
  $selectedConnectorIndices.set([])
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
  $selectedConnectorIndices.set([])
  const current = $selectedIndices.get()
  $selectedIndices.set(
    current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
  )
}

/** Selects a connector by index (clears any SubPart selection). */
export function selectConnector(index: number): void {
  $selectedIndices.set([])
  $selectedConnectorIndices.set(index >= 0 ? [index] : [])
}

/** Replaces connector selection with the given indices (deduped, order-preserving). Clears SubPart selection. */
export function setSelectedConnectors(indices: readonly number[]): void {
  $selectedIndices.set([])
  const seen = new Set<number>()
  const next: number[] = []
  for (const i of indices) {
    if (i >= 0 && !seen.has(i)) {
      seen.add(i)
      next.push(i)
    }
  }
  $selectedConnectorIndices.set(next)
}

/** Clears all selection. */
export function clearSelection(): void {
  $selectedIndices.set([])
  $selectedConnectorIndices.set([])
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
 * Applies several connector transforms in a single store update (one subscriber
 * fire). The connector analogue of {@link updatePlacementTransforms}, used for
 * bulk transforms of a multi-connector selection. Does NOT push undo — the caller
 * pushes once at interaction start.
 */
export function updateConnectorTransforms(
  updates: readonly { index: number; transform: PlacementTransform }[],
): void {
  if (updates.length === 0) return
  const current = $part.get()
  const part = clone(current)
  for (const { index, transform } of updates) {
    if (index < 0 || index >= part.connectors.length) continue
    const c = part.connectors[index]
    c.position = { ...transform.position }
    c.rotation = { ...transform.rotation }
    c.scale = { ...transform.scale }
  }
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
  const tagsDetail = editorTags.length === 0
    ? 'none'
    : editorTags.slice(0, 2).join(', ') + (editorTags.length > 2 ? ', …' : '')
  pushUndo('edit tags', tagsDetail)
  const part = clone($part.get())
  part.editorTags = [...editorTags]
  $part.set(part)
}

// ---------------------------------------------------------------------------
// GameData (popup-only metadata: display name, mass, tanks, power, coupling)
//
// These live on part.gameData and follow the same undo invariant as everything
// else (file header). Free-text / numeric field edits are STREAMING mutations
// (no internal pushUndo — the field focus-pushes once, like setPartId). Discrete
// gestures — add/remove a list item, flip a checkbox, pick from a Select —
// self-record undo via {@link commitGameData}.
// ---------------------------------------------------------------------------

/** Default separation/docking force (N) when a coupling is first enabled (matches space-tape). */
const DEFAULT_COUPLING_FORCE = 500
/** Default mass (kg) when the custom-mass override is first enabled. */
const DEFAULT_CUSTOM_MASS_KG = 100

/** Streaming gameData mutation: no undo push (caller focus-pushes). */
function mutateGameData(mutate: (g: PartGameData) => void): void {
  const part = clone($part.get())
  mutate(part.gameData)
  $part.set(part)
}

/** Discrete gameData mutation: records one undo step, then mutates. */
function commitGameData(label: string, detail: string, mutate: (g: PartGameData) => void): void {
  pushUndo(label, detail)
  mutateGameData(mutate)
}

/** Streaming: set the in-game display name. Caller pushes undo on field focus. */
export function setDisplayName(name: string): void {
  mutateGameData((g) => {
    g.displayName = name
  })
}

/** Discrete: enable/disable the custom-mass override (off → null, on → default). */
export function setCustomMassEnabled(enabled: boolean): void {
  commitGameData('custom mass', enabled ? 'on' : 'off', (g) => {
    g.customMass = enabled ? (g.customMass ?? DEFAULT_CUSTOM_MASS_KG) : null
  })
}

/** Streaming: set the custom mass in kg. Caller pushes undo on field focus. */
export function setCustomMass(massKg: number): void {
  mutateGameData((g) => {
    g.customMass = massKg
  })
}

// --- Tanks ---

/** Discrete: append a default tank. */
export function addTank(): void {
  commitGameData('add tank', '', (g) => g.tanks.push(createTank()))
}

/** Discrete: remove the tank at `index`. */
export function removeTank(index: number): void {
  if (index < 0 || index >= $part.get().gameData.tanks.length) return
  commitGameData('remove tank', '', (g) => g.tanks.splice(index, 1))
}

/** Discrete: change a tank's shape (cylindrical/spherical). */
export function setTankShape(index: number, shape: TankShape): void {
  if (index < 0 || index >= $part.get().gameData.tanks.length) return
  commitGameData('tank shape', shape, (g) => {
    g.tanks[index].shape = shape
  })
}

/** Streaming: patch a tank's numeric/material fields. Caller pushes undo on field focus. */
export function updateTank(index: number, patch: Partial<Tank>): void {
  if (index < 0 || index >= $part.get().gameData.tanks.length) return
  mutateGameData((g) => {
    g.tanks[index] = { ...g.tanks[index], ...patch }
  })
}

// --- Power (batteries / generators / consumers) ---

/** Discrete: append a battery (default capacity). */
export function addBattery(): void {
  commitGameData('add battery', '', (g) => g.batteries.push({ capacityKWh: 0.01 }))
}
/** Discrete: remove battery at `index`. */
export function removeBattery(index: number): void {
  if (index < 0 || index >= $part.get().gameData.batteries.length) return
  commitGameData('remove battery', '', (g) => g.batteries.splice(index, 1))
}
/** Streaming: set a battery's capacity (kWh). Caller pushes undo on field focus. */
export function setBatteryCapacity(index: number, capacityKWh: number): void {
  if (index < 0 || index >= $part.get().gameData.batteries.length) return
  mutateGameData((g) => {
    g.batteries[index].capacityKWh = capacityKWh
  })
}

/** Discrete: append a generator (default output). */
export function addGenerator(): void {
  commitGameData('add generator', '', (g) => g.generators.push({ outputWatts: 5 }))
}
/** Discrete: remove generator at `index`. */
export function removeGenerator(index: number): void {
  if (index < 0 || index >= $part.get().gameData.generators.length) return
  commitGameData('remove generator', '', (g) => g.generators.splice(index, 1))
}
/** Streaming: set a generator's output (W). Caller pushes undo on field focus. */
export function setGeneratorOutput(index: number, outputWatts: number): void {
  if (index < 0 || index >= $part.get().gameData.generators.length) return
  mutateGameData((g) => {
    g.generators[index].outputWatts = outputWatts
  })
}

/** Discrete: append a power consumer (default draw). */
export function addPowerConsumer(): void {
  commitGameData('add consumer', '', (g) => g.powerConsumers.push({ consumedWatts: 2 }))
}
/** Discrete: remove power consumer at `index`. */
export function removePowerConsumer(index: number): void {
  if (index < 0 || index >= $part.get().gameData.powerConsumers.length) return
  commitGameData('remove consumer', '', (g) => g.powerConsumers.splice(index, 1))
}
/** Streaming: set a consumer's draw (W). Caller pushes undo on field focus. */
export function setPowerConsumerWatts(index: number, consumedWatts: number): void {
  if (index < 0 || index >= $part.get().gameData.powerConsumers.length) return
  mutateGameData((g) => {
    g.powerConsumers[index].consumedWatts = consumedWatts
  })
}

// --- Coupling (decoupler / docking port / EVA door) — each references a connector ---

/** Discrete: enable/disable the decoupler. */
export function setDecouplerEnabled(enabled: boolean): void {
  commitGameData('decoupler', enabled ? 'on' : 'off', (g) => {
    g.decoupler = enabled ? (g.decoupler ?? { connectorId: '', force: DEFAULT_COUPLING_FORCE }) : null
  })
}
/** Discrete: bind the decoupler to a connector id. */
export function setDecouplerConnector(connectorId: string): void {
  commitGameData('decoupler connector', connectorId, (g) => {
    if (g.decoupler) g.decoupler.connectorId = connectorId
  })
}
/** Streaming: set decoupler force (N). Caller pushes undo on field focus. */
export function setDecouplerForce(force: number): void {
  mutateGameData((g) => {
    if (g.decoupler) g.decoupler.force = force
  })
}

/** Discrete: enable/disable the docking port. */
export function setDockingPortEnabled(enabled: boolean): void {
  commitGameData('docking port', enabled ? 'on' : 'off', (g) => {
    g.dockingPort = enabled ? (g.dockingPort ?? { connectorId: '', force: DEFAULT_COUPLING_FORCE }) : null
  })
}
/** Discrete: bind the docking port to a connector id. */
export function setDockingPortConnector(connectorId: string): void {
  commitGameData('docking connector', connectorId, (g) => {
    if (g.dockingPort) g.dockingPort.connectorId = connectorId
  })
}
/** Streaming: set docking port force (N). Caller pushes undo on field focus. */
export function setDockingPortForce(force: number): void {
  mutateGameData((g) => {
    if (g.dockingPort) g.dockingPort.force = force
  })
}

/** Discrete: enable/disable the EVA door. */
export function setEvaDoorEnabled(enabled: boolean): void {
  commitGameData('EVA door', enabled ? 'on' : 'off', (g) => {
    g.evaDoor = enabled ? (g.evaDoor ?? { connectorId: '' }) : null
  })
}
/** Discrete: bind the EVA door to a connector id. */
export function setEvaDoorConnector(connectorId: string): void {
  commitGameData('EVA connector', connectorId, (g) => {
    if (g.evaDoor) g.evaDoor.connectorId = connectorId
  })
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
  const layerCurrent = $part.get()
  const layerTrimmed = name.trim() || `Layer ${layerCurrent.layers.length + 1}`
  pushUndo('add layer', layerTrimmed)
  const part = clone(layerCurrent)
  const id = nextLayerId(part)
  const trimmed = layerTrimmed
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
  pushUndo('rename layer', `${layer.name} → ${trimmed}`)
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
  pushUndo('delete layer', current.layers.find((l) => l.id === id)?.name ?? id)
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
  pushUndo('reorder layers')
  const part = clone(current)
  const byId = new Map(part.layers.map((l) => [l.id, l] as const))
  part.layers = orderedIds.map((lid) => byId.get(lid)!)
  $part.set(part)
}

/**
 * Moves a single SubPart to another layer (used by the per-row context menu).
 * Discrete mutation → records undo. No-op for an unknown index/layer or when the
 * SubPart is already on that layer.
 */
export function movePlacementToLayer(index: number, layerId: string): void {
  const current = $part.get()
  const placement = current.placements[index]
  if (!placement || placement.layerId === layerId) return
  if (!current.layers.some((l) => l.id === layerId)) return
  pushUndo('move to layer', `${current.placements[index].instanceId} → ${current.layers.find((l) => l.id === layerId)?.name ?? layerId}`)
  const part = clone(current)
  part.placements[index].layerId = layerId
  $part.set(part)
}

/**
 * Moves every selected SubPart to `layerId` in a single undo step, then makes that
 * layer active so the moved items stay visible (PlacementList filters by active
 * layer). Selection is preserved: editing a placement's layerId doesn't reorder
 * `placements`, so the selected indices keep pointing at the same SubParts. No-op
 * for an unknown layer or an empty selection.
 */
export function moveSelectedPlacementsToLayer(layerId: string): void {
  const indices = $selectedIndices.get()
  if (indices.length === 0) return
  const current = $part.get()
  if (!current.layers.some((l) => l.id === layerId)) return
  const destLayerName = current.layers.find((l) => l.id === layerId)?.name ?? layerId
  const moveDetail = indices.length === 1
    ? `${current.placements[indices[0]]?.instanceId ?? ''} → ${destLayerName}`
    : `${indices.length} parts → ${destLayerName}`
  pushUndo('move to layer', moveDetail)
  const part = clone(current)
  for (const i of indices) {
    const placement = part.placements[i]
    if (placement) placement.layerId = layerId
  }
  $part.set(part)
  $activeLayerId.set(layerId)
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
  const keptCon = $selectedConnectorIndices.get().filter((i) => part.connectors[i]?.layerId !== layerId)
  if (keptCon.length !== $selectedConnectorIndices.get().length) $selectedConnectorIndices.set(keptCon)
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

// ---------------------------------------------------------------------------
// Nudge plane / step (ephemeral tool state, like toolMode — not in undo history).
// ---------------------------------------------------------------------------

const NUDGE_AXIS_ORDER: readonly NudgeAxis[] = ['x', 'y', 'z']
/**
 * Floor on the nudge step — also the finest increment granularity (1 mm). The
 * step adapts its increment to its own magnitude (see below) but never goes finer
 * than this, which also bounds it to 3 decimals for clean display/rounding.
 */
export const MIN_NUDGE_STEP = 0.001

export function setNudgeAxis(axis: NudgeAxis): void {
  $nudgeAxis.set(axis)
}

/**
 * Cycles the nudge axis through x → y → z (the ←/→ hotkeys and the status-bubble
 * click). `direction` 1 steps forward, -1 backward; wraps around either way.
 */
export function cycleNudgeAxis(direction: 1 | -1 = 1): void {
  const order = NUDGE_AXIS_ORDER
  const i = order.indexOf($nudgeAxis.get())
  $nudgeAxis.set(order[(i + direction + order.length) % order.length])
}

/** Largest power of ten ≤ v (v > 0) — the increment for v's current decade. */
function decade(v: number): number {
  let d = 1
  if (v >= 1) {
    while (d * 10 <= v * (1 + 1e-9)) d *= 10
  } else {
    while (d > v * (1 + 1e-9)) d /= 10
  }
  return d
}

/** Rounds to 3 decimals ({@link MIN_NUDGE_STEP} granularity) to kill float drift. */
function roundStep(v: number): number {
  return Math.round(v * 1000) / 1000
}

/**
 * Increases the nudge step by one decade-sized increment (the M hotkey). The
 * increment tracks the value's magnitude — 0.1→0.2…0.9→1→2 — and below a decade
 * boundary it's correspondingly finer (0.09→0.1 via 0.01). Symmetric with
 * {@link decrementNudgeStep}.
 */
export function incrementNudgeStep(): void {
  const v = $nudgeStep.get()
  $nudgeStep.set(roundStep(v + decade(v)))
}

/**
 * Decreases the nudge step by one decade-sized increment (Shift+M). At the bottom
 * of a decade the increment refines to 1/10 (0.1→0.09, 0.01→0.009), clamped at
 * {@link MIN_NUDGE_STEP}.
 */
export function decrementNudgeStep(): void {
  const v = $nudgeStep.get()
  const d = decade(v)
  // When v sits at its decade floor (v ≈ d), step down by the finer 1/10 increment.
  const increment = Math.abs(v - d) < d * 1e-6 ? d / 10 : d
  $nudgeStep.set(Math.max(MIN_NUDGE_STEP, roundStep(v - increment)))
}
