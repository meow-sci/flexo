import { atom, computed } from 'nanostores';
import { createEmptyPart, DEFAULT_LAYER_ID, DEFAULT_PART_ID } from '../ksa/types';
import type { EditingPart, Vec3 } from '../ksa/types';
import { closeChain } from './chainStore';
import { $activeLayerId, $part, clearSelection, exportHistory, importHistory } from './editorStore';
import type { HistorySnapshot } from './editorStore';
import { $layerView } from './layerStore';
import type { LayerViewState } from './layerStore';
import { clonePartWithFreshAssets } from './partClone';
import { deriveCounts } from './projectDb';
import type { ProjectCounts, SavedPartEntry } from './projectDb';
import { $currentProjectId } from './projectIndexStore';

/**
 * The part registry — a project holds N Parts, but every editing surface stays
 * one-part-at-a-time. This module owns the ordered list of part meta plus the parked
 * documents of the *inactive* parts; the active part lives in the existing stores
 * (`$part`, `$layerView`, `$activeLayerId`, undo stacks) exactly as it does today.
 *
 * State invariants (`plans/MULTI_PART_PLAN.md` §0.5):
 *
 * - **I1 — the active-part surface is sacred.** No existing store changes shape and no
 *   consumer of `$part` / `$selection` / `$layerView` / `$activeLayerId` / any mode store
 *   learns about parts. Only this module, persistence, export, the scene's ghost layer and
 *   the switcher UI are part-aware.
 * - **I2 — single writer for inactive docs.** Only this module mutates {@link inactiveDocs}
 *   and {@link inactiveHistories}. Everything else reads them through this module's
 *   accessors.
 * - **I3 — ids are per-part namespaces.** Entity ids (`_connector1`, `_light1`, instance ids,
 *   layer ids…) are unique only *within* one part — two parts may both contain `_light1`.
 *   Nothing may build a cross-part map keyed by a bare entity id; anything project-wide keys
 *   by `(partEntryId, entityId)`.
 * - **I6 — the part registry is never undoable.** Create / delete / duplicate / rename /
 *   reorder / visibility / opacity / offset / include-in-export are lifecycle + view state
 *   (like project ops and `$layerView`), not document mutations: no `pushUndo`, ever.
 *
 * Import direction is one-way: `partsStore` imports FROM `editorStore` / `layerStore`;
 * nothing in those modules imports `partsStore`. No react / three imports.
 */

/** Meta for every part in the project, ordered. Never contains the document. */
export interface PartMetaEntry {
  /** stable editor id 'pt_…' — never exported, never shown */
  id: string;
  /** display name, e.g. "Part 1" — never exported */
  name: string;
  /** ghost visibility when inactive (default true) */
  visible: boolean;
  /** ghost opacity 0..1 (default 1) */
  opacity: number;
  /** workspace-only ghost offset in meters (default 0,0,0) */
  offset: Vec3;
  /** default true (D4) */
  includeInExport: boolean;
  /** refreshed on park/create/load — dropdown chips read this */
  counts: ProjectCounts;
}

/** What an inactive part parks. Layers are per-part, so view state travels with it. */
export interface InactivePartDoc {
  part: EditingPart;
  layerView: Record<string, LayerViewState>;
  activeLayerId: string;
}

export const $partEntries = atom<readonly PartMetaEntry[]>([]);
export const $activePartId = atom<string>('');
/** Bumped whenever inactiveDocs contents change (switch/create/delete/hydrate). */
export const $inactiveRevision = atom(0);
export const $activePartMeta = computed(
  [$partEntries, $activePartId],
  (entries, id) => entries.find((e) => e.id === id) ?? null,
);

/** I2: single writer = this module. */
const inactiveDocs = new Map<string, InactivePartDoc>();
/** Parked undo/redo per part. I2: single writer = this module. */
const inactiveHistories = new Map<string, HistorySnapshot>();

/** The injected custom-asset blob sweep — see {@link registerPartAssetSweeper}. */
let assetSweeper: ((doc: EditingPart) => Promise<void>) | null = null;

/** The injected all-parts custom-asset hydrate — see {@link registerPartAssetHydrator}. */
let assetHydrator: (() => Promise<void>) | null = null;

/**
 * Wires the custom-asset blob sweep {@link deletePart} runs on the part it destroys. Call ONCE
 * at app startup. The dependency is inverted through this one slot because `customAssetStore`
 * imports THIS module (`snapshotParts`), so importing it back would be a cycle — the same
 * pattern, and the same reason, as `registerEditorAidStores` in `editorStore.ts`.
 */
export function registerPartAssetSweeper(fn: (doc: EditingPart) => Promise<void>): void {
  assetSweeper = fn;
}

/**
 * Wires the all-parts custom-asset hydrate {@link duplicatePart} runs once the copy is in the
 * registry (its re-minted textures and painted-glow bitmaps need blob URLs before anything can
 * render them). Call ONCE at app startup, next to {@link registerPartAssetSweeper} — and for
 * the same reason: `customAssetStore` imports THIS module (`snapshotParts`), so importing
 * `hydrateCustomAssets` back would close a cycle.
 */
export function registerPartAssetHydrator(fn: () => Promise<void>): void {
  assetHydrator = fn;
}

/**
 * Mints a part entry id: `pt_` + 10 random base36 characters. Editor-only and stable for the
 * life of the entry — never exported, never derived from the display name (D6).
 */
export function newPartEntryId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = 'pt_';
  for (const byte of bytes) out += (byte % 36).toString(36);
  return out;
}

/** Returns `base 1`, or `base 2`, `base 3`, … — the first name no part entry already has. */
export function uniquePartName(base: string = 'Part', exceptId?: string): string {
  const taken = new Set(
    $partEntries
      .get()
      .filter((entry) => entry.id !== exceptId)
      .map((entry) => entry.name),
  );
  const trimmed = base.trim() || 'Part';
  for (let n = 1; ; n++) {
    const candidate = `${trimmed} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * `base` when nothing has it, else `base 2`, `base 3`, … — the keep-the-name-you-asked-for
 * rule shared by {@link addImportedParts} and {@link duplicatePart}. Deliberately NOT
 * {@link uniquePartName}, which always appends " 1" because it names a part nobody named.
 */
function firstFreeName(base: string, taken: ReadonlySet<string>): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
  return name;
}

/** The parked document of an inactive part, or null — the active part has none (it is live). */
export function getInactiveDoc(id: string): InactivePartDoc | null {
  return inactiveDocs.get(id) ?? null;
}

/** Replaces every parked history with `byPart` (load / apply-snapshot). */
export function parkHistories(byPart: Record<string, HistorySnapshot>): void {
  inactiveHistories.clear();
  for (const [id, snapshot] of Object.entries(byPart)) inactiveHistories.set(id, snapshot);
}

/** The parked histories as a plain record, for persistence. */
export function inactiveHistoriesRecord(): Record<string, HistorySnapshot> {
  return Object.fromEntries(inactiveHistories);
}

function bumpInactiveRevision(): void {
  $inactiveRevision.set($inactiveRevision.get() + 1);
}

/**
 * SavedPartEntry[] in $partEntries order. Active part composes from the LIVE stores;
 * inactive parts from inactiveDocs. Pure read — mutates nothing.
 */
export function snapshotParts(): SavedPartEntry[] {
  const activeId = $activePartId.get();
  return $partEntries.get().map((meta) => {
    const doc =
      meta.id === activeId
        ? { part: $part.get(), layerView: $layerView.get(), activeLayerId: $activeLayerId.get() }
        : inactiveDocs.get(meta.id)!;
    // counts are derived, not persisted — SavedPartEntry deliberately has none.
    const { counts: _counts, ...persisted } = meta;
    return { ...persisted, ...doc };
  });
}

/**
 * The reactive form of {@link snapshotParts} for React surfaces. `snapshotParts()` takes no
 * arguments and reads module-mutable state, so a component that calls it in a render body gets
 * memoized against a dependency the React Compiler cannot see — the result is computed once and
 * then never refreshed. Subscribe to this instead; it lists every store the snapshot reads from.
 */
export const $partsSnapshot = computed(
  [$partEntries, $activePartId, $inactiveRevision, $part, $layerView, $activeLayerId],
  () => snapshotParts(),
);

/**
 * Rebuilds the whole registry from a loaded snapshot: REPLACES both module maps, fills
 * `$partEntries` (counts derived), parks every non-active entry's document and points
 * `$activePartId` at `activeId`. The ACTIVE entry's document is NOT hydrated here — the caller
 * publishes it into `$part` / `$layerView` / `$activeLayerId` (`applyProjectSnapshot`).
 */
export function hydrateParts(parts: readonly SavedPartEntry[], activeId: string): void {
  inactiveDocs.clear();
  inactiveHistories.clear();
  const entries: PartMetaEntry[] = [];
  for (const entry of parts) {
    entries.push({
      id: entry.id,
      name: entry.name,
      visible: entry.visible,
      opacity: entry.opacity,
      offset: entry.offset,
      includeInExport: entry.includeInExport,
      counts: deriveCounts(entry.part),
    });
    if (entry.id === activeId) continue;
    inactiveDocs.set(entry.id, {
      part: entry.part,
      layerView: entry.layerView,
      activeLayerId: entry.activeLayerId,
    });
  }
  $partEntries.set(entries);
  $activePartId.set(activeId);
  bumpInactiveRevision();
}

/** Resets the registry to the one empty "Part 1" a brand-new project starts with. */
export function initPartsForNewProject(): void {
  inactiveDocs.clear();
  inactiveHistories.clear();
  const id = newPartEntryId();
  $partEntries.set([
    {
      id,
      name: 'Part 1',
      visible: true,
      opacity: 1,
      offset: { x: 0, y: 0, z: 0 },
      includeInExport: true,
      counts: deriveCounts(createEmptyPart()),
    },
  ]);
  $activePartId.set(id);
  bumpInactiveRevision();
}

// ── switching, CRUD and view state ───────────────────────────────────────────
//
// Every function below is lifecycle or view state, NEVER a document mutation: not one of them
// calls `pushUndo` (I6). The two documents involved in a switch keep their own undo stacks,
// which travel with them into and out of `inactiveHistories`.

/** Immutably patches one entry. The single `$partEntries` write path for the setters below. */
function updateEntry(id: string, patch: Partial<PartMetaEntry>): void {
  $partEntries.set(
    $partEntries.get().map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  );
}

/** Re-derives one entry's chip counts from its document. Counts are meta, not persisted. */
function refreshCounts(id: string, part: EditingPart): void {
  updateEntry(id, { counts: deriveCounts(part) });
}

/** Parks the live active-part stores into the registry. Shared by switch / create / delete. */
function parkActive(): void {
  const activeId = $activePartId.get();
  const part = $part.get();
  inactiveDocs.set(activeId, {
    part,
    layerView: $layerView.get(),
    activeLayerId: $activeLayerId.get(),
  });
  inactiveHistories.set(activeId, exportHistory());
  refreshCounts(activeId, part);
}

/**
 * Makes `id` the active part — a mini `applyProjectSnapshot` (`src/state/projectStore.ts`)
 * minus the project-level state: park the outgoing document + history, hydrate the incoming
 * one into the live stores. Returns false when `id` is already active or names no entry.
 */
export function switchPart(id: string): boolean {
  if (id === $activePartId.get()) return false;
  if (!$partEntries.get().some((entry) => entry.id === id)) return false;
  parkActive();
  const doc = inactiveDocs.get(id)!;
  inactiveDocs.delete(id);
  const history = inactiveHistories.get(id) ?? { undo: [], redo: [] };
  inactiveHistories.delete(id);
  $activePartId.set(id);
  importHistory(history);
  // The cascade: this one write reconciles the scene and re-clamps every mode sub-store,
  // exactly as opening a project does.
  $part.set(doc.part);
  $activeLayerId.set(
    doc.part.layers.some((l) => l.id === doc.activeLayerId) ? doc.activeLayerId : DEFAULT_LAYER_ID,
  );
  $layerView.set(doc.layerView);
  clearSelection();
  // An open action chain is seeded by instanceIds of the OUTGOING document, so it is
  // meaningless here — same contract as a project load.
  closeChain();
  bumpInactiveRevision();
  // Deliberate NON-actions, each one load-bearing:
  // - No `pushUndo` — the part registry is never undoable (I6).
  // - No `resetModeForProjectLoad()` — the mode survives a part switch BY DESIGN. Every mode
  //   sub-store self-clamps on the `$part.set` above (`dataModeStore.ts:114-121`,
  //   `animationStore.ts:1544-1598`, `surfaceModeStore.ts:199`, engine computeds), so the
  //   editor's posture belongs to the session, not to the incoming part.
  // - No camera touch — the viewport frame is the shared workspace, not part state.
  // - No autosave suspension — every write above is synchronous, so the 300 ms / 1500 ms
  //   debounced writers (`projectStore.ts`) only ever observe the final, consistent state.
  return true;
}

/**
 * Creates an empty part, makes it active, and returns its entry id. NO user feedback here:
 * partsStore never imports `src/ui` — the command layer owns every toast.
 */
export function createPart(name?: string): string {
  parkActive();
  const id = newPartEntryId();
  const part = createEmptyPart();
  // Active id first: every entry published to $partEntries must already have a parked doc or be
  // the active one, or a subscriber could see an entry snapshotParts() has no document for.
  $activePartId.set(id);
  $partEntries.set([
    ...$partEntries.get(),
    {
      id,
      name: uniquePartName(name),
      visible: true,
      opacity: 1,
      offset: { x: 0, y: 0, z: 0 },
      includeInExport: true,
      counts: deriveCounts(part),
    },
  ]);
  importHistory({ undo: [], redo: [] });
  $part.set(part);
  $activeLayerId.set(DEFAULT_LAYER_ID);
  $layerView.set({});
  clearSelection();
  closeChain();
  bumpInactiveRevision();
  return id;
}

/**
 * Appends imported parts to the registry, each already merged into its own document. Names are
 * kept when free and suffixed (" 2", " 3", …) when taken — the {@link renamePart} rule, applied
 * across the batch too. Fresh entry ids (registry ids never travel), counts derived, docs parked
 * as inactive.
 *
 * Deliberately does NOT switch: the caller decides where the user lands. Returns the new ids in
 * the order they were added.
 */
export function addImportedParts(
  entries: readonly {
    name: string;
    visible: boolean;
    opacity: number;
    offset: Vec3;
    includeInExport: boolean;
    doc: InactivePartDoc;
  }[],
): string[] {
  const taken = new Set($partEntries.get().map((entry) => entry.name));
  const added: PartMetaEntry[] = [];
  const ids: string[] = [];
  for (const entry of entries) {
    const id = newPartEntryId();
    const name = firstFreeName(entry.name.trim() || 'Part', taken);
    taken.add(name);
    inactiveDocs.set(id, entry.doc);
    added.push({
      id,
      name,
      visible: entry.visible,
      opacity: entry.opacity,
      offset: entry.offset,
      includeInExport: entry.includeInExport,
      counts: deriveCounts(entry.doc.part),
    });
    ids.push(id);
  }
  $partEntries.set([...$partEntries.get(), ...added]);
  bumpInactiveRevision();
  return ids;
}

/**
 * Copies a part — document, custom assets and all — into a new entry right after it, and makes
 * the COPY active (so the user lands where their next edit belongs). Returns the new entry id,
 * or null when `id` names no entry — including one deleted while the clone was in flight.
 *
 * The copy's custom assets get a brand-new identity via {@link clonePartWithFreshAssets}
 * (I4 — asset ids and custom-mesh SubPart ids are project-unique, so a shared id would alias
 * blobs and collide at export), which is why this is the one async registry action.
 *
 * NO user feedback here: partsStore never imports `src/ui` — the command layer owns the toast.
 */
export async function duplicatePart(id: string): Promise<string | null> {
  if (!$partEntries.get().some((entry) => entry.id === id)) return null;
  // The active part composes from the LIVE stores — the same read as `parkActive`, without
  // its writes: duplicating must not disturb the document being duplicated.
  const doc =
    id === $activePartId.get()
      ? { part: $part.get(), layerView: $layerView.get(), activeLayerId: $activeLayerId.get() }
      : inactiveDocs.get(id);
  if (!doc) return null;

  const cloned = await clonePartWithFreshAssets(doc.part, $currentProjectId.get());
  // Two parts sharing a KSA Part Id is a P3 export-preflight blocker. Suffixing keeps the
  // common case green; the placeholder is left alone, because it is already the "unset" value
  // the user is expected to replace in Data ▸ Identity.
  if (cloned.partId !== DEFAULT_PART_ID) cloned.partId = `${cloned.partId}_copy`;

  // RACE: the clone above is async, so any registry read taken before it is stale — a second
  // duplicate or a `deletePart` can land in that window. Everything below is built from THIS
  // read: publishing a pre-await snapshot would drop the interleaved copy (leaving
  // `$activePartId` naming an entry `$partEntries` no longer lists) or resurrect a deleted
  // entry whose parked document is already gone (`snapshotParts()` would spread `undefined`).
  const entries = $partEntries.get();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const source = entries[index];

  const newId = newPartEntryId();
  // Park BEFORE publishing the entry: every non-active `$partEntries` entry must already have a
  // parked document, or a subscriber could see an entry `snapshotParts()` has no document for.
  // No `inactiveHistories` entry either — a copy starts with an empty undo stack.
  inactiveDocs.set(newId, {
    part: cloned,
    layerView: structuredClone(doc.layerView),
    activeLayerId: doc.activeLayerId,
  });
  const name = firstFreeName(`${source.name} copy`, new Set(entries.map((entry) => entry.name)));
  const next = [...entries];
  next.splice(index + 1, 0, {
    id: newId,
    name,
    visible: source.visible,
    opacity: source.opacity,
    offset: { ...source.offset },
    includeInExport: source.includeInExport,
    counts: deriveCounts(cloned),
  });
  $partEntries.set(next);

  // The clone's textures and painted-glow bitmaps now exist under fresh keys with no blob URLs
  // published for them; hydration reads the whole registry, so the entry must be in place first.
  await assetHydrator?.();
  bumpInactiveRevision();
  switchPart(newId);
  return newId;
}

/**
 * Destroys a part, its parked history and its custom-asset blobs. Refuses when it would empty
 * the project — the UI disables that control, but THIS guard is the authoritative one.
 * Deleting the ACTIVE part switches to a neighbour first, so the doomed document is always
 * parked by the time it is removed.
 */
export function deletePart(id: string): boolean {
  const entries = $partEntries.get();
  if (entries.length <= 1) return false;
  const index = entries.findIndex((entry) => entry.id === id);
  if (index === -1) return false;
  // The fallback is the next entry, else the previous one — a switch parks the doomed doc.
  if (id === $activePartId.get()) switchPart((entries[index + 1] ?? entries[index - 1]).id);
  const doomed = inactiveDocs.get(id)!;
  $partEntries.set($partEntries.get().filter((entry) => entry.id !== id));
  inactiveDocs.delete(id);
  inactiveHistories.delete(id);
  bumpInactiveRevision();
  // Fire-and-forget: the blob sweep is IndexedDB work with nothing to report, and the registry
  // must not wait on it. I4 — asset ids are project-unique, so this part's assets are its own.
  void assetSweeper?.(doomed.part);
  return true;
}

/**
 * Renames a part. An empty name keeps the current one; a taken name is auto-suffixed (" 2",
 * " 3", …) so a rename can never collide with another entry — the same rule as `renameProject`
 * (`src/state/projectIndexStore.ts`). Returns the name actually applied.
 */
export function renamePart(id: string, rawName: string): string {
  const entries = $partEntries.get();
  const current = entries.find((entry) => entry.id === id)!;
  const trimmed = rawName.trim();
  if (!trimmed) return current.name;
  const taken = new Set(entries.filter((entry) => entry.id !== id).map((entry) => entry.name));
  let applied = trimmed;
  for (let n = 2; taken.has(applied); n++) applied = `${trimmed} ${n}`;
  if (applied !== current.name) updateEntry(id, { name: applied });
  return applied;
}

/**
 * Moves a part one slot up (`-1`) or down (`1`) in the registry order — which is the dropdown
 * order AND the order parts serialize in. A no-op at either end.
 */
export function movePart(id: string, dir: -1 | 1): void {
  const entries = $partEntries.get();
  const index = entries.findIndex((entry) => entry.id === id);
  const target = index + dir;
  if (index === -1 || target < 0 || target >= entries.length) return;
  const next = [...entries];
  next[index] = entries[target];
  next[target] = entries[index];
  $partEntries.set(next);
}

/** Ghost visibility while the part is inactive. View state (I6): never undo. */
export function setPartVisible(id: string, visible: boolean): void {
  updateEntry(id, { visible });
}

/** Ghost opacity, clamped to 0..1 (non-finite input falls back to fully opaque). View state (I6). */
export function setPartOpacity(id: string, opacity: number): void {
  const clamped = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
  updateEntry(id, { opacity: clamped });
}

/**
 * Workspace-only ghost offset in meters (D3 — never exported). A non-finite axis keeps its
 * current value, so a half-typed number field can't wipe the offset. View state (I6).
 */
export function setPartOffset(id: string, offset: Vec3): void {
  const current = $partEntries.get().find((entry) => entry.id === id)!.offset;
  updateEntry(id, {
    offset: {
      x: Number.isFinite(offset.x) ? offset.x : current.x,
      y: Number.isFinite(offset.y) ? offset.y : current.y,
      z: Number.isFinite(offset.z) ? offset.z : current.z,
    },
  });
}

/** Whether Export to KSA emits this part (D4). View state (I6): never undo. */
export function setPartIncludeInExport(id: string, includeInExport: boolean): void {
  updateEntry(id, { includeInExport });
}

/**
 * The included parts in registry order, with the entry id + display name each export builder
 * needs to namespace and label them (I7). Excluded parts are invisible to export.
 */
export function partsForExport(): Array<{ entryId: string; name: string; part: EditingPart }> {
  return snapshotParts()
    .filter((entry) => entry.includeInExport)
    .map((entry) => ({ entryId: entry.id, name: entry.name, part: entry.part }));
}
