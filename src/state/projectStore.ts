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
import { createEmptyGameData, DEFAULT_LAYER_ID } from '../ksa/types'
import type { Connector, ConnectorFlag, EditingPart, PartGameData } from '../ksa/types'

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
// v2: added EditingPart.gameData and changed Connector.flags from a single value
// to a ConnectorFlag[]. {@link migratePart} upgrades v1 snapshots on load.
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
  }
}

/**
 * Loads a snapshot into the live stores. Autosave is suspended for the duration so
 * the cascade of store writes doesn't trigger a redundant save mid-load. The active
 * layer is clamped to a layer that exists in the loaded document; selection is
 * cleared (a fresh slate, like a normal page load).
 */
/**
 * Upgrades a possibly-legacy EditingPart in place to the current (v2) shape:
 *  - adds the {@link PartGameData} block if absent (introduced in project v2);
 *  - coerces each connector's `flags` from the old single value
 *    (`'None' | ConnectorFlag`) to the current `ConnectorFlag[]` ([] = none).
 */
function migratePart(part: EditingPart | undefined | null): void {
  if (!part) return
  const withGameData = part as EditingPart & { gameData?: PartGameData }
  if (!withGameData.gameData) withGameData.gameData = createEmptyGameData()
  for (const c of part.connectors ?? []) {
    const legacy = c as Connector & { flags: unknown }
    if (Array.isArray(legacy.flags)) continue
    legacy.flags = legacy.flags && legacy.flags !== 'None' ? [legacy.flags as ConnectorFlag] : []
  }
}

/** Migrates the document + every history-snapshot part within a loaded snapshot. */
function migrateSnapshot(snap: ProjectSnapshot): void {
  migratePart(snap.part)
  const entries = [...(snap.history?.undo ?? []), ...(snap.history?.redo ?? [])]
  for (const e of entries) {
    // Normal entries are { part, description, detail }; legacy saves stored a
    // bare EditingPart — migrate whichever shape this is.
    const entry = e as { part?: EditingPart }
    migratePart(entry.part ?? (e as unknown as EditingPart))
  }
}

function applyProjectSnapshot(snap: ProjectSnapshot): void {
  suspended = true
  try {
    migrateSnapshot(snap)
    importHistory(snap.history ?? { undo: [], redo: [] })
    $part.set(snap.part)
    const activeValid = snap.part.layers.some((l) => l.id === snap.activeLayerId)
    $activeLayerId.set(activeValid ? snap.activeLayerId : DEFAULT_LAYER_ID)
    $layerView.set(snap.layerView ?? {})
    $measurements.set(snap.measurements ?? [])
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
  applyProjectSnapshot(snap)
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
}

/**
 * Loads the current project (or the most recent / a fresh default) into the stores
 * and starts autosave. Call ONCE, synchronously, before React renders so the whole
 * workspace is in place on first paint (no second visual refresh). localStorage is
 * synchronous, so no async wait is needed.
 */
export function hydrateProjectOnBoot(): void {
  const pointerName = readCurrentPointer()
  const loaded = pointerName != null && loadProject(pointerName)
  if (!loaded) {
    const projects = listProjects()
    if (projects.length > 0) loadProject(projects[0].name)
    else createProject(DEFAULT_PROJECT_NAME)
  }
  startAutosave()
}
