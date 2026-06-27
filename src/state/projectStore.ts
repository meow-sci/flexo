import { atom } from 'nanostores'
import {
  $activeLayerId,
  $canRedo,
  $canUndo,
  $part,
  clearSelection,
  exportHistory,
  importHistory,
  newPart,
  type HistorySnapshot,
} from './editorStore'
import { $layerView, type LayerViewState } from './layerStore'
import { $cameraState, resetCamera, setCameraRestore, type CameraState } from './viewStore'
import { $measurements, type LineMeasurement } from './measurementStore'
import { $containers, type ReferenceContainer } from './containerStore'
import {
  createEmptyGameData,
  createEmptyPart,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
} from '../ksa/types'
import type { EditingPart } from '../ksa/types'
import { envelopeToPart, type ProjectExportEnvelope } from './projectTransfer'

/**
 * PROJECTS — the editing experience is "project"-based. A project bundles all of
 * the workspace's working-set / document state and is persisted to localStorage so
 * a reload restores exactly what you were working on (camera excluded — that's
 * ephemeral and resets on load).
 *
 * What a project captures (see {@link ProjectSnapshot}):
 *   - name (the project's identity, used in its localStorage key)
 *   - the full {@link EditingPart} document: partId, editorTags, layers,
 *     placements, connectors (each entity's layerId included)
 *   - per-layer view state (visibility/lock) from {@link $layerView}
 *   - the active layer (where new items land)
 *   - the undo/redo history (so undo survives a reload)
 * Selection, tool mode, snap, and camera are deliberately NOT captured — they're
 * ephemeral and start fresh.
 *
 * Storage convention (one entry per project + a pointer to the current one):
 *   - `flexo:project:<name>`   → a JSON {@link ProjectSnapshot}
 *   - `flexo:currentProject`   → `{ name }`, read on boot to pick which to load
 *
 * Persistence is automatic: {@link startAutosave} subscribes to every store that
 * contributes to a project and writes a debounced snapshot whenever they change
 * (roughly the same granularity as an undo step). {@link hydrateProjectOnBoot} runs
 * once, synchronously, before React renders so all data is in place and there's no
 * second visual refresh.
 *
 * No React / three.js imports — UI reads `$projectName` via `useStore`.
 */

const PROJECT_KEY_PREFIX = 'flexo:project:'
const CURRENT_PROJECT_KEY = 'flexo:currentProject'
// Stamped into each snapshot. Snapshots whose shape doesn't match the current data
// model are discarded at boot (see sanitizeProjectStorage) — never migrated.
const PROJECT_VERSION = 2
export const DEFAULT_PROJECT_NAME = 'Untitled'

/** The current project's name (its identity / localStorage key). Live working state. */
export const $projectName = atom<string>(DEFAULT_PROJECT_NAME)

/** Everything needed to fully restore a project's workspace. */
export interface ProjectSnapshot {
  version: number
  name: string
  part: EditingPart
  /** Per-layer visibility/lock (layerStore view state), keyed by layer id. */
  layerView: Record<string, LayerViewState>
  /** Layer new items land in (clamped to a live layer on load). */
  activeLayerId: string
  /** Undo/redo stacks so history survives a reload. */
  history: HistorySnapshot
  /** Epoch millis of the last save — drives "most recent" ordering in the picker. */
  savedAt: number
  /** Camera position/target/up — restored when the project loads. */
  camera?: CameraState
  /** Placed measurement lines (editor aid; never written to the exported XML). */
  measurements?: LineMeasurement[]
  /** Placed reference containers (editor aid; never written to the exported XML). */
  containers?: ReferenceContainer[]
}

/** A lightweight project descriptor for the load-project list (no full document). */
export interface ProjectSummary {
  name: string
  savedAt: number
  partId: string
  subPartCount: number
}

function projectKey(name: string): string {
  return PROJECT_KEY_PREFIX + name
}

function readSnapshotByKey(key: string): ProjectSnapshot | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    const snap = JSON.parse(raw) as ProjectSnapshot
    if (!snap || typeof snap.name !== 'string' || !snap.part) return null
    return snap
  } catch {
    return null
  }
}

function readSnapshot(name: string): ProjectSnapshot | null {
  return readSnapshotByKey(projectKey(name))
}

function writeCurrentPointer(name: string): void {
  localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify({ name }))
}

function readCurrentPointer(): string | null {
  const raw = localStorage.getItem(CURRENT_PROJECT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  } catch {
    return null
  }
}

/** Builds a snapshot of the current workspace from the live stores. */
function serializeCurrentProject(): ProjectSnapshot {
  return {
    version: PROJECT_VERSION,
    name: $projectName.get(),
    part: $part.get(),
    layerView: $layerView.get(),
    activeLayerId: $activeLayerId.get(),
    history: exportHistory(),
    savedAt: Date.now(),
    camera: $cameraState.get() ?? undefined,
    measurements: $measurements.get(),
    containers: $containers.get(),
  }
}

/**
 * Every EditingPart reachable from a snapshot: the live document plus the part
 * inside each undo/redo history entry (normal entries are { part, description,
 * detail }; legacy saves stored a bare EditingPart — handle whichever shape).
 */
function snapshotParts(snap: ProjectSnapshot): EditingPart[] {
  const out: EditingPart[] = []
  if (snap.part) out.push(snap.part)
  for (const e of [...(snap.history?.undo ?? []), ...(snap.history?.redo ?? [])]) {
    const part = (e as { part?: EditingPart }).part ?? (e as unknown as EditingPart)
    if (part) out.push(part)
  }
  return out
}

/**
 * True only when every part in the snapshot carries all the fields the CURRENT model
 * defines — top-level EditingPart keys plus the nested GameData / SubPartGameData keys.
 * We do NOT migrate old project data; anything structurally behind the current model is
 * from an incompatible build and would crash the editor (e.g. the engine computeds read
 * `subPartGameData[].combustors.length`), so it's unloadable and purged at boot. The
 * templates come from the live constructors, so a field added there in future
 * automatically becomes required here — no per-field upkeep, no migration.
 */
function hasAllKeys(obj: unknown, template: object): boolean {
  if (!obj || typeof obj !== 'object') return false
  for (const k of Object.keys(template)) if (!(k in obj)) return false
  return true
}

function snapshotMatchesModel(snap: ProjectSnapshot): boolean {
  const partTemplate = createEmptyPart()
  const gameDataTemplate = createEmptyGameData()
  const subPartTemplate = createSubPartGameData('')
  for (const part of snapshotParts(snap)) {
    if (!hasAllKeys(part, partTemplate)) return false
    if (!hasAllKeys(part.gameData, gameDataTemplate)) return false
    for (const spd of part.subPartGameData ?? []) {
      if (!hasAllKeys(spd, subPartTemplate)) return false
    }
  }
  return true
}

/**
 * Whether a stored snapshot can be loaded into the current editor: it must parse and
 * match the current data model exactly (no migration). Used to decide what to purge at
 * boot — never throws.
 */
function isSnapshotLoadable(snap: ProjectSnapshot | null): boolean {
  if (!snap) return false
  try {
    return snapshotMatchesModel(snap)
  } catch {
    return false
  }
}

/**
 * Boot-time cleanup: drop any `flexo:project:*` entry that can't be loaded into the
 * current editor (corrupt JSON, or an older data model we don't migrate). Loading such
 * data crashes the whole app, so we delete it rather than try to honor it. A dangling
 * current-project pointer (now pointing at a removed entry) is cleared too. Removed
 * keys are reported in a single console.warn.
 */
function sanitizeProjectStorage(): void {
  const removed: string[] = []
  // Iterate high→low: removeItem reindexes localStorage, so descending is stable.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(PROJECT_KEY_PREFIX)) continue
    if (isSnapshotLoadable(readSnapshotByKey(key))) continue
    localStorage.removeItem(key)
    removed.push(key)
  }
  const pointer = readCurrentPointer()
  if (pointer != null && localStorage.getItem(projectKey(pointer)) == null) {
    localStorage.removeItem(CURRENT_PROJECT_KEY)
  }
  if (removed.length > 0) {
    console.warn(
      `flexo: removed ${removed.length} incompatible project(s) from localStorage (old/unsupported data model):`,
      removed,
    )
  }
}

/**
 * Loads a snapshot into the live stores. Autosave is suspended for the duration so
 * the cascade of store writes doesn't trigger a redundant save mid-load. The active
 * layer is clamped to a layer that exists in the loaded document; selection is
 * cleared (a fresh slate, like a normal page load).
 */
function applyProjectSnapshot(snap: ProjectSnapshot): void {
  suspended = true
  try {
    importHistory(snap.history ?? { undo: [], redo: [] })
    $part.set(snap.part)
    const activeValid = snap.part.layers.some((l) => l.id === snap.activeLayerId)
    $activeLayerId.set(activeValid ? snap.activeLayerId : DEFAULT_LAYER_ID)
    $layerView.set(snap.layerView ?? {})
    $measurements.set(snap.measurements ?? [])
    $containers.set(snap.containers ?? [])
    clearSelection()
    if (snap.camera) {
      // Pre-fill $cameraState so it's included in the next autosave, then signal
      // EditorScene to reposition the Viewport (fires on subscribe when it mounts).
      $cameraState.set(snap.camera)
      setCameraRestore(snap.camera)
    }
  } finally {
    suspended = false
  }
}

/** Persists the current workspace to its `flexo:project:<name>` entry + pointer. */
export function saveCurrentProject(): void {
  const snap = serializeCurrentProject()
  try {
    localStorage.setItem(projectKey(snap.name), JSON.stringify(snap))
    writeCurrentPointer(snap.name)
  } catch (err) {
    // localStorage can throw (quota / private mode) — surface but don't crash editing.
    console.warn('flexo: failed to persist project', err)
  }
}

/** Every saved project (most-recently-saved first), as lightweight summaries. */
export function listProjects(): ProjectSummary[] {
  const out: ProjectSummary[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(PROJECT_KEY_PREFIX)) continue
    const snap = readSnapshotByKey(key)
    if (!snap) continue
    out.push({
      name: snap.name,
      savedAt: snap.savedAt ?? 0,
      partId: snap.part.partId ?? '',
      subPartCount: snap.part.placements?.length ?? 0,
    })
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

/** True when a project with this exact name is already saved. */
export function projectExists(name: string): boolean {
  return localStorage.getItem(projectKey(name)) != null
}

/** Returns `base`, or `base 2`, `base 3`, … — the first name not already taken. */
export function uniqueProjectName(base: string = DEFAULT_PROJECT_NAME): string {
  if (!projectExists(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!projectExists(candidate)) return candidate
  }
}

/**
 * Loads the named project into the workspace and makes it current. Returns false if
 * no such project exists (the workspace is left untouched).
 */
export function loadProject(name: string): boolean {
  const snap = readSnapshot(name)
  if (!snap) return false
  try {
    applyProjectSnapshot(snap)
  } catch (err) {
    // Defensive: sanitizeProjectStorage() should have already purged anything that
    // can't apply, but never let one bad project crash boot. Discard it and fail.
    suspended = false
    console.warn(`flexo: failed to load project "${name}" — removing it`, err)
    localStorage.removeItem(projectKey(name))
    return false
  }
  $projectName.set(snap.name)
  writeCurrentPointer(snap.name)
  return true
}

/**
 * Starts a fresh, empty project under `name` (made current and saved immediately).
 * Clears the document, history, and per-layer view state.
 */
export function createProject(name: string): void {
  const trimmed = name.trim() || DEFAULT_PROJECT_NAME
  suspended = true
  try {
    newPart()
    $layerView.set({})
    resetCamera()
  } finally {
    suspended = false
  }
  $projectName.set(trimmed)
  saveCurrentProject()
}

/**
 * Opens a project decoded from a stateless share link (see projectShareLink.ts) as a
 * NEW saved project, switched-to and made current — the user's existing projects are
 * untouched. The shared project's name is made unique to avoid clobbering a same-named
 * local project. Reconstructed faithfully (no id remapping); camera/selection reset.
 */
export function loadSharedProject(env: ProjectExportEnvelope): string {
  const part = envelopeToPart(env)
  const name = uniqueProjectName(env.projectName.trim() || 'Shared Project')
  suspended = true
  try {
    importHistory({ undo: [], redo: [] })
    $part.set(part)
    $activeLayerId.set(DEFAULT_LAYER_ID)
    $layerView.set({})
    $measurements.set([])
    $containers.set([])
    clearSelection()
    resetCamera()
  } finally {
    suspended = false
  }
  $projectName.set(name)
  saveCurrentProject()
  return name
}

/**
 * Renames the current project, re-keying its localStorage entry (the old key is
 * removed). No-op when blank or unchanged.
 */
export function renameCurrentProject(name: string): void {
  const trimmed = name.trim()
  const old = $projectName.get()
  if (!trimmed || trimmed === old) return
  localStorage.removeItem(projectKey(old))
  $projectName.set(trimmed)
  saveCurrentProject()
}

/**
 * Deletes a saved project. If it's the current one, switches to the most recent
 * remaining project, or starts a fresh default project when none are left.
 */
export function deleteProject(name: string): void {
  localStorage.removeItem(projectKey(name))
  if ($projectName.get() !== name) return
  const remaining = listProjects()
  if (remaining.length > 0) loadProject(remaining[0].name)
  else createProject(DEFAULT_PROJECT_NAME)
}

// ---------------------------------------------------------------------------
// Autosave
//
// A debounced write fires whenever any store that contributes to a project
// changes. `$part`, `$canUndo`, and `$canRedo` together cover every document +
// history change (pushUndo/undo/redo all touch the flags and/or `$part`);
// `$activeLayerId`, `$layerView`, and `$projectName` cover the rest. The debounce
// collapses a gizmo drag (many per-frame `$part` writes) into a single save.
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 300
let suspended = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let autosaveStarted = false

function scheduleSave(): void {
  if (suspended) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveCurrentProject()
  }, SAVE_DEBOUNCE_MS)
}

function startAutosave(): void {
  if (autosaveStarted) return
  autosaveStarted = true
  $part.subscribe(scheduleSave)
  $canUndo.subscribe(scheduleSave)
  $canRedo.subscribe(scheduleSave)
  $activeLayerId.subscribe(scheduleSave)
  $layerView.subscribe(scheduleSave)
  $projectName.subscribe(scheduleSave)
  $cameraState.subscribe(scheduleSave)
  $measurements.subscribe(scheduleSave)
  $containers.subscribe(scheduleSave)
}

/**
 * Loads the current project (or the most recent / a fresh default) into the stores
 * and starts autosave. Call ONCE, synchronously, before React renders so the whole
 * workspace is in place on first paint (no second visual refresh). localStorage is
 * synchronous, so no async wait is needed.
 */
export function hydrateProjectOnBoot(): void {
  // Purge corrupt / old-data-model projects first so we never try to load one (which
  // would crash the app). Anything removed is reported via console.warn.
  sanitizeProjectStorage()
  const pointerName = readCurrentPointer()
  const loaded = pointerName != null && loadProject(pointerName)
  if (!loaded) {
    const projects = listProjects()
    if (projects.length > 0) loadProject(projects[0].name)
    else createProject(DEFAULT_PROJECT_NAME)
  }
  startAutosave()
}
