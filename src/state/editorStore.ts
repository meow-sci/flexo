import { atom, computed } from 'nanostores'
import { persistentJSON } from '@nanostores/persistent'
import type {
  Battery,
  Connector,
  ConnectorFlag,
  Decoupler,
  DockingPort,
  EditingPart,
  EulerXYZ,
  EvaDoor,
  Generator,
  KittenInstance,
  KittenKind,
  Light,
  LightType,
  PartAnimation,
  PartGameData,
  PowerConsumer,
  SolarPanel,
  SubPartGameData,
  SubPartPlacement,
  Tank,
  TankShape,
  Vec3,
} from '../ksa/types'
import {
  BUILT_IN_LAYER_IDS,
  CONNECTOR_LAYER_ID,
  createEmptyPart,
  createLight,
  createSolarPanel,
  createTank,
  DEFAULT_LAYER_ID,
  isSubPartGameDataEmpty,
  KITTEN_LAYER_ID,
} from '../ksa/types'
import type { ReferenceContainer } from './containerStore'
import type { LineMeasurement } from './measurementStore'
import { mergeProjectImport } from './projectTransfer'
import type { ImportSummary, ProjectExportEnvelope } from './projectTransfer'

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
 * src/three/nudgeSelection.ts). A persisted global tool preference (see {@link $nudgeAxis}).
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
export const $selectedConnectorIndex = computed($selectedConnectorIndices, (indices) =>
  indices.length > 0 ? indices[indices.length - 1] : -1,
)
/**
 * Selected kitten indices (multi-select), ordered by selection. Mutually exclusive
 * with {@link $selectedIndices} and {@link $selectedConnectorIndices} — selecting a
 * kitten clears the other two. Kittens are editor-only visual aides.
 */
export const $selectedKittenIndices = atom<number[]>([])
/** Primary selected kitten index (last added to the selection), or -1. */
export const $selectedKittenIndex = computed($selectedKittenIndices, (indices) =>
  indices.length > 0 ? indices[indices.length - 1] : -1,
)

/**
 * Snapshots of copied entities (SubParts, connectors, kittens), stored WITHOUT
 * their ids — paste regenerates fresh ids so copies never collide. Ephemeral
 * editor state like selection: NOT persisted and NOT part of undo history. An
 * in-app clipboard (not the OS clipboard) so paste reliably reconstructs entity
 * data without serialization/permission round-trips; copy/paste are still driven
 * by the platform shortcuts (⌘/Ctrl + C/V). Null when nothing has been copied.
 */
export interface PartClipboard {
  placements: SubPartPlacement[]
  connectors: Connector[]
  kittens: KittenInstance[]
}
export const $clipboard = atom<PartClipboard | null>(null)
/** True once something has been copied — drives enable/disable of paste affordances. */
export const $hasClipboard = computed($clipboard, (c) => c != null)
/**
 * The layer new SubParts/connectors are added to. Ephemeral UI state (like
 * selection) — NOT persisted and NOT in undo history. Always clamped to an
 * existing layer; falls back to {@link DEFAULT_LAYER_ID}.
 */
export const $activeLayerId = atom<string>(DEFAULT_LAYER_ID)
export const $toolMode = atom<ToolMode>('translate')
export const $snap = atom<SnapSettings>({})
// Nudge/rotate tool preferences. Global (not per-project) and persisted to
// localStorage so they survive reloads and apply across every project; cleared by
// "Reset Everything" (which wipes localStorage). React reads via `useStore`.
/** Active nudge axis. Default 'y' — the vertical/world-up axis. */
export const $nudgeAxis = persistentJSON<NudgeAxis>('flexo:nudgeAxis', 'y')
/** Distance (m) each arrow-key nudge moves the selection. Adjusted by the M keys. */
export const $nudgeStep = persistentJSON<number>('flexo:nudgeStep', 0.1)
/** Degrees each rotate key (W/S, A/D, Q/E) turns the selection. Adjusted by F/⇧F. */
export const $rotateStep = persistentJSON<number>('flexo:rotateStep', 45)
/**
 * Cyclic offset (0/1/2) applied to every rotate pair's base axis, advanced by the
 * R key. 0 = the default mapping (W/S=X, A/D=Y, Q/E=Z); see {@link rotatePairAxis}.
 */
export const $rotateAxisOffset = persistentJSON<number>('flexo:rotateAxisOffset', 0)
/**
 * How multi-select scale treats positions. 'smart' (default) scales the whole
 * group about its centroid so both sizes and inter-object gaps shrink/grow by the
 * same factor; 'inPlace' multiplies each item's own scale only, leaving positions
 * fixed (the legacy behavior). Drives both the numeric inspector and the 3D gizmo.
 */
export type BulkScaleMode = 'smart' | 'inPlace'
export const $bulkScaleMode = persistentJSON<BulkScaleMode>('flexo:bulkScaleMode', 'smart')
export const $canUndo = atom(false)
export const $canRedo = atom(false)
/** Description of the action that will be undone next (empty when nothing to undo). */
export const $undoDescription = atom<string>('')
/** Description of the action that will be redone next (empty when nothing to redo). */
export const $redoDescription = atom<string>('')

// ---------------------------------------------------------------------------
// Editor-aid store registration
//
// containerStore and measurementStore are separate from $part but must be
// snapshotted together with it for undo/redo. To avoid circular module
// imports, the actual atom accessors are registered by main.tsx at startup
// via registerEditorAidStores(). Until then, the stubs return/ignore empty
// arrays (which is safe — no undo is possible before the app boots).
// ---------------------------------------------------------------------------

let _getContainers: () => ReferenceContainer[] = () => []
let _setContainers: (c: ReferenceContainer[]) => void = () => {}
let _getMeasurements: () => LineMeasurement[] = () => []
let _setMeasurements: (m: LineMeasurement[]) => void = () => {}

/**
 * Wires containerStore and measurementStore into the undo/redo system. Call
 * ONCE at app startup (before any user interactions) in main.tsx. The setter
 * callbacks are responsible for clamping ephemeral state (active container /
 * active measurement) when those ids no longer exist after a restore.
 */
export function registerEditorAidStores(opts: {
  getContainers: () => ReferenceContainer[]
  setContainers: (c: ReferenceContainer[]) => void
  getMeasurements: () => LineMeasurement[]
  setMeasurements: (m: LineMeasurement[]) => void
}): void {
  _getContainers = opts.getContainers
  _setContainers = opts.setContainers
  _getMeasurements = opts.getMeasurements
  _setMeasurements = opts.setMeasurements
}

/** An entry in the undo or redo stack: the document snapshot plus a human-readable label. */
export interface HistoryEntry {
  part: EditingPart
  containers: ReferenceContainer[]
  measurements: LineMeasurement[]
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
    items.push({
      description: redoStack[i].description,
      detail: redoStack[i].detail,
      stepsFromCurrent: redoStack.length - i,
    })
  }
  items.push({ description: '', detail: '', stepsFromCurrent: 0 })
  for (let i = undoStack.length - 1; i >= 0; i--) {
    items.push({
      description: undoStack[i].description,
      detail: undoStack[i].detail,
      stepsFromCurrent: -(undoStack.length - i),
    })
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
  if (clampedCon.length !== $selectedConnectorIndices.get().length)
    $selectedConnectorIndices.set(clampedCon)
  const clampedKit = $selectedKittenIndices.get().filter((i) => i >= 0 && i < part.kittens.length)
  if (clampedKit.length !== $selectedKittenIndices.get().length)
    $selectedKittenIndices.set(clampedKit)
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
  undoStack.push({
    part: clone($part.get()),
    containers: structuredClone(_getContainers()),
    measurements: structuredClone(_getMeasurements()),
    description,
    detail,
  })
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  redoStack.length = 0
  refreshHistoryFlags()
}

/** Undoes the last action. Returns a formatted label (e.g. "move · thruster_1_1") for toast display. */
export function undo(): string {
  const entry = undoStack.pop()
  if (!entry) return ''
  redoStack.push({
    part: clone($part.get()),
    containers: structuredClone(_getContainers()),
    measurements: structuredClone(_getMeasurements()),
    description: entry.description,
    detail: entry.detail,
  })
  $part.set(entry.part)
  _setContainers(entry.containers)
  _setMeasurements(entry.measurements)
  clampSelection()
  clampActiveLayer()
  refreshHistoryFlags()
  return entry.detail ? `${entry.description} · ${entry.detail}` : entry.description
}

/** Redoes the next action. Returns a formatted label (e.g. "add part · bolt_2") for toast display. */
export function redo(): string {
  const entry = redoStack.pop()
  if (!entry) return ''
  undoStack.push({
    part: clone($part.get()),
    containers: structuredClone(_getContainers()),
    measurements: structuredClone(_getMeasurements()),
    description: entry.description,
    detail: entry.detail,
  })
  $part.set(entry.part)
  _setContainers(entry.containers)
  _setMeasurements(entry.measurements)
  clampSelection()
  clampActiveLayer()
  refreshHistoryFlags()
  return entry.detail ? `${entry.description} · ${entry.detail}` : entry.description
}

/** A serializable snapshot of the undo/redo stacks (newest-last), for project persistence. */
export interface HistorySnapshot {
  undo: Array<{
    part: EditingPart
    containers?: ReferenceContainer[]
    measurements?: LineMeasurement[]
    description: string
    detail: string
  }>
  redo: Array<{
    part: EditingPart
    containers?: ReferenceContainer[]
    measurements?: LineMeasurement[]
    description: string
    detail: string
  }>
}

/**
 * Exports a deep copy of the current undo/redo stacks. Used by projectStore to
 * persist history as part of a project (so undo survives a reload), keeping the
 * stacks module-private otherwise.
 */
export function exportHistory(): HistorySnapshot {
  return {
    undo: undoStack.map((e) => ({
      part: clone(e.part),
      containers: structuredClone(e.containers),
      measurements: structuredClone(e.measurements),
      description: e.description,
      detail: e.detail,
    })),
    redo: redoStack.map((e) => ({
      part: clone(e.part),
      containers: structuredClone(e.containers),
      measurements: structuredClone(e.measurements),
      description: e.description,
      detail: e.detail,
    })),
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
    const e = raw as {
      part?: EditingPart
      containers?: ReferenceContainer[]
      measurements?: LineMeasurement[]
      description?: string
      detail?: string
    } & EditingPart
    undoStack.push({
      part: clone(e.part ?? (e as EditingPart)),
      containers: structuredClone(e.containers ?? []),
      measurements: structuredClone(e.measurements ?? []),
      description: e.description ?? 'edit',
      detail: e.detail ?? '',
    })
  }
  for (const raw of snapshot.redo as unknown[]) {
    const e = raw as {
      part?: EditingPart
      containers?: ReferenceContainer[]
      measurements?: LineMeasurement[]
      description?: string
      detail?: string
    } & EditingPart
    redoStack.push({
      part: clone(e.part ?? (e as EditingPart)),
      containers: structuredClone(e.containers ?? []),
      measurements: structuredClone(e.measurements ?? []),
      description: e.description ?? 'edit',
      detail: e.detail ?? '',
    })
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

/** GameData carried into {@link addPart} from a built-in Part so its imports keep it. */
export interface ImportedGameData {
  /** Connector-bound coupling bindings (connectorIds in the source's original id space). */
  decoupler: Decoupler | null
  dockingPort: DockingPort | null
  evaDoor: EvaDoor | null
  /** Part-level power modules — appended to the project's part (a Part may carry several). */
  batteries: Battery[]
  generators: Generator[]
  solarPanels: SolarPanel[]
  powerConsumers: PowerConsumer[]
  /** Per-SubPart-template data (tanks / solar panels) for the imported SubParts. */
  subPartGameData: SubPartGameData[]
}

/**
 * Applies an imported Part's GameData onto the project's part. Coupling bindings are
 * singular: filled only when not already set, remapping each binding's connector id
 * from the source's original id space through `connectorIdMap` (a binding whose
 * connector isn't among the imported connectors is skipped). Power modules are lists
 * and are appended (a Part can carry several batteries / panels). Per-SubPart-template
 * data is added for any template the project doesn't already have an entry for (the
 * existing entry wins so prior user edits aren't clobbered). Mirrors mergeGameData in
 * projectTransfer.ts so built-in and project imports behave identically.
 */
function applyImportedGameData(
  target: EditingPart,
  src: ImportedGameData,
  connectorIdMap: ReadonlyMap<string, string>,
): void {
  const game = target.gameData
  if (game.decoupler == null && src.decoupler) {
    const id = connectorIdMap.get(src.decoupler.connectorId)
    if (id) game.decoupler = { ...src.decoupler, connectorId: id }
  }
  if (game.dockingPort == null && src.dockingPort) {
    const id = connectorIdMap.get(src.dockingPort.connectorId)
    if (id) game.dockingPort = { ...src.dockingPort, connectorId: id }
  }
  if (game.evaDoor == null && src.evaDoor) {
    const id = connectorIdMap.get(src.evaDoor.connectorId)
    if (id) game.evaDoor = { connectorId: id }
  }
  game.batteries.push(...src.batteries)
  game.generators.push(...src.generators)
  game.solarPanels.push(...src.solarPanels)
  game.powerConsumers.push(...src.powerConsumers)
  for (const spd of src.subPartGameData) {
    if (!target.subPartGameData.some((s) => s.subPartTemplateId === spd.subPartTemplateId)) {
      target.subPartGameData.push(spd)
    }
  }
}

/**
 * Imports a whole Part by appending all of its SubPart instances to the current
 * project, preserving each one's position/rotation/scale, along with the Part's
 * connectors (transforms + flags), editor tags, and connector-bound coupling
 * game-data (decoupler / docking port / EVA door). InstanceIds and connector ids
 * are regenerated so they never collide with entities already in the project; the
 * imported editor tags are unioned into the project's tags and coupling bindings
 * are rewired to the regenerated connector ids. Imported SubParts land in
 * `targetLayerId` when given (and it exists), else the active layer; connectors
 * always go to the built-in Connectors layer
 * (layers are editor-only and absent from KSA XML). The last added SubPart is
 * selected (or the last connector if the Part has no SubParts).
 */
export function addPart(
  placements: readonly SubPartPlacement[],
  connectors: readonly Connector[] = [],
  editorTags: readonly string[] = [],
  targetLayerId?: string,
  /**
   * Optional builder for animations imported alongside the Part. Receives the
   * old→new instance-id map (instance ids are regenerated below to avoid collisions),
   * so it can remap the animation's joint members / solar-tracking SubPart refs. Kept
   * as a callback so editorStore stays three.js-free (the GLB decode lives in the
   * importBuiltInPart wrapper).
   */
  buildAnimations?: (idMap: ReadonlyMap<string, string>) => PartAnimation[],
  /**
   * GameData from the Part being imported (coupling bindings, power modules, and
   * per-SubPart-template tanks / solar panels). Coupling `connectorId`s are in the
   * source's original id space and get remapped onto the freshly-generated connector
   * ids below. See {@link applyImportedGameData} for the per-field merge rules.
   */
  imported?: ImportedGameData,
): string {
  if (placements.length === 0 && connectors.length === 0) return DEFAULT_LAYER_ID
  const importDetail =
    placements.length > 0 && connectors.length === 0
      ? placements.length === 1
        ? lastSegmentLower(placements[0].subPartTemplateId)
        : `${placements.length} parts`
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
  const importedSubIndices: number[] = []
  // Original KSA instance id → regenerated id, so imported animations can rewire their
  // joint members / solar-tracking refs (which target SubParts by their original id).
  const idMap = new Map<string, string>()
  for (const src of placements) {
    const base = lastSegmentLower(src.subPartTemplateId)
    const count = part.placements.filter(
      (p) => p.subPartTemplateId === src.subPartTemplateId,
    ).length
    const instanceId = `${base}_${count + 1}`
    idMap.set(src.instanceId, instanceId)
    part.placements.push({
      instanceId,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId,
    })
    importedSubIndices.push(part.placements.length - 1)
  }
  if (buildAnimations) part.animations.push(...buildAnimations(idMap))
  // Original KSA connector id → regenerated id, so imported coupling bindings
  // (which target connectors by their original id) can be rewired.
  const connectorIdMap = new Map<string, string>()
  for (const src of connectors) {
    const id = nextConnectorId(part) // regenerated against the growing list
    connectorIdMap.set(src.id, id)
    part.connectors.push({
      id,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      flags: [...src.flags],
      layerId: CONNECTOR_LAYER_ID, // connectors always live in the Connectors layer
    })
  }
  if (imported) applyImportedGameData(part, imported, connectorIdMap)
  $part.set(part)
  // Select exactly the imported SubParts (not any pre-existing ones on the layer);
  // for a connectors-only import, fall back to selecting the last connector.
  if (importedSubIndices.length > 0) setSelection(importedSubIndices, [], [])
  else if (part.connectors.length > 0) selectConnector(part.connectors.length - 1)
  return layerId
}

/**
 * Additively imports a project-export envelope (see src/state/projectTransfer.ts) into
 * the current workspace in one undo step: meshes/connectors/kittens/animations/GameData
 * are appended with collision-free ids and all cross-references remapped. Imported
 * meshes land on freshly-created layers mirroring the source's (so the existing Default
 * is untouched); the first new layer becomes active so the user lands on the import.
 */
export function importProjectData(env: ProjectExportEnvelope): ImportSummary {
  const { part, summary, newLayerIds } = mergeProjectImport($part.get(), env)
  const detail =
    [
      summary.meshes ? `${summary.meshes} mesh${summary.meshes === 1 ? '' : 'es'}` : '',
      summary.connectors
        ? `${summary.connectors} connector${summary.connectors === 1 ? '' : 's'}`
        : '',
      summary.animations
        ? `${summary.animations} animation${summary.animations === 1 ? '' : 's'}`
        : '',
    ]
      .filter(Boolean)
      .join(', ') || 'nothing'
  pushUndo('import project', detail)
  $part.set(part)
  // New layers aren't in $layerView (which defaults to visible), so no reveal needed.
  if (newLayerIds.length > 0) $activeLayerId.set(newLayerIds[0])
  return summary
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

/** Adds a kitten visual aide at the origin (on the built-in Kittens layer) and selects it. */
export function addKitten(kind: KittenKind): void {
  const current = $part.get()
  const newId = nextKittenId(current)
  pushUndo('add kitten', kind)
  const part = clone(current)
  part.kittens.push({
    id: newId,
    kind,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: KITTEN_LAYER_ID,
  })
  $part.set(part)
  selectKitten(part.kittens.length - 1)
}

/** Returns the next free "kitten_N" id (max existing N + 1). */
function nextKittenId(part: EditingPart): string {
  let max = 0
  for (const k of part.kittens) {
    const m = /^kitten_(\d+)$/.exec(k.id)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `kitten_${max + 1}`
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
  pushUndo(
    'connector flags',
    `${current.connectors[index].id} → ${flags.length ? flags.join(', ') : 'none'}`,
  )
  const part = clone(current)
  part.connectors[index].flags = [...flags]
  $part.set(part)
}

/**
 * Removes every selected entity — SubParts, connectors, AND kittens — in one undo
 * step. A single-entity delete keeps a neighbor of that kind selected (matching the
 * old per-kind behavior); any multi/mixed delete clears the selection.
 */
export function removeSelected(): void {
  const part0 = $part.get()
  const sub = $selectedIndices.get().filter((i) => i >= 0 && i < part0.placements.length)
  const con = $selectedConnectorIndices.get().filter((i) => i >= 0 && i < part0.connectors.length)
  const kit = $selectedKittenIndices.get().filter((i) => i >= 0 && i < part0.kittens.length)
  const total = sub.length + con.length + kit.length
  if (total === 0) return

  const kinds = (sub.length ? 1 : 0) + (con.length ? 1 : 0) + (kit.length ? 1 : 0)
  const description =
    kinds > 1
      ? 'delete'
      : sub.length
        ? sub.length === 1
          ? 'delete part'
          : 'delete parts'
        : con.length
          ? con.length === 1
            ? 'delete connector'
            : 'delete connectors'
          : kit.length === 1
            ? 'delete kitten'
            : 'delete kittens'
  const detail =
    total === 1
      ? ((sub.length
          ? part0.placements[sub[0]]?.instanceId
          : con.length
            ? part0.connectors[con[0]]?.id
            : part0.kittens[kit[0]]?.id) ?? '')
      : [
          sub.length ? `${sub.length} part${sub.length === 1 ? '' : 's'}` : '',
          con.length ? `${con.length} connector${con.length === 1 ? '' : 's'}` : '',
          kit.length ? `${kit.length} kitten${kit.length === 1 ? '' : 's'}` : '',
        ]
          .filter(Boolean)
          .join(', ')
  pushUndo(description, detail)

  const part = clone(part0)
  // Splice each array in descending order so earlier indices stay valid.
  for (const i of [...sub].sort((a, b) => b - a)) part.placements.splice(i, 1)
  for (const i of [...con].sort((a, b) => b - a)) part.connectors.splice(i, 1)
  for (const i of [...kit].sort((a, b) => b - a)) part.kittens.splice(i, 1)
  $part.set(part)

  if (total === 1 && sub.length === 1 && part.placements.length > 0) {
    setSelection([Math.min(sub[0], part.placements.length - 1)], [], [])
  } else if (total === 1 && con.length === 1 && part.connectors.length > 0) {
    setSelection([], [Math.min(con[0], part.connectors.length - 1)], [])
  } else if (total === 1 && kit.length === 1 && part.kittens.length > 0) {
    setSelection([], [], [Math.min(kit[0], part.kittens.length - 1)])
  } else {
    clearSelection()
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

/** Duplicates every selected entity (SubParts, connectors, kittens) and selects the copies. */
export function duplicateSelected(): void {
  const part0 = $part.get()
  const sub = $selectedIndices.get().filter((i) => i >= 0 && i < part0.placements.length)
  const con = $selectedConnectorIndices.get().filter((i) => i >= 0 && i < part0.connectors.length)
  const kit = $selectedKittenIndices.get().filter((i) => i >= 0 && i < part0.kittens.length)
  const total = sub.length + con.length + kit.length
  if (total === 0) return

  const kinds = (sub.length ? 1 : 0) + (con.length ? 1 : 0) + (kit.length ? 1 : 0)
  const detail =
    total === 1
      ? ((sub.length
          ? part0.placements[sub[0]]?.instanceId
          : con.length
            ? part0.connectors[con[0]]?.id
            : part0.kittens[kit[0]]?.id) ?? '')
      : kinds > 1
        ? `${total} items`
        : sub.length
          ? `${sub.length} parts`
          : con.length
            ? `${con.length} connectors`
            : `${kit.length} kittens`
  pushUndo('duplicate', detail)

  const part = clone(part0)
  const newSub: number[] = []
  const newCon: number[] = []
  const newKit: number[] = []
  for (const i of [...sub].sort((a, b) => a - b)) {
    const src = part.placements[i]
    if (!src) continue
    const base = lastSegmentLower(src.subPartTemplateId)
    const count = part.placements.filter(
      (p) => p.subPartTemplateId === src.subPartTemplateId,
    ).length
    part.placements.push({
      instanceId: `${base}_${count + 1}`,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId: src.layerId,
    })
    newSub.push(part.placements.length - 1)
  }
  for (const i of [...con].sort((a, b) => a - b)) {
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
    newCon.push(part.connectors.length - 1)
  }
  for (const i of [...kit].sort((a, b) => a - b)) {
    const src = part.kittens[i]
    if (!src) continue
    part.kittens.push({
      id: nextKittenId(part),
      kind: src.kind,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId: KITTEN_LAYER_ID,
    })
    newKit.push(part.kittens.length - 1)
  }
  $part.set(part)
  setSelection(newSub, newCon, newKit)
}

/** Human label for a count of mixed entities, e.g. "3 parts" or "5 items". */
function entityCountLabel(sub: number, con: number, kit: number): string {
  const total = sub + con + kit
  const kinds = (sub ? 1 : 0) + (con ? 1 : 0) + (kit ? 1 : 0)
  if (kinds > 1) return `${total} items`
  if (sub) return `${sub} ${sub === 1 ? 'part' : 'parts'}`
  if (con) return `${con} ${con === 1 ? 'connector' : 'connectors'}`
  return `${kit} ${kit === 1 ? 'kitten' : 'kittens'}`
}

/**
 * Copies the current selection (SubParts, connectors, kittens) into the in-app
 * {@link $clipboard}, stripping ids so a later paste regenerates fresh ones.
 * Leaves the workspace and selection untouched. Returns how many entities were
 * copied (0 when nothing is selected — the clipboard is left as-is).
 */
export function copySelected(): number {
  const part = $part.get()
  const sub = $selectedIndices.get().filter((i) => i >= 0 && i < part.placements.length)
  const con = $selectedConnectorIndices.get().filter((i) => i >= 0 && i < part.connectors.length)
  const kit = $selectedKittenIndices.get().filter((i) => i >= 0 && i < part.kittens.length)
  const total = sub.length + con.length + kit.length
  if (total === 0) return 0
  const order = (a: number, b: number) => a - b
  $clipboard.set({
    placements: [...sub].sort(order).map((i) => structuredClone(part.placements[i])),
    connectors: [...con].sort(order).map((i) => structuredClone(part.connectors[i])),
    kittens: [...kit].sort(order).map((i) => structuredClone(part.kittens[i])),
  })
  return total
}

/**
 * Pastes the {@link $clipboard} contents back into the workspace in place (same
 * position/rotation/scale they were copied at), regenerating ids so the pastes
 * never collide with existing entities, and selects the newly pasted entities.
 * Discrete mutation → records one undo step. A pasted SubPart keeps its original
 * layer when that layer still exists, else falls back to the active layer (the
 * clipboard can outlive the layer it was copied from). Returns how many entities
 * were pasted (0 when the clipboard is empty).
 */
export function pasteClipboard(): number {
  const clip = $clipboard.get()
  if (!clip) return 0
  const total = clip.placements.length + clip.connectors.length + clip.kittens.length
  if (total === 0) return 0

  pushUndo(
    'paste',
    entityCountLabel(clip.placements.length, clip.connectors.length, clip.kittens.length),
  )
  const part = clone($part.get())
  const newSub: number[] = []
  const newCon: number[] = []
  const newKit: number[] = []
  for (const src of clip.placements) {
    const base = lastSegmentLower(src.subPartTemplateId)
    const count = part.placements.filter(
      (p) => p.subPartTemplateId === src.subPartTemplateId,
    ).length
    const layerId = part.layers.some((l) => l.id === src.layerId)
      ? src.layerId
      : currentLayerId(part)
    part.placements.push({
      instanceId: `${base}_${count + 1}`,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId,
    })
    newSub.push(part.placements.length - 1)
  }
  for (const src of clip.connectors) {
    part.connectors.push({
      id: nextConnectorId(part),
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      flags: [...src.flags],
      layerId: CONNECTOR_LAYER_ID,
    })
    newCon.push(part.connectors.length - 1)
  }
  for (const src of clip.kittens) {
    part.kittens.push({
      id: nextKittenId(part),
      kind: src.kind,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId: KITTEN_LAYER_ID,
    })
    newKit.push(part.kittens.length - 1)
  }
  $part.set(part)
  setSelection(newSub, newCon, newKit)
  return total
}

/**
 * Duplicates a single SubPart by index (used by the per-row context menu, which
 * acts on its own row regardless of the current selection). Discrete mutation →
 * records undo. The copy lands on the same layer and is selected.
 */
export function duplicatePlacement(index: number): void {
  const current = $part.get()
  const src = current.placements[index]
  if (!src) return
  pushUndo('duplicate', src.instanceId)
  const part = clone(current)
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
  $part.set(part)
  setSelectedPlacements([part.placements.length - 1])
}

/** Replaces the SubPart selection with a single index (clears any connector/kitten selection). */
export function selectPlacement(index: number): void {
  $selectedConnectorIndices.set([])
  $selectedKittenIndices.set([])
  $selectedIndices.set(index >= 0 ? [index] : [])
}

/** Replaces the SubPart selection with the given indices (deduped, order-preserving). */
export function setSelectedPlacements(indices: readonly number[]): void {
  $selectedConnectorIndices.set([])
  $selectedKittenIndices.set([])
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

/** Adds or removes a SubPart index from the current selection (clears connector/kitten selection). */
export function togglePlacement(index: number): void {
  if (index < 0) return
  $selectedConnectorIndices.set([])
  $selectedKittenIndices.set([])
  const current = $selectedIndices.get()
  $selectedIndices.set(
    current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
  )
}

/** Selects a connector by index (clears any SubPart/kitten selection). */
export function selectConnector(index: number): void {
  $selectedIndices.set([])
  $selectedKittenIndices.set([])
  $selectedConnectorIndices.set(index >= 0 ? [index] : [])
}

/** Replaces connector selection with the given indices (deduped, order-preserving). Clears SubPart/kitten selection. */
export function setSelectedConnectors(indices: readonly number[]): void {
  $selectedIndices.set([])
  $selectedKittenIndices.set([])
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

/** Selects a kitten by index (clears any SubPart/connector selection). */
export function selectKitten(index: number): void {
  $selectedIndices.set([])
  $selectedConnectorIndices.set([])
  $selectedKittenIndices.set(index >= 0 ? [index] : [])
}

/** Replaces kitten selection with the given indices (deduped, order-preserving). Clears SubPart/connector selection. */
export function setSelectedKittens(indices: readonly number[]): void {
  $selectedIndices.set([])
  $selectedConnectorIndices.set([])
  const seen = new Set<number>()
  const next: number[] = []
  for (const i of indices) {
    if (i >= 0 && !seen.has(i)) {
      seen.add(i)
      next.push(i)
    }
  }
  $selectedKittenIndices.set(next)
}

/** Clears all selection. */
export function clearSelection(): void {
  $selectedIndices.set([])
  $selectedConnectorIndices.set([])
  $selectedKittenIndices.set([])
}

/** An entity kind that can be selected (SubPart placement, connector, or kitten). */
export type SelectableKind = 'subpart' | 'connector' | 'kitten'

const dedupeIndices = (xs: readonly number[]): number[] => {
  const seen = new Set<number>()
  const out: number[] = []
  for (const i of xs)
    if (i >= 0 && !seen.has(i)) {
      seen.add(i)
      out.push(i)
    }
  return out
}

/**
 * Unified selection setter — sets all three kind stores at once (deduped) WITHOUT
 * the mutual-exclusion clearing that the per-kind setters apply. This lets a
 * selection span SubParts, connectors, and kittens together (the Assets list's
 * native multi-select + select-all). Negative/duplicate indices are dropped.
 */
export function setSelection(
  subIndices: readonly number[],
  conIndices: readonly number[],
  kitIndices: readonly number[],
): void {
  $selectedIndices.set(dedupeIndices(subIndices))
  $selectedConnectorIndices.set(dedupeIndices(conIndices))
  $selectedKittenIndices.set(dedupeIndices(kitIndices))
}

/**
 * Toggles one entity in/out of the current selection, leaving the OTHER kinds
 * intact — additive (Shift/Cmd) click across kinds, so a connector can be added
 * to a SubPart selection without clearing it.
 */
export function toggleEntity(kind: SelectableKind, index: number): void {
  if (index < 0) return
  const store =
    kind === 'subpart'
      ? $selectedIndices
      : kind === 'connector'
        ? $selectedConnectorIndices
        : $selectedKittenIndices
  const cur = store.get()
  store.set(cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index])
}

/**
 * The entity the Assets list should scroll into view, identified by kind + stable
 * id (instanceId / connector id / kitten id). Set when a selection originates from
 * a 3D viewport click — the list has no other way to know the click happened. A
 * fresh object is published on every reveal (even for the same entity, e.g. a
 * deselect-then-reselect) so the list's effect re-fires; the list nulls it once
 * consumed. Ephemeral UI state: not persisted, not in undo history.
 */
export const $revealEntity = atom<{ kind: SelectableKind; id: string } | null>(null)

/** Asks the Assets list to scroll `id` (of `kind`) into view — used by 3D-click selection. */
export function revealEntity(kind: SelectableKind, id: string): void {
  $revealEntity.set({ kind, id })
}

/** A selected entity plus its current transform — the unit of bulk transform work. */
export interface SelectedTransformRef {
  kind: SelectableKind
  index: number
  transform: PlacementTransform
  layerId: string
  name: string
}

/** All selected entities (SubParts, then connectors, then kittens) with their transforms. */
export function selectedTransformRefs(): SelectedTransformRef[] {
  const part = $part.get()
  const tx = (e: PlacementTransform): PlacementTransform => ({
    position: { ...e.position },
    rotation: { ...e.rotation },
    scale: { ...e.scale },
  })
  const out: SelectedTransformRef[] = []
  for (const i of $selectedIndices.get()) {
    const p = part.placements[i]
    if (p)
      out.push({
        kind: 'subpart',
        index: i,
        transform: tx(p),
        layerId: p.layerId,
        name: p.instanceId,
      })
  }
  for (const i of $selectedConnectorIndices.get()) {
    const c = part.connectors[i]
    if (c)
      out.push({ kind: 'connector', index: i, transform: tx(c), layerId: c.layerId, name: c.id })
  }
  for (const i of $selectedKittenIndices.get()) {
    const k = part.kittens[i]
    if (k) out.push({ kind: 'kitten', index: i, transform: tx(k), layerId: k.layerId, name: k.id })
  }
  return out
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

/** Like {@link updatePlacementTransform} but for a kitten. No undo (see above). */
export function updateKittenTransform(index: number, t: PlacementTransform): void {
  const current = $part.get()
  if (index < 0 || index >= current.kittens.length) return
  const part = clone(current)
  const k = part.kittens[index]
  k.position = { ...t.position }
  k.rotation = { ...t.rotation }
  k.scale = { ...t.scale }
  $part.set(part)
}

/**
 * Applies transforms to a MIX of selected entities (SubParts/connectors/kittens)
 * in a single store update — the bulk write-back for a unified multi-selection
 * (gizmo drag, keyboard nudge/rotate, inspector bulk panel). No undo — the caller
 * pushes once at interaction start.
 */
export function updateSelectedTransforms(
  updates: readonly { kind: SelectableKind; index: number; transform: PlacementTransform }[],
): void {
  if (updates.length === 0) return
  const part = clone($part.get())
  const assign = (e: PlacementTransform | undefined, t: PlacementTransform) => {
    if (!e) return
    e.position = { ...t.position }
    e.rotation = { ...t.rotation }
    e.scale = { ...t.scale }
  }
  for (const { kind, index, transform } of updates) {
    if (kind === 'subpart') assign(part.placements[index], transform)
    else if (kind === 'connector') assign(part.connectors[index], transform)
    else assign(part.kittens[index], transform)
  }
  $part.set(part)
}

/**
 * Scales the ENTIRE workspace by per-axis factors around the world origin
 * (0,0,0): every placed SubPart, connector, and kitten, AND every animation
 * keyframe pose. Rotations and keyframe times are left untouched. One undoable
 * step. Anchored at the origin so the Part's mount reference stays fixed.
 *
 * This is the animation-safe counterpart to a multi-select gizmo resize, which
 * only touches the selected placements and silently breaks animation offsets.
 *
 * GEOMETRY INSTANCES (placements/connectors/kittens) are rig LEAVES — a point
 * map `Σ·placement` — so both `position` and `scale` multiply (the mesh grows).
 *
 * ANIMATION JOINT POSES are INTERIOR nodes of the preview/export rig:
 *   world(leaf,t) = L_root·…·L_J · placement,  L_J = T(pos)·R(rot)·S(scale)
 * A uniform scale about the origin is the CONJUGATION Σ·L·Σ⁻¹ = T(Σ·pos)·R·S, so
 * only the pose TRANSLATION scales — rotation and pose-scale stay put. Scaling a
 * pose's `scale` bakes a bogus factor into every descendant joint (double-scaling
 * the chain); a lone hinge survives only because its single scale cancels in
 * W_J(t)·W_J(rest)⁻¹, but multi-joint bay/solar rigs shear apart.
 *
 * (Non-uniform factors are exact for static placements and root joints, but only
 * approximate for rotated child joints — rotation doesn't commute with a
 * non-uniform scale — the same limitation as the multi-select gizmo's scale.)
 *
 * Reference containers and ruler measurements are intentionally left untouched
 * (they are fixed size references / annotations, not part geometry).
 */
export function scaleEverything(factor: Vec3): void {
  const { x, y, z } = factor
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
  if (x === 1 && y === 1 && z === 1) return
  pushUndo('scale everything', `${x}×${y}×${z}`)
  const part = clone($part.get())
  const scalePos = (p: Vec3): Vec3 => ({ x: p.x * x, y: p.y * y, z: p.z * z })
  const scaleInstance = (e: { position: Vec3; scale: Vec3 }): void => {
    e.position = scalePos(e.position)
    e.scale = scalePos(e.scale)
  }
  for (const p of part.placements) scaleInstance(p)
  for (const c of part.connectors) scaleInstance(c)
  for (const k of part.kittens) scaleInstance(k)
  for (const a of part.animations) {
    for (const kf of a.keyframes) {
      // Translation only — see the conjugation note above.
      for (const pose of Object.values(kf.poses)) pose.position = scalePos(pose.position)
    }
  }
  $part.set(part)
}

/**
 * Updates the transform of whichever entity is selected (SubPart, connector, or
 * kitten). No undo — the caller pushes once at interaction start.
 */
export function updateSelectedTransform(t: PlacementTransform): void {
  const ki = $selectedKittenIndex.get()
  if (ki >= 0) {
    updateKittenTransform(ki, t)
    return
  }
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
  const tagsDetail =
    editorTags.length === 0
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

/** Default decoupler separation force (N) when a decoupler is first enabled (matches space-tape). */
const DEFAULT_COUPLING_FORCE = 500
/** Default magnetic latching impulse (N·s) when a docking port is first enabled (matches CoreCouplingA). */
const DEFAULT_LATCHING_IMPULSE = 6000
/** Default undock push-off force (N) when a docking port is first enabled (matches CoreCouplingA). */
const DEFAULT_PUSHOFF_FORCE = 7000
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

// --- SubPart GameData (per-template) ---

function getOrCreateSubPartData(part: EditingPart, subPartTemplateId: string): SubPartGameData {
  let spd = part.subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  if (!spd) {
    spd = { subPartTemplateId, tanks: [], solarPanels: [], lights: [] }
    part.subPartGameData.push(spd)
  }
  return spd
}

function mutateSubPartData(subPartTemplateId: string, mutate: (s: SubPartGameData) => void): void {
  const part = clone($part.get())
  mutate(getOrCreateSubPartData(part, subPartTemplateId))
  part.subPartGameData = part.subPartGameData.filter((s) => !isSubPartGameDataEmpty(s))
  $part.set(part)
}

function commitSubPartData(
  label: string,
  detail: string,
  subPartTemplateId: string,
  mutate: (s: SubPartGameData) => void,
): void {
  pushUndo(label, detail)
  mutateSubPartData(subPartTemplateId, mutate)
}

// --- Tanks (per SubPart template) ---

/** Discrete: append a default tank for the given SubPart template. */
export function addTank(subPartTemplateId: string): void {
  commitSubPartData('add tank', '', subPartTemplateId, (s) => s.tanks.push(createTank()))
}

/** Discrete: remove the tank at `index` for the given SubPart template. */
export function removeTank(subPartTemplateId: string, index: number): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  if (!spd || index < 0 || index >= spd.tanks.length) return
  commitSubPartData('remove tank', '', subPartTemplateId, (s) => s.tanks.splice(index, 1))
}

/** Discrete: change a tank's shape (cylindrical/spherical). */
export function setTankShape(subPartTemplateId: string, index: number, shape: TankShape): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  if (!spd || index < 0 || index >= spd.tanks.length) return
  commitSubPartData('tank shape', shape, subPartTemplateId, (s) => {
    s.tanks[index].shape = shape
  })
}

/** Streaming: patch a tank's numeric/material fields. Caller pushes undo on field focus. */
export function updateTank(subPartTemplateId: string, index: number, patch: Partial<Tank>): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  if (!spd || index < 0 || index >= spd.tanks.length) return
  mutateSubPartData(subPartTemplateId, (s) => {
    s.tanks[index] = { ...s.tanks[index], ...patch }
  })
}

// --- Solar panels (per SubPart template) ---

/** Discrete: append a default solar panel for the given SubPart template. */
export function addSubPartSolarPanel(subPartTemplateId: string): void {
  commitSubPartData('add solar panel', '', subPartTemplateId, (s) =>
    s.solarPanels.push(createSolarPanel()),
  )
}

/** Discrete: remove the solar panel at `index` for the given SubPart template. */
export function removeSubPartSolarPanel(subPartTemplateId: string, index: number): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  if (!spd || index < 0 || index >= spd.solarPanels.length) return
  commitSubPartData('remove solar panel', '', subPartTemplateId, (s) =>
    s.solarPanels.splice(index, 1),
  )
}

/** Streaming: set a SubPart solar panel's output (W). Caller pushes undo on field focus. */
export function setSubPartSolarPanelOutput(
  subPartTemplateId: string,
  index: number,
  outputWatts: number,
): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  if (!spd || index < 0 || index >= spd.solarPanels.length) return
  mutateSubPartData(subPartTemplateId, (s) => {
    s.solarPanels[index].outputWatts = outputWatts
  })
}

/** Streaming: set a SubPart solar panel's orientation rotation (Euler XYZ radians). */
export function setSubPartSolarPanelRotation(
  subPartTemplateId: string,
  index: number,
  rotation: EulerXYZ,
): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  if (!spd || index < 0 || index >= spd.solarPanels.length) return
  mutateSubPartData(subPartTemplateId, (s) => {
    s.solarPanels[index].transform.rotation = rotation
  })
}

// --- Lights (per SubPart template) ---

/** True when `index` is a valid light slot on the given SubPart template. */
function hasLight(subPartTemplateId: string, index: number): boolean {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  return !!spd && index >= 0 && index < spd.lights.length
}

/** Discrete: append a default (white Spot) light for the given SubPart template. */
export function addLight(subPartTemplateId: string): void {
  commitSubPartData('add light', '', subPartTemplateId, (s) => s.lights.push(createLight()))
}

/** Discrete: remove the light at `index` for the given SubPart template. */
export function removeLight(subPartTemplateId: string, index: number): void {
  if (!hasLight(subPartTemplateId, index)) return
  commitSubPartData('remove light', '', subPartTemplateId, (s) => s.lights.splice(index, 1))
}

/** Discrete: change a light's type (Spot/Point). */
export function setLightType(subPartTemplateId: string, index: number, type: LightType): void {
  if (!hasLight(subPartTemplateId, index)) return
  commitSubPartData('light type', type, subPartTemplateId, (s) => {
    s.lights[index].type = type
  })
}

/** Discrete: toggle a light's IVA ray-tracing flag. */
export function setLightRayTracing(subPartTemplateId: string, index: number, on: boolean): void {
  if (!hasLight(subPartTemplateId, index)) return
  commitSubPartData('light ray tracing', on ? 'on' : 'off', subPartTemplateId, (s) => {
    s.lights[index].rayTracing = on
  })
}

/** Streaming: patch a light's scalar/color fields. Caller pushes undo on field focus. */
export function updateLight(subPartTemplateId: string, index: number, patch: Partial<Light>): void {
  if (!hasLight(subPartTemplateId, index)) return
  mutateSubPartData(subPartTemplateId, (s) => {
    s.lights[index] = { ...s.lights[index], ...patch }
  })
}

/** Streaming: set a light's local position (m). Caller pushes undo on field focus. */
export function setLightPosition(subPartTemplateId: string, index: number, position: Vec3): void {
  if (!hasLight(subPartTemplateId, index)) return
  mutateSubPartData(subPartTemplateId, (s) => {
    s.lights[index].transform.position = position
  })
}

/** Streaming: set a Spot light's aim rotation (Euler XYZ radians). */
export function setLightRotation(
  subPartTemplateId: string,
  index: number,
  rotation: EulerXYZ,
): void {
  if (!hasLight(subPartTemplateId, index)) return
  mutateSubPartData(subPartTemplateId, (s) => {
    s.lights[index].transform.rotation = rotation
  })
}

// --- Power (batteries / generators / consumers) ---

/** Discrete: append a battery (default capacity, in Wh). */
export function addBattery(): void {
  commitGameData('add battery', '', (g) => g.batteries.push({ capacityWh: 10 }))
}
/** Discrete: remove battery at `index`. */
export function removeBattery(index: number): void {
  if (index < 0 || index >= $part.get().gameData.batteries.length) return
  commitGameData('remove battery', '', (g) => g.batteries.splice(index, 1))
}
/** Streaming: set a battery's capacity (Wh). Caller pushes undo on field focus. */
export function setBatteryCapacity(index: number, capacityWh: number): void {
  if (index < 0 || index >= $part.get().gameData.batteries.length) return
  mutateGameData((g) => {
    g.batteries[index].capacityWh = capacityWh
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

// --- Solar panels (part-level) ---

/** Discrete: append a solar panel (default output, identity orientation). */
export function addSolarPanel(): void {
  commitGameData('add solar panel', '', (g) => g.solarPanels.push(createSolarPanel()))
}
/** Discrete: remove solar panel at `index`. */
export function removeSolarPanel(index: number): void {
  if (index < 0 || index >= $part.get().gameData.solarPanels.length) return
  commitGameData('remove solar panel', '', (g) => g.solarPanels.splice(index, 1))
}
/** Streaming: set a solar panel's output (W). Caller pushes undo on field focus. */
export function setSolarPanelOutput(index: number, outputWatts: number): void {
  if (index < 0 || index >= $part.get().gameData.solarPanels.length) return
  mutateGameData((g) => {
    g.solarPanels[index].outputWatts = outputWatts
  })
}
/** Streaming: set a solar panel's orientation rotation (Euler XYZ radians). */
export function setSolarPanelRotation(index: number, rotation: EulerXYZ): void {
  if (index < 0 || index >= $part.get().gameData.solarPanels.length) return
  mutateGameData((g) => {
    g.solarPanels[index].transform.rotation = rotation
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
    g.decoupler = enabled
      ? (g.decoupler ?? { connectorId: '', force: DEFAULT_COUPLING_FORCE })
      : null
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
    g.dockingPort = enabled
      ? (g.dockingPort ?? {
          connectorId: '',
          latchingImpulse: DEFAULT_LATCHING_IMPULSE,
          pushoffForce: DEFAULT_PUSHOFF_FORCE,
        })
      : null
  })
}
/** Discrete: bind the docking port to a connector id. */
export function setDockingPortConnector(connectorId: string): void {
  commitGameData('docking connector', connectorId, (g) => {
    if (g.dockingPort) g.dockingPort.connectorId = connectorId
  })
}
/** Streaming: set docking port latching impulse (N·s). Caller pushes undo on field focus. */
export function setDockingPortLatchingImpulse(latchingImpulse: number): void {
  mutateGameData((g) => {
    if (g.dockingPort) g.dockingPort.latchingImpulse = latchingImpulse
  })
}
/** Streaming: set docking port push-off force (N). Caller pushes undo on field focus. */
export function setDockingPortPushoffForce(pushoffForce: number): void {
  mutateGameData((g) => {
    if (g.dockingPort) g.dockingPort.pushoffForce = pushoffForce
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
export function nextLayerId(part: EditingPart): string {
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
    const valid =
      opts.targetLayerId &&
      opts.targetLayerId !== id &&
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

/**
 * Removes every entity (SubParts, connectors, kittens) on a layer WITHOUT deleting
 * the layer itself. Used by the protected built-in Connectors/Kittens layers, whose
 * delete button clears their contents instead of removing the (undeletable) layer.
 * Discrete mutation → one undo step. No-op when the layer is already empty.
 */
export function clearLayer(id: string): void {
  const current = $part.get()
  const onLayer = (e: { layerId: string }) => e.layerId === id
  const total =
    current.placements.filter(onLayer).length +
    current.connectors.filter(onLayer).length +
    current.kittens.filter(onLayer).length
  if (total === 0) return
  pushUndo('clear layer', current.layers.find((l) => l.id === id)?.name ?? id)
  const part = clone(current)
  part.placements = part.placements.filter((p) => p.layerId !== id)
  part.connectors = part.connectors.filter((c) => c.layerId !== id)
  part.kittens = part.kittens.filter((k) => k.layerId !== id)
  $part.set(part)
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
  // SubParts can't live on the special Connectors/Kittens layers.
  if (layerId === CONNECTOR_LAYER_ID || layerId === KITTEN_LAYER_ID) return
  const current = $part.get()
  const placement = current.placements[index]
  if (!placement || placement.layerId === layerId) return
  if (!current.layers.some((l) => l.id === layerId)) return
  pushUndo(
    'move to layer',
    `${current.placements[index].instanceId} → ${current.layers.find((l) => l.id === layerId)?.name ?? layerId}`,
  )
  const part = clone(current)
  part.placements[index].layerId = layerId
  $part.set(part)
}

/**
 * Moves every selected SubPart to `layerId` in a single undo step. Selection is
 * preserved: editing a placement's layerId doesn't reorder `placements`, so the
 * selected indices keep pointing at the same SubParts (and the Assets list shows
 * all layers, so they stay visible without changing the active layer). No-op for
 * the special Connectors/Kittens layers, an unknown layer, or an empty selection.
 */
export function moveSelectedPlacementsToLayer(layerId: string): void {
  // SubParts can't live on the special Connectors/Kittens layers.
  if (layerId === CONNECTOR_LAYER_ID || layerId === KITTEN_LAYER_ID) return
  const indices = $selectedIndices.get()
  if (indices.length === 0) return
  const current = $part.get()
  if (!current.layers.some((l) => l.id === layerId)) return
  const destLayerName = current.layers.find((l) => l.id === layerId)?.name ?? layerId
  const moveDetail =
    indices.length === 1
      ? `${current.placements[indices[0]]?.instanceId ?? ''} → ${destLayerName}`
      : `${indices.length} parts → ${destLayerName}`
  pushUndo('move to layer', moveDetail)
  const part = clone(current)
  for (const i of indices) {
    const placement = part.placements[i]
    if (placement) placement.layerId = layerId
  }
  $part.set(part)
}

/** Sets the active layer (where new items land). No-op for unknown ids. Ephemeral. */
export function setActiveLayer(id: string): void {
  if ($part.get().layers.some((l) => l.id === id)) $activeLayerId.set(id)
}

/**
 * Selects every entity in a layer — all of its SubParts, connectors, and kittens
 * at once (selection can span kinds). Clears when the layer is empty.
 */
export function selectLayerEntities(id: string): void {
  const part = $part.get()
  setSelection(
    part.placements.flatMap((p, i) => (p.layerId === id ? [i] : [])),
    part.connectors.flatMap((c, i) => (c.layerId === id ? [i] : [])),
    part.kittens.flatMap((k, i) => (k.layerId === id ? [i] : [])),
  )
}

/** Drops any selected entities belonging to `layerId` (used when a layer is locked). */
export function deselectLayer(layerId: string): void {
  const part = $part.get()
  const current = $selectedIndices.get()
  const kept = current.filter((i) => part.placements[i]?.layerId !== layerId)
  if (kept.length !== current.length) $selectedIndices.set(kept)
  const keptCon = $selectedConnectorIndices
    .get()
    .filter((i) => part.connectors[i]?.layerId !== layerId)
  if (keptCon.length !== $selectedConnectorIndices.get().length)
    $selectedConnectorIndices.set(keptCon)
  const keptKit = $selectedKittenIndices.get().filter((i) => part.kittens[i]?.layerId !== layerId)
  if (keptKit.length !== $selectedKittenIndices.get().length) $selectedKittenIndices.set(keptKit)
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
// Nudge plane / step actions (persisted global tool prefs — not in undo history).
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

// ---------------------------------------------------------------------------
// Rotate axes / step actions (persisted global tool prefs — not in undo history).
// ---------------------------------------------------------------------------

/** The three rotate key pairs (W/S, A/D, Q/E), in keyboard order. */
export const ROTATE_PAIRS = ['ws', 'ad', 'qe'] as const
export type RotatePair = (typeof ROTATE_PAIRS)[number]

/** Each pair's axis at offset 0; R rotates the whole mapping forward (x→y→z). */
const ROTATE_BASE_AXIS: Record<RotatePair, NudgeAxis> = { ws: 'x', ad: 'y', qe: 'z' }

export const MIN_ROTATE_STEP = 15
export const MAX_ROTATE_STEP = 180
const ROTATE_STEP_INCREMENT = 15

/** The world axis a pair currently rotates about, given {@link $rotateAxisOffset}. */
export function rotatePairAxis(pair: RotatePair): NudgeAxis {
  const order = NUDGE_AXIS_ORDER
  const base = order.indexOf(ROTATE_BASE_AXIS[pair])
  return order[(base + $rotateAxisOffset.get()) % order.length]
}

/**
 * Cycles every pair's axis assignment together (the R hotkey). `direction` 1 steps
 * the mapping forward (x→y→z), -1 backward; wraps around either way.
 */
export function cycleRotateAxes(direction: 1 | -1 = 1): void {
  const n = NUDGE_AXIS_ORDER.length
  $rotateAxisOffset.set(($rotateAxisOffset.get() + direction + n) % n)
}

/** Increases the rotate step by 15°, clamped at {@link MAX_ROTATE_STEP} (F). */
export function increaseRotateStep(): void {
  $rotateStep.set(Math.min(MAX_ROTATE_STEP, $rotateStep.get() + ROTATE_STEP_INCREMENT))
}

/** Decreases the rotate step by 15°, clamped at {@link MIN_ROTATE_STEP} (⇧F). */
export function decreaseRotateStep(): void {
  $rotateStep.set(Math.max(MIN_ROTATE_STEP, $rotateStep.get() - ROTATE_STEP_INCREMENT))
}
