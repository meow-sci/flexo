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
import { resetModeForProjectLoad } from './modeStore';
import { $layerView } from './layerStore';
import { $cameraState, resetCamera, setCameraRestore } from './viewStore';
import { $measurements } from './measurementStore';
import { $containers } from './containerStore';
import {
  clampLayerIds,
  createEmptyGameData,
  createEmptyPart,
  createGlow,
  createSubPartGameData,
  DEFAULT_LAYER_ID,
} from '../ksa/types';
import type { EditingPart } from '../ksa/types';
import { envelopeToParts, type ProjectExportEnvelope } from './projectTransfer';
import { status } from './statusStore';
import { notify } from './notificationStore';
import {
  deleteProjectRecords,
  getHistory,
  getMeta,
  getSnapshot,
  getThumb,
  listMeta,
  newProjectId,
  putHistory,
  putMeta,
  putSnapshot,
  putThumb,
  sumCounts,
  type ProjectHistoryRecord,
  type ProjectId,
  type ProjectMeta,
  type ProjectSnapshot,
  type SavedPartEntry,
} from './projectDb';
import {
  $activePartId,
  $partEntries,
  clearPartScopedIntents,
  hydrateParts,
  inactiveHistoriesRecord,
  initPartsForNewProject,
  newPartEntryId,
  parkHistories,
  snapshotParts,
} from './partsStore';
import {
  $autosaveHealth,
  $currentProjectId,
  $projectIndex,
  $projectName,
  $storageEstimate,
  acquireProjectLock,
  broadcastIndexChanged,
  canWriteProject,
  DEFAULT_PROJECT_NAME,
  invalidateThumb,
  readStoredProjectId,
  refreshStorageEstimate,
  releaseProjectLock,
  reloadIndex,
  setCurrentProjectId,
  uniqueProjectName,
} from './projectIndexStore';
import { copyProjectAssets, deleteProjectAssets } from './assetDb';

/**
 * PROJECTS — the editing experience is "project"-based. A project bundles the workspace's
 * whole working set and is persisted so a reload restores exactly what you were working on.
 *
 * **Storage (v2, LOCKED #3 — design: design-projects-export.md §1).** Projects live in the
 * IndexedDB database `flexo-projects` keyed by a stable {@link ProjectId} minted at create;
 * the display name is pure metadata. `projectDb` owns the four record types
 * (`meta` / `snapshots` / `history` / `thumbs`); `projectIndexStore` owns the reactive index,
 * the current-id pointer, the multi-tab write lock and autosave health; THIS module owns the
 * live-store side: what a snapshot is, how it is applied, autosave, boot, and the project
 * lifecycle actions.
 *
 * What a project captures ({@link ProjectSnapshot} + its history record) — per PART, since a
 * project holds N of them (`plans/MULTI_PART_PLAN.md`), plus which one is active:
 *   - the full {@link EditingPart} document: partId, editorTags, layers, placements,
 *     connectors, colliders, seats, lights, kittens, custom assets, animations, GameData
 *   - per-layer view state (visibility/lock/listed/opacity/collapsed) from `$layerView` —
 *     as of v2 the snapshot is its ONLY persistence (the global `flexo:layerView` key is gone)
 *   - the active layer
 * …and project-wide: the camera, measurements and reference containers, and the undo/redo
 * history keyed by part, in its own record so undo still survives a reload (D4).
 * Selection, tool mode, snap and seat view are deliberately NOT captured.
 *
 * Persistence is automatic — {@link startAutosave} subscribes to every contributing store and
 * writes on two debounces (snapshot+meta at 300 ms, the bulkier history at 1500 ms). There is
 * no Save button anywhere, by design. {@link hydrateProjectOnBoot} runs once, AWAITED, before
 * React renders, so the workspace still paints exactly once.
 *
 * No React / three.js imports — UI reads `$projectName` / `$projectIndex` via `useStore`.
 */

/**
 * The version of the persisted {@link ProjectSnapshot} format, stamped into every saved
 * project's meta row. It IS the compatibility contract: {@link hydrateProjectOnBoot} keeps a
 * stored project iff its snapshot loads AND its `schemaVersion` equals this number, and purges
 * it (records + asset blobs) at boot otherwise — version mismatch or corruption, nothing else.
 *
 * Changing it:
 *  - A BACKWARDS-COMPATIBLE model change — a new field the live constructors can fill with a
 *    default that means what the old data meant — MUST NOT bump this. Bumping would delete
 *    every existing user's saved projects over an additive field; {@link normalizePart} fills
 *    the default on load instead.
 *  - A BREAKING change — an existing field's shape/meaning changes, or a new field whose
 *    default would silently mean the wrong thing — MUST bump this and append a
 *    `// vN: what broke` line below, so the log explains each purge event.
 *
 * Per the no-migration rule (AGENTS.md "project constitution") a mismatched snapshot is
 * DISCARDED, never converted — there is no upgrade path and none may be added.
 *
 * NOTE the v2 storage redesign did NOT bump this. The DOCUMENT model is untouched; what moved
 * is the container (localStorage name-keyed entries → id-keyed IndexedDB records). v1 data is
 * removed by {@link purgeV1Storage}, not by a version check, so bumping would purge
 * nothing that the key purge does not already remove while destroying the only rows this
 * constant can still protect: the new ones, going forward.
 */
// v2: the version this became an enforced gate at; earlier builds stamped it but checked
// the model shape instead, so any additive field purged every saved project.
// v3: per-channel keyframe easing — `AnimationKeyframe.easings` values change shape from
// `EasingConfig` to `JointSegmentEasing` ({position?, rotation?, scale?}). A v2 snapshot's
// single whole-pose easing has no channel keys, so it would default-fill to all-linear and
// silently load the WRONG motion; `normalizePart` cannot reach inside keyframes to fix it.
// v4: multi-part — snapshot is parts: SavedPartEntry[] + activePartId; layerView/activeLayerId
// moved per-part; history keyed byPart (plans/MULTI_PART_PLAN.md)
export const PROJECT_SCHEMA_VERSION = 4;

export { DEFAULT_PROJECT_NAME, $projectName };
export type { ProjectId, ProjectMeta, ProjectSnapshot };

/** v1's localStorage keys — read ONLY to delete them at boot (D6). No adoption, ever. */
const V1_PROJECT_KEY_PREFIX = 'flexo:project:';
const V1_CURRENT_PROJECT_KEY = 'flexo:currentProject';

/**
 * v1 shell-layout keys, replaced by the single `flexo:layout` (foundation §13: "v1 layout
 * keys are simply abandoned"). Abandoning them leaves clutter that only Reset Everything
 * ever cleared, so boot deletes them outright — REMOVAL, never migration (AGENTS.md
 * constitution). Their values are never read.
 */
const DEAD_V1_KEYS = [
  'flexo:inspectorVisible',
  'flexo:inspectorWidth',
  'flexo:inspectorFloatPos',
  'flexo:animPreviewFloatPos',
  // P9.07 dropped the global layer-view key: per-layer visibility/lock now rides ONLY the
  // per-project snapshot (docs/layers.md), so a stale global copy could only mislead.
  'flexo:layerView',
];

/** `?project=<id>` deep-open, stripped from the URL like `?load=` (design §1.4). */
const PROJECT_PARAM = 'project';

// ── snapshot serialization ───────────────────────────────────────────────────

/** Builds a snapshot of the current workspace from the live stores. */
function serializeCurrentSnapshot(): ProjectSnapshot {
  return {
    version: PROJECT_SCHEMA_VERSION,
    parts: snapshotParts(),
    activePartId: $activePartId.get(),
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
  const gameData = { ...createEmptyGameData(), ...filled.gameData };
  // The one place this function touches a value that IS present: an entity whose `layerId`
  // names no layer in the document. That is a broken reference, not an authored choice —
  // see {@link clampLayerIds} for why repairing it does not make this a migration.
  return clampLayerIds({
    ...filled,
    gameData: {
      ...gameData,
      // Two additive fields live BELOW the constructor-spread level, so they need their own
      // default (they have no constructor of their own): `<EVADoor SeatId>` and
      // `<IVASeat Id>`, both modeled in KSA 2026.8.3.5117. `evaDoor` is rebuilt field-by-field
      // rather than spread, so a snapshot written before P12.16 removed `EvaDoor.connectorId`
      // does not carry that dead key back into memory — a snapshot is still LOADED, never
      // converted (nothing reads the key either way; this just stops it being re-persisted).
      evaDoor: gameData.evaDoor ? { seatId: gameData.evaDoor.seatId ?? null } : null,
    },
    ivaSeats: (filled.ivaSeats ?? []).map((seat) => ({ ...seat, ksaId: seat.ksaId ?? null })),
    subPartGameData: (filled.subPartGameData ?? []).map((spd) => ({
      ...createSubPartGameData(spd.subPartTemplateId ?? ''),
      ...spd,
    })),
    // A glow authored before coverage/strength were split would composite as an
    // all-or-nothing white blowout without its missing half.
    customMeshes: (filled.customMeshes ?? []).map((mesh) =>
      mesh.emissive ? { ...mesh, emissive: { ...createGlow(), ...mesh.emissive } } : mesh,
    ),
  });
}

/**
 * Default-fills one saved part's registry meta the same way {@link normalizePart} fills its
 * document: a field a stored entry lacks gets the constructor default, a field it carries wins.
 */
function normalizeSavedPart(entry: SavedPartEntry): SavedPartEntry {
  const offset = entry.offset;
  const axis = (value: number): number => (Number.isFinite(value) ? value : 0);
  return {
    id: entry.id || newPartEntryId(),
    name: entry.name ?? 'Part',
    visible: entry.visible ?? true,
    opacity: Number.isFinite(entry.opacity) ? Math.min(1, Math.max(0, entry.opacity)) : 1,
    offset: offset
      ? { x: axis(offset.x), y: axis(offset.y), z: axis(offset.z) }
      : { x: 0, y: 0, z: 0 },
    includeInExport: entry.includeInExport ?? true,
    part: normalizePart(entry.part),
    layerView: entry.layerView ?? {},
    activeLayerId: entry.activeLayerId || DEFAULT_LAYER_ID,
  };
}

function normalizeSnapshot(snap: ProjectSnapshot): ProjectSnapshot {
  const parts = snap.parts.map(normalizeSavedPart);
  const activeExists = parts.some((p) => p.id === snap.activePartId);
  return { ...snap, parts, activePartId: activeExists ? snap.activePartId : parts[0].id };
}

/**
 * Normalizes the part inside every undo/redo history entry, for every part's stacks — history
 * needs it as much as the document does, or the first undo would restore a part missing the
 * added fields. Keys naming no part in the snapshot are harmless: they are never hydrated
 * and die on the next write.
 */
function normalizeHistory(
  history: ProjectHistoryRecord | undefined,
): Record<string, HistorySnapshot> {
  type Entry = HistorySnapshot['undo'][number];
  const entry = (e: Entry): Entry => ({ ...e, part: normalizePart(e.part) });
  const byPart: Record<string, HistorySnapshot> = {};
  for (const [id, stacks] of Object.entries(history?.byPart ?? {})) {
    byPart[id] = {
      undo: (stacks?.undo ?? []).map(entry),
      redo: (stacks?.redo ?? []).map(entry),
    };
  }
  return byPart;
}

/**
 * Loads a snapshot into the live stores. Autosave is suspended for the duration so the
 * cascade of store writes doesn't trigger a redundant save mid-load. The active layer is
 * clamped to a layer that exists in the loaded document; selection is cleared (a fresh
 * slate, like a normal page load). History is REPLACED wholesale (design §1.8).
 */
function applyProjectSnapshot(snap: ProjectSnapshot, history?: ProjectHistoryRecord): void {
  // The registry writes MUST sit inside this window — `$partEntries` and `$activePartId` are
  // autosave triggers of their own (P1.04(5)).
  suspended = true;
  try {
    const active = snap.parts.find((p) => p.id === snap.activePartId) ?? snap.parts[0];
    hydrateParts(snap.parts, active.id);
    // The active part's stacks go into the live editor; every other part's stay parked.
    const { [active.id]: activeHistory, ...parked } = normalizeHistory(history);
    parkHistories(parked);
    importHistory(activeHistory ?? { undo: [], redo: [] });
    $part.set(active.part);
    const activeValid = active.part.layers.some((l) => l.id === active.activeLayerId);
    $activeLayerId.set(activeValid ? active.activeLayerId : DEFAULT_LAYER_ID);
    $layerView.set(active.layerView ?? {});
    $measurements.set(snap.measurements ?? []);
    $containers.set(snap.containers ?? []);
    clearSelection();
    // An open action chain is seeded by instanceIds from the OUTGOING document; loading
    // a project makes every one of them meaningless, so end the session with the selection.
    closeChain();
    // Same reasoning for the intent atoms that name an entity by bare id (P6.06's audit): ids
    // repeat across projects exactly as they repeat across parts.
    clearPartScopedIntents();
    // A project is opened in Build with no tool armed (foundation §2.4) — the editor's
    // posture belongs to the session, not to the incoming document.
    resetModeForProjectLoad();
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

// ── writing ──────────────────────────────────────────────────────────────────

function byteLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** The meta row for the current workspace, carrying over the immutable fields of `previous`. */
function buildMeta(
  id: ProjectId,
  snap: ProjectSnapshot,
  previous: ProjectMeta | undefined,
  historyBytes: number,
): ProjectMeta {
  return {
    id,
    name: $projectName.get(),
    description: previous?.description ?? '',
    parts: snap.parts.map((p) => ({ id: p.id, name: p.name, partId: p.part.partId })),
    createdAt: previous?.createdAt ?? snap.savedAt,
    savedAt: snap.savedAt,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    counts: sumCounts(snap.parts.map((p) => p.part)),
    bytes: {
      snapshot: byteLength(snap),
      history: historyBytes,
      assets: previous?.bytes.assets ?? 0,
    },
    hasThumb: previous?.hasThumb ?? false,
  };
}

/** Last written history size, so a snapshot-only save doesn't zero the meta's history bytes. */
let lastHistoryBytes = 0;

async function writeSnapshotAndMeta(): Promise<void> {
  const id = $currentProjectId.get();
  if (!id || !canWriteProject()) return;
  const snap = serializeCurrentSnapshot();
  await putSnapshot(id, snap);
  await putMeta(buildMeta(id, snap, await getMeta(id), lastHistoryBytes));
  await reloadIndex();
  broadcastIndexChanged();
}

async function writeHistory(): Promise<void> {
  const id = $currentProjectId.get();
  if (!id || !canWriteProject()) return;
  // Every part's stacks in one record: the parked ones as they were left, the active one
  // exported live. The byte accounting measures the whole record — no per-part split.
  const history: ProjectHistoryRecord = {
    byPart: { ...inactiveHistoriesRecord(), [$activePartId.get()]: exportHistory() },
  };
  lastHistoryBytes = byteLength(history);
  await putHistory(id, history);
}

/**
 * Reports a failed IDB write. v1 stopped at a `console.warn`, so the user kept editing work
 * that was no longer being saved with no sign anything was wrong (census pain #4). This is the
 * loudest tier flexo has — a persistent danger status message AND one sticky notification,
 * deduped so a failing quota can't spam the ring (design §1.3).
 */
function reportAutosaveFailure(err: unknown): void {
  console.warn('flexo: failed to persist project', err);
  if ($autosaveHealth.get() === 'failing') return;
  $autosaveHealth.set('failing');
  const estimate = $storageEstimate.get();
  const quota = estimate
    ? `Storage: ${(estimate.usage / 1e6).toFixed(0)} MB used of ~${(estimate.quota / 1e6).toFixed(0)} MB. `
    : '';
  const id = notify({
    severity: 'danger',
    title: 'Autosave failing — storage may be full',
    body: `${quota}Your latest changes were not saved. Free space by deleting a project, or export archives as backups. ${String(err)}`,
    actions: [
      { label: 'Open Projects…', commandId: 'file.projects' },
      { label: 'Retry now', commandId: 'project.retryAutosave' },
    ],
  });
  status('Autosave failing — storage may be full', { severity: 'danger', notificationId: id });
}

function reportAutosaveRecovered(): void {
  if ($autosaveHealth.get() === 'ok') return;
  $autosaveHealth.set('ok');
  status('Autosave recovered ✓', { severity: 'success' });
}

async function runWrite(write: () => Promise<void>): Promise<void> {
  try {
    await write();
    reportAutosaveRecovered();
  } catch (err) {
    reportAutosaveFailure(err);
  }
}

// ── autosave ─────────────────────────────────────────────────────────────────
//
// A debounced write fires whenever any store that contributes to a project changes.
// `$part`, `$canUndo` and `$canRedo` together cover every document + history change of the
// ACTIVE part (pushUndo/undo/redo all touch the flags and/or `$part`); `$activeLayerId`,
// `$layerView` and `$projectName` cover the rest. `$partEntries` covers the part REGISTRY —
// rename / reorder / visibility / opacity / offset / include-in-export / delete-inactive /
// add-imported all flow through it and would otherwise never persist — and `$activePartId`
// covers a switch with zero document edits (the new active pointer must still be saved).
// The debounce collapses a gizmo drag (many per-frame `$part` writes) into a single save.
// History gets its own, slower timer: it is the bulk of the bytes, and a reload inside its
// window loses at most the last undo ENTRIES, never document state (D4).

const SAVE_DEBOUNCE_MS = 300;
const HISTORY_DEBOUNCE_MS = 1500;

let suspended = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let historyTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveStarted = false;
/** Set by the scheduler, cleared by a thumbnail capture — drives the D15 cadence. */
let dirtySinceCapture = false;

function scheduleSave(): void {
  if (suspended) return;
  dirtySinceCapture = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void runWrite(writeSnapshotAndMeta);
  }, SAVE_DEBOUNCE_MS);
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = null;
    void runWrite(writeHistory);
  }, HISTORY_DEBOUNCE_MS);
}

export function startAutosave(): void {
  if (autosaveStarted) return;
  autosaveStarted = true;
  $part.subscribe(scheduleSave);
  $canUndo.subscribe(scheduleSave);
  $canRedo.subscribe(scheduleSave);
  $partEntries.subscribe(scheduleSave);
  $activePartId.subscribe(scheduleSave);
  $activeLayerId.subscribe(scheduleSave);
  $layerView.subscribe(scheduleSave);
  $projectName.subscribe(scheduleSave);
  $cameraState.subscribe(scheduleSave);
  $measurements.subscribe(scheduleSave);
  $containers.subscribe(scheduleSave);
  startThumbnailCadence();
}

/** Cancels the pending debounces and writes snapshot + meta + history NOW. */
export async function flushAutosave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
  }
  await runWrite(async () => {
    await writeHistory();
    await writeSnapshotAndMeta();
  });
}

/** Writes every record for a project immediately, bypassing the debounce (create / import). */
async function writeAllNow(): Promise<void> {
  await runWrite(async () => {
    await writeHistory();
    await writeSnapshotAndMeta();
  });
}

// ── thumbnails (P9.08 / design §1.6, D15) ────────────────────────────────────

/**
 * One-shot capture intent, consumed by `EditorScene` — the sanctioned intent-atom pattern
 * (`$colliderFitRequest` / the camera-snap nonce). The scene is the only place with the built
 * world geometry, so the store publishes an intent and the scene answers with a blob.
 */
export const $thumbnailRequest = atom<{ nonce: number } | null>(null);

let thumbnailNonce = 0;

/** Asks the scene for a fresh thumbnail of the current document. */
export function requestThumbnail(): void {
  thumbnailNonce += 1;
  $thumbnailRequest.set({ nonce: thumbnailNonce });
}

/**
 * Stores a captured thumbnail against a project and flags its meta row. Called by
 * `EditorScene` once the offscreen render lands; `null` means "nothing to capture"
 * (an empty document), which simply clears the request.
 */
export async function storeThumbnail(id: ProjectId, blob: Blob | null): Promise<void> {
  $thumbnailRequest.set(null);
  dirtySinceCapture = false;
  if (!blob || !id || !canWriteProject()) return;
  try {
    await putThumb(id, blob);
    invalidateThumb(id);
    const meta = await getMeta(id);
    if (meta && !meta.hasThumb) await putMeta({ ...meta, hasThumb: true });
    await reloadIndex();
    broadcastIndexChanged();
  } catch (err) {
    console.warn('flexo: thumbnail store failed', err);
  }
}

const THUMBNAIL_INTERVAL_MS = 60_000;
let thumbnailCadenceStarted = false;

/**
 * The D15 cadence: tab-hide while dirty, and at most once a minute while dirty. Both are
 * *conditional* — an idle project never captures, so this cannot turn the on-demand render
 * loop continuous (foundation §14.5). Switch-away and post-create captures are requested
 * explicitly by the lifecycle actions below.
 */
function startThumbnailCadence(): void {
  if (thumbnailCadenceStarted || typeof document === 'undefined') return;
  thumbnailCadenceStarted = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirtySinceCapture) requestThumbnail();
  });
  setInterval(() => {
    if (dirtySinceCapture && document.visibilityState === 'visible') requestThumbnail();
  }, THUMBNAIL_INTERVAL_MS);
}

// ── v1 purge (D6 — no adoption, ever) ────────────────────────────────────────

/**
 * The one boot-time sweep of v1 localStorage. Two groups, both REMOVED and never read:
 *
 * 1. **Projects** — every `flexo:project:*` entry plus the `flexo:currentProject` pointer,
 *    named in ONE warning notification. Display names come FROM THE KEYS — nothing is
 *    parsed, so a corrupt entry is reported exactly as well as an intact one, and no v1
 *    value is ever interpreted (LOCKED #3: projects are a clean slate).
 * 2. **{@link DEAD_V1_KEYS}** — the abandoned shell-layout keys, silently (they are
 *    layout preferences, not the user's work, so a notice would be noise).
 *
 * Runs every boot; a no-op once the keys are gone. Every OTHER `flexo:*` key is live v2
 * state and must survive untouched.
 */
export function purgeV1Storage(): void {
  if (typeof localStorage === 'undefined') return;
  for (const key of DEAD_V1_KEYS) localStorage.removeItem(key);

  const names: string[] = [];
  // Iterate high→low: removeItem reindexes localStorage, so descending is stable.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(V1_PROJECT_KEY_PREFIX)) continue;
    localStorage.removeItem(key);
    names.push(key.slice(V1_PROJECT_KEY_PREFIX.length));
  }
  localStorage.removeItem(V1_CURRENT_PROJECT_KEY);
  if (names.length === 0) return;
  console.warn('flexo: removed v1 project storage (incompatible format):', names);
  notify({
    severity: 'warning',
    title: `Projects from a previous flexo version were removed (incompatible format)`,
    body: names.sort().join(', '),
  });
}

// ── boot ─────────────────────────────────────────────────────────────────────

function readProjectParam(): ProjectId | null {
  if (typeof window === 'undefined') return null;
  const value = new URL(window.location.href).searchParams.get(PROJECT_PARAM);
  return value || null;
}

function clearProjectParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PROJECT_PARAM);
  window.history.replaceState({}, '', url.toString());
}

/**
 * The boot schema purge (design §1.2): any project whose `schemaVersion` mismatches, or whose
 * snapshot is missing or unreadable, is deleted with its records AND its asset blobs, and
 * named in one warning notification. Everything kept is default-filled on load by
 * {@link normalizePart} — preservation by versioning, never conversion (constitution).
 *
 * Returns the surviving rows.
 */
async function purgeIncompatibleProjects(): Promise<ProjectMeta[]> {
  const rows = await listMeta();
  const kept: ProjectMeta[] = [];
  const removed: string[] = [];
  for (const row of rows) {
    let ok = row.schemaVersion === PROJECT_SCHEMA_VERSION;
    if (ok) {
      try {
        const snap = await getSnapshot(row.id);
        // A snapshot must carry at least one part, each with a document with layers, and name
        // an active one — anything less would crash applyProjectSnapshot, and a project that
        // crashes boot is worse than one that is gone.
        ok =
          !!snap &&
          Array.isArray(snap.parts) &&
          snap.parts.length >= 1 &&
          snap.parts.every((p) => p?.part && Array.isArray(p.part.layers)) &&
          typeof snap.activePartId === 'string';
      } catch {
        ok = false;
      }
    }
    if (ok) {
      kept.push(row);
      continue;
    }
    removed.push(row.name || row.id);
    await deleteProjectRecords(row.id).catch(() => {});
    await deleteProjectAssets(row.id).catch(() => {});
  }
  if (removed.length > 0) {
    console.warn('flexo: removed incompatible project(s) (schema version mismatch):', removed);
    notify({
      severity: 'warning',
      title: `Removed ${removed.length} incompatible saved project${removed.length === 1 ? '' : 's'}`,
      body: `${removed.sort().join(', ')} — saved by an older, incompatible version of flexo.`,
    });
  }
  return kept;
}

/** Loads a stored project into the live stores. False when it can't be read. */
async function loadProjectRecords(id: ProjectId, meta: ProjectMeta): Promise<boolean> {
  try {
    const snap = await getSnapshot(id);
    if (!snap) return false;
    applyProjectSnapshot(normalizeSnapshot(snap), await getHistory(id));
  } catch (err) {
    // Defensive backstop for staleness deeper than the normalizer's reach: never let one bad
    // project crash boot. Discard it and fail (v1 semantics, now sweeping the blobs too).
    suspended = false;
    console.warn(`flexo: failed to load project "${meta.name}" — removing it`, err);
    await deleteProjectRecords(id).catch(() => {});
    await deleteProjectAssets(id).catch(() => {});
    return false;
  }
  setCurrentProjectId(id);
  $projectName.set(meta.name);
  return true;
}

/**
 * Restores the project this tab should open and starts autosave. Call ONCE, AWAITED, before
 * React renders: IndexedDB is async, so boot awaits it and nothing paints until it resolves —
 * which is what preserves v1's single-paint property (design §1.7, D3).
 *
 * Fallback ladder (census pm §1.6, preserved): `?project=<id>` → the `flexo:currentProjectId`
 * pointer → the newest `savedAt` row → a fresh "Untitled".
 */
export async function hydrateProjectOnBoot(): Promise<void> {
  void refreshStorageEstimate();
  let rows: ProjectMeta[];
  try {
    rows = await purgeIncompatibleProjects();
  } catch (err) {
    // No IndexedDB at all (private mode / blocked): editing still works, nothing persists.
    console.warn('flexo: project storage unavailable', err);
    notify({
      severity: 'danger',
      title: 'Project storage unavailable',
      body: `flexo could not open its project database, so nothing will be saved this session. ${String(err)}`,
    });
    $autosaveHealth.set('failing');
    newPart();
    initPartsForNewProject();
    startAutosave();
    return;
  }

  const param = readProjectParam();
  if (param) clearProjectParam();
  const candidates = [param, readStoredProjectId()].filter((id): id is ProjectId => !!id);
  const byId = new Map(rows.map((row) => [row.id, row]));

  let opened = false;
  for (const id of candidates) {
    const meta = byId.get(id);
    if (meta && (await loadProjectRecords(id, meta))) {
      opened = true;
      break;
    }
  }
  if (!opened) {
    const newest = [...rows].sort((a, b) => b.savedAt - a.savedAt)[0];
    if (newest) opened = await loadProjectRecords(newest.id, newest);
  }

  await reloadIndex();
  if (!opened) {
    await createProject();
  } else {
    await acquireProjectLock($currentProjectId.get());
  }
  startAutosave();
}

// ── lifecycle actions (design §1.8 — none of these are undo steps) ───────────

/**
 * Starts a fresh, empty project: new id, unique name, cleared document/history/layer view,
 * reset camera, saved immediately and switched to.
 */
export async function createProject(name?: string): Promise<ProjectId> {
  const id = newProjectId();
  const unique = uniqueProjectName(name ?? DEFAULT_PROJECT_NAME);
  suspended = true;
  try {
    newPart();
    initPartsForNewProject();
    importHistory({ undo: [], redo: [] });
    $layerView.set({});
    $measurements.set([]);
    $containers.set([]);
    resetCamera();
  } finally {
    suspended = false;
  }
  releaseProjectLock();
  setCurrentProjectId(id);
  $projectName.set(unique);
  lastHistoryBytes = 0;
  await writeAllNow();
  await acquireProjectLock(id);
  status(`New project “${unique}”`);
  requestThumbnail();
  return id;
}

/**
 * Switches to a stored project. The outgoing project is flushed and thumbnailed first; the
 * incoming one REPLACES the undo stacks wholesale (v1 semantics, design §1.8).
 */
export async function openProject(id: ProjectId): Promise<boolean> {
  if (id === $currentProjectId.get()) return true;
  const meta = await getMeta(id);
  if (!meta) return false;
  requestThumbnail();
  // Let the scene answer the capture request before the document changes underneath it.
  await Promise.resolve();
  await flushAutosave();
  releaseProjectLock();
  const loaded = await loadProjectRecords(id, meta);
  if (!loaded) {
    await reloadIndex();
    return false;
  }
  await acquireProjectLock(id);
  await reloadIndex();
  status(`Opened “${meta.name}”`);
  return true;
}

/**
 * Copies a project under a new id: snapshot + thumbnail + its asset blobs (the per-project
 * namespace makes the asset ids collision-free, so no descriptor rewrite is needed). History
 * is NOT copied — a duplicate is a new artifact with fresh stacks. Does not switch to it.
 */
export async function duplicateProject(id: ProjectId): Promise<ProjectId | null> {
  if (id === $currentProjectId.get()) await flushAutosave();
  const meta = await getMeta(id);
  const snap = await getSnapshot(id);
  if (!meta || !snap) return null;
  const copyId = newProjectId();
  const name = uniqueProjectName(`${meta.name} copy`);
  const now = Date.now();
  await putSnapshot(copyId, { ...snap, savedAt: now });
  const thumb = meta.hasThumb ? await getThumb(id) : undefined;
  if (thumb) await putThumb(copyId, thumb);
  await copyProjectAssets(id, copyId);
  await putMeta({
    ...meta,
    id: copyId,
    name,
    createdAt: now,
    savedAt: now,
    bytes: { ...meta.bytes, history: 0 },
    hasThumb: !!thumb,
  });
  await reloadIndex();
  broadcastIndexChanged();
  return copyId;
}

/**
 * Permanently deletes a project: its four records AND its asset blobs (the v1 orphan leak,
 * census pain #11). Deleting the current project switches to the most recent remaining one,
 * or starts a fresh default when none are left (v1 semantics).
 */
export async function deleteProject(id: ProjectId): Promise<void> {
  const wasCurrent = id === $currentProjectId.get();
  if (wasCurrent) releaseProjectLock();
  await deleteProjectRecords(id);
  await deleteProjectAssets(id);
  invalidateThumb(id);
  await reloadIndex();
  broadcastIndexChanged();
  if (!wasCurrent) return;
  // $projectIndex is sorted savedAt desc by reloadIndex(), so [0] is the most recent.
  const remaining = $projectIndex.get()[0];
  if (remaining && (await loadProjectRecords(remaining.id, remaining))) {
    await acquireProjectLock(remaining.id);
    await reloadIndex();
  } else {
    await createProject();
  }
}

/**
 * Opens a project decoded from a stateless share link (see projectShareLink.ts) as a NEW
 * saved project with a FRESH id, switched-to and made current — the user's existing projects
 * are untouched. Reconstructed faithfully (no id remapping); camera/selection/history reset.
 */
export async function loadSharedProject(env: ProjectExportEnvelope): Promise<string> {
  const { name } = await loadProjectAsNew(env, { fallbackName: 'Shared Project' });
  return name;
}

/**
 * Materializes an export envelope — EVERY part it carries — as a NEW saved project (design
 * §4.3 "Open as new project", §5 share-link boot). Faithful reconstruction — NO id remapping,
 * built-in layers backfilled — with a fresh project id and a unique name, saved and switched
 * to, the envelope's active part hydrated into the editor. **Never an undo step**: it arrives
 * as a project, not as an edit.
 *
 * `adoptAssets` runs with the new project id BEFORE the document is published, so a
 * `.flexo.tar.gz` can write its blobs into the new namespace (ids unchanged — the namespace
 * is what makes them collision-free) and have them there by the time the custom-asset store's
 * `$currentProjectId` subscriber hydrates against them.
 */
export async function loadProjectAsNew(
  env: ProjectExportEnvelope,
  opts: {
    fallbackName?: string;
    thumbnail?: Blob | null;
    adoptAssets?: (id: ProjectId) => Promise<void>;
  } = {},
): Promise<{ id: ProjectId; name: string }> {
  // Registry entry ids never travel, so every incoming part is minted a fresh one here. Layer
  // view state doesn't travel either (it is per-project view state, not document data).
  const entries: SavedPartEntry[] = envelopeToParts(env).map((entry) => ({
    id: newPartEntryId(),
    name: entry.name,
    visible: entry.visible,
    opacity: entry.opacity,
    offset: entry.offset,
    includeInExport: entry.includeInExport,
    part: entry.part,
    layerView: {},
    activeLayerId: DEFAULT_LAYER_ID,
  }));
  // A parts-less envelope has nothing to open: the clamp below would land on -1. Every real
  // producer guarantees at least one part, so this refuses rather than inventing one.
  if (entries.length === 0) throw new Error('That project carries no parts.');
  const active = entries[Math.min(Math.max(env.activePartIndex, 0), entries.length - 1)];
  const id = newProjectId();
  const name = uniqueProjectName(env.projectName.trim() || opts.fallbackName || 'Imported Project');
  if (opts.adoptAssets) await opts.adoptAssets(id);
  suspended = true;
  try {
    hydrateParts(entries, active.id);
    importHistory({ undo: [], redo: [] });
    $part.set(active.part);
    $activeLayerId.set(DEFAULT_LAYER_ID);
    $layerView.set({});
    $measurements.set([]);
    $containers.set([]);
    clearSelection();
    resetCamera();
    resetModeForProjectLoad();
  } finally {
    suspended = false;
  }
  releaseProjectLock();
  setCurrentProjectId(id);
  $projectName.set(name);
  lastHistoryBytes = 0;
  await writeAllNow();
  await acquireProjectLock(id);
  if (opts.thumbnail) await storeThumbnail(id, opts.thumbnail);
  else requestThumbnail();
  return { id, name };
}
