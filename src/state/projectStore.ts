import { atom } from 'nanostores';
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
} from './editorStore';
import { closeChain } from './chainStore';
import { $layerView, type LayerViewState } from './layerStore';
import { $cameraState, resetCamera, setCameraRestore, type CameraState } from './viewStore';
import { $measurements, type LineMeasurement } from './measurementStore';
import { $containers, type ReferenceContainer } from './containerStore';
import {
  createEmptyGameData,
  createEmptyPart,
  createGlow,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
} from '../ksa/types';
import type { EditingPart } from '../ksa/types';
import { envelopeToPart, type ProjectExportEnvelope } from './projectTransfer';

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

const PROJECT_KEY_PREFIX = 'flexo:project:';
const CURRENT_PROJECT_KEY = 'flexo:currentProject';

/**
 * The version of the localStorage {@link ProjectSnapshot} format, stamped into every
 * saved project. It IS the compatibility contract: {@link sanitizeProjectStorage} keeps
 * a stored project iff it parses AND its `version` equals this number, and purges it at
 * boot otherwise (version mismatch or corruption — nothing else).
 *
 * Changing it:
 *  - A BACKWARDS-COMPATIBLE model change — a new field the live constructors can fill
 *    with a default that means what the old data meant — MUST NOT bump this. Bumping
 *    would delete every existing user's saved projects over an additive field;
 *    {@link normalizePart} fills the default on load instead.
 *  - A BREAKING change — an existing field's shape/meaning changes, or a new field whose
 *    default would silently mean the wrong thing — MUST bump this and append a
 *    `// vN: what broke` line below, so the log explains each purge event.
 *
 * Per the no-migration rule (AGENTS.md "project constitution") a mismatched snapshot is
 * DISCARDED, never converted — there is no upgrade path and none may be added.
 */
// v2: the version this became an enforced gate at; earlier builds stamped it but checked
// the model shape instead, so any additive field purged every saved project.
export const PROJECT_SCHEMA_VERSION = 2;
export const DEFAULT_PROJECT_NAME = 'Untitled';

/** The current project's name (its identity / localStorage key). Live working state. */
export const $projectName = atom<string>(DEFAULT_PROJECT_NAME);

/** Everything needed to fully restore a project's workspace. */
export interface ProjectSnapshot {
  version: number;
  name: string;
  part: EditingPart;
  /** Per-layer visibility/lock (layerStore view state), keyed by layer id. */
  layerView: Record<string, LayerViewState>;
  /** Layer new items land in (clamped to a live layer on load). */
  activeLayerId: string;
  /** Undo/redo stacks so history survives a reload. */
  history: HistorySnapshot;
  /** Epoch millis of the last save — drives "most recent" ordering in the picker. */
  savedAt: number;
  /** Camera position/target/up — restored when the project loads. */
  camera?: CameraState;
  /** Placed measurement lines (editor aid; never written to the exported XML). */
  measurements?: LineMeasurement[];
  /** Placed reference containers (editor aid; never written to the exported XML). */
  containers?: ReferenceContainer[];
}

/** A lightweight project descriptor for the load-project list (no full document). */
export interface ProjectSummary {
  name: string;
  savedAt: number;
  partId: string;
  subPartCount: number;
}

function projectKey(name: string): string {
  return PROJECT_KEY_PREFIX + name;
}

function readSnapshotByKey(key: string): ProjectSnapshot | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const snap = JSON.parse(raw) as ProjectSnapshot;
    if (!snap || typeof snap.name !== 'string' || !snap.part) return null;
    return snap;
  } catch {
    return null;
  }
}

function readSnapshot(name: string): ProjectSnapshot | null {
  return readSnapshotByKey(projectKey(name));
}

function writeCurrentPointer(name: string): void {
  localStorage.setItem(CURRENT_PROJECT_KEY, JSON.stringify({ name }));
}

function readCurrentPointer(): string | null {
  const raw = localStorage.getItem(CURRENT_PROJECT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name : null;
  } catch {
    return null;
  }
}

/** Builds a snapshot of the current workspace from the live stores. */
function serializeCurrentProject(): ProjectSnapshot {
  return {
    version: PROJECT_SCHEMA_VERSION,
    name: $projectName.get(),
    part: $part.get(),
    layerView: $layerView.get(),
    activeLayerId: $activeLayerId.get(),
    history: exportHistory(),
    savedAt: Date.now(),
    camera: $cameraState.get() ?? undefined,
    measurements: $measurements.get(),
    containers: $containers.get(),
  };
}

/**
 * Fills in whatever keys a stored part is missing, taking every default from the LIVE
 * model constructors. Pure: nothing passed in is mutated (each level is rebuilt by
 * spread), and a key that IS present always wins over the template.
 *
 * This is default-filling of additive fields, NOT migration. The templates are the same
 * constructors the editor builds a fresh document with, so a field added there is
 * automatically filled here — no per-field upkeep. Anything a default can't correctly
 * absorb (a field whose meaning or shape changed, where the default would silently mean
 * the wrong thing) is by definition a BREAKING change: bump {@link PROJECT_SCHEMA_VERSION}
 * so those snapshots are purged instead (see AGENTS.md "project constitution").
 */
function normalizePart(part: EditingPart): EditingPart {
  const filled: EditingPart = { ...createEmptyPart(), ...part };
  return {
    ...filled,
    gameData: { ...createEmptyGameData(), ...filled.gameData },
    subPartGameData: (filled.subPartGameData ?? []).map((spd) => ({
      ...createSubPartGameData(spd.subPartTemplateId ?? ''),
      ...spd,
    })),
    // A glow authored before coverage/strength were split would composite as an
    // all-or-nothing white blowout without its missing half.
    customMeshes: (filled.customMeshes ?? []).map((mesh) =>
      mesh.emissive ? { ...mesh, emissive: { ...createGlow(), ...mesh.emissive } } : mesh,
    ),
  };
}

/**
 * Normalizes every EditingPart reachable from a snapshot: the live document plus the
 * part inside each undo/redo history entry (normal entries are { part, description,
 * detail }; legacy saves stored a bare EditingPart — handle whichever shape). History
 * needs it too, or the first undo would restore a part missing the added fields.
 */
function normalizeSnapshot(snap: ProjectSnapshot): ProjectSnapshot {
  type HistoryEntry = HistorySnapshot['undo'][number];
  const normalizeEntry = (e: HistoryEntry): HistoryEntry => ({
    ...e,
    part: normalizePart(e.part ?? (e as unknown as EditingPart)),
  });
  const history = snap.history ?? { undo: [], redo: [] };
  return {
    ...snap,
    part: normalizePart(snap.part),
    history: {
      undo: (history.undo ?? []).map(normalizeEntry),
      redo: (history.redo ?? []).map(normalizeEntry),
    },
  };
}

/** Display names of the projects the last purge removed, awaiting a user-facing notice. */
let removedProjectNames: string[] = [];

/**
 * The names of the projects {@link sanitizeProjectStorage} removed on this boot, handed
 * out ONCE and then cleared (so a remount can't re-notify). Empty when nothing was
 * purged. The UI turns this into a toast — this module stays React-free.
 */
export function consumeRemovedProjectsNotice(): string[] {
  const names = removedProjectNames;
  removedProjectNames = [];
  return names;
}

/**
 * Boot-time cleanup: drop any `flexo:project:*` entry we can't honor. That is exactly two
 * cases — the entry isn't a readable snapshot (corrupt JSON / missing name or part), or it
 * was written against a different {@link PROJECT_SCHEMA_VERSION}, i.e. a build whose format
 * we don't migrate from. Everything else is KEPT and default-filled on load by
 * {@link normalizePart}. A dangling current-project pointer (now pointing at a removed
 * entry) is cleared too. Removed keys are reported in a single console.warn, and their
 * display names are kept for {@link consumeRemovedProjectsNotice}.
 */
function sanitizeProjectStorage(): void {
  const removed: string[] = [];
  const names: string[] = [];
  // Iterate high→low: removeItem reindexes localStorage, so descending is stable.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PROJECT_KEY_PREFIX)) continue;
    const snap = readSnapshotByKey(key);
    if (snap && snap.version === PROJECT_SCHEMA_VERSION) continue;
    localStorage.removeItem(key);
    removed.push(key);
    // A corrupt entry has no readable name — fall back to the key's suffix.
    names.push(snap?.name ?? key.slice(PROJECT_KEY_PREFIX.length));
  }
  const pointer = readCurrentPointer();
  if (pointer != null && localStorage.getItem(projectKey(pointer)) == null) {
    localStorage.removeItem(CURRENT_PROJECT_KEY);
  }
  removedProjectNames = names;
  if (removed.length > 0) {
    console.warn(
      `flexo: removed ${removed.length} incompatible project(s) from localStorage (schema version mismatch or corrupt data):`,
      removed,
    );
  }
}

/**
 * Loads a snapshot into the live stores. Autosave is suspended for the duration so
 * the cascade of store writes doesn't trigger a redundant save mid-load. The active
 * layer is clamped to a layer that exists in the loaded document; selection is
 * cleared (a fresh slate, like a normal page load).
 */
function applyProjectSnapshot(snap: ProjectSnapshot): void {
  suspended = true;
  try {
    importHistory(snap.history ?? { undo: [], redo: [] });
    $part.set(snap.part);
    const activeValid = snap.part.layers.some((l) => l.id === snap.activeLayerId);
    $activeLayerId.set(activeValid ? snap.activeLayerId : DEFAULT_LAYER_ID);
    $layerView.set(snap.layerView ?? {});
    $measurements.set(snap.measurements ?? []);
    $containers.set(snap.containers ?? []);
    clearSelection();
    // An open action chain is seeded by instanceIds from the OUTGOING document; loading
    // a project makes every one of them meaningless, so end the session with the selection.
    closeChain();
    if (snap.camera) {
      // Pre-fill $cameraState so it's included in the next autosave, then signal
      // EditorScene to reposition the Viewport (fires on subscribe when it mounts).
      $cameraState.set(snap.camera);
      setCameraRestore(snap.camera);
    }
  } finally {
    suspended = false;
  }
}

/** Persists the current workspace to its `flexo:project:<name>` entry + pointer. */
export function saveCurrentProject(): void {
  const snap = serializeCurrentProject();
  try {
    localStorage.setItem(projectKey(snap.name), JSON.stringify(snap));
    writeCurrentPointer(snap.name);
  } catch (err) {
    // localStorage can throw (quota / private mode) — surface but don't crash editing.
    console.warn('flexo: failed to persist project', err);
  }
}

/** Every saved project (most-recently-saved first), as lightweight summaries. */
export function listProjects(): ProjectSummary[] {
  const out: ProjectSummary[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PROJECT_KEY_PREFIX)) continue;
    const snap = readSnapshotByKey(key);
    if (!snap) continue;
    out.push({
      name: snap.name,
      savedAt: snap.savedAt ?? 0,
      partId: snap.part.partId ?? '',
      subPartCount: snap.part.placements?.length ?? 0,
    });
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** True when a project with this exact name is already saved. */
export function projectExists(name: string): boolean {
  return localStorage.getItem(projectKey(name)) != null;
}

/** Returns `base`, or `base 2`, `base 3`, … — the first name not already taken. */
export function uniqueProjectName(base: string = DEFAULT_PROJECT_NAME): string {
  if (!projectExists(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!projectExists(candidate)) return candidate;
  }
}

/**
 * Loads the named project into the workspace and makes it current. Returns false if
 * no such project exists (the workspace is left untouched).
 */
export function loadProject(name: string): boolean {
  const snap = readSnapshot(name);
  if (!snap) return false;
  try {
    // Default-fill first: a same-version snapshot may predate an additive field.
    applyProjectSnapshot(normalizeSnapshot(snap));
  } catch (err) {
    // Defensive backstop for staleness deeper than the normalizer's reach: never let one
    // bad project crash boot. Discard it and fail.
    suspended = false;
    console.warn(`flexo: failed to load project "${name}" — removing it`, err);
    localStorage.removeItem(projectKey(name));
    return false;
  }
  $projectName.set(snap.name);
  writeCurrentPointer(snap.name);
  return true;
}

/**
 * Starts a fresh, empty project under `name` (made current and saved immediately).
 * Clears the document, history, and per-layer view state.
 */
export function createProject(name: string): void {
  const trimmed = name.trim() || DEFAULT_PROJECT_NAME;
  suspended = true;
  try {
    newPart();
    $layerView.set({});
    resetCamera();
  } finally {
    suspended = false;
  }
  $projectName.set(trimmed);
  saveCurrentProject();
}

/**
 * Opens a project decoded from a stateless share link (see projectShareLink.ts) as a
 * NEW saved project, switched-to and made current — the user's existing projects are
 * untouched. The shared project's name is made unique to avoid clobbering a same-named
 * local project. Reconstructed faithfully (no id remapping); camera/selection reset.
 */
export function loadSharedProject(env: ProjectExportEnvelope): string {
  const part = envelopeToPart(env);
  const name = uniqueProjectName(env.projectName.trim() || 'Shared Project');
  suspended = true;
  try {
    importHistory({ undo: [], redo: [] });
    $part.set(part);
    $activeLayerId.set(DEFAULT_LAYER_ID);
    $layerView.set({});
    $measurements.set([]);
    $containers.set([]);
    clearSelection();
    resetCamera();
  } finally {
    suspended = false;
  }
  $projectName.set(name);
  saveCurrentProject();
  return name;
}

/**
 * Renames the current project, re-keying its localStorage entry (the old key is
 * removed). No-op when blank or unchanged.
 */
export function renameCurrentProject(name: string): void {
  const trimmed = name.trim();
  const old = $projectName.get();
  if (!trimmed || trimmed === old) return;
  localStorage.removeItem(projectKey(old));
  $projectName.set(trimmed);
  saveCurrentProject();
}

/**
 * Deletes a saved project. If it's the current one, switches to the most recent
 * remaining project, or starts a fresh default project when none are left.
 */
export function deleteProject(name: string): void {
  localStorage.removeItem(projectKey(name));
  if ($projectName.get() !== name) return;
  const remaining = listProjects();
  if (remaining.length > 0) loadProject(remaining[0].name);
  else createProject(DEFAULT_PROJECT_NAME);
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

const SAVE_DEBOUNCE_MS = 300;
let suspended = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveStarted = false;

function scheduleSave(): void {
  if (suspended) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveCurrentProject();
  }, SAVE_DEBOUNCE_MS);
}

function startAutosave(): void {
  if (autosaveStarted) return;
  autosaveStarted = true;
  $part.subscribe(scheduleSave);
  $canUndo.subscribe(scheduleSave);
  $canRedo.subscribe(scheduleSave);
  $activeLayerId.subscribe(scheduleSave);
  $layerView.subscribe(scheduleSave);
  $projectName.subscribe(scheduleSave);
  $cameraState.subscribe(scheduleSave);
  $measurements.subscribe(scheduleSave);
  $containers.subscribe(scheduleSave);
}

/**
 * Loads the current project (or the most recent / a fresh default) into the stores
 * and starts autosave. Call ONCE, synchronously, before React renders so the whole
 * workspace is in place on first paint (no second visual refresh). localStorage is
 * synchronous, so no async wait is needed.
 */
export function hydrateProjectOnBoot(): void {
  // Purge corrupt / wrong-schema-version projects first so we never try to load one
  // (which would crash the app). Anything removed is reported via console.warn and
  // surfaced to the user by consumeRemovedProjectsNotice().
  sanitizeProjectStorage();
  const pointerName = readCurrentPointer();
  const loaded = pointerName != null && loadProject(pointerName);
  if (!loaded) {
    const projects = listProjects();
    if (projects.length > 0) loadProject(projects[0].name);
    else createProject(DEFAULT_PROJECT_NAME);
  }
  startAutosave();
}
