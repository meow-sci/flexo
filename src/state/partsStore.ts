import { atom, computed } from 'nanostores';
import { createEmptyPart, DEFAULT_LAYER_ID, DEFAULT_PART_ID, isDefaultPartId } from '../ksa/types';
import type { EditingPart, Vec3 } from '../ksa/types';
import { closeChain } from './chainStore';
import { clearCoverageReport } from './colliderStore';
import {
  $activeLayerId,
  $colliderEditContext,
  $lightEditContext,
  $part,
  $revealEntity,
  clearSelection,
  exportHistory,
  importHistory,
  setActivePartEntryId,
} from './editorStore';
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

/**
 * The active part's registry display name — but ONLY in a multi-part project; `null` when the
 * project holds a single part.
 *
 * THE gate every part-aware LABEL reads (the engine navigator's part scope, the Data
 * navigator's pinned root, the Asset Manager's title). One place decides, so a one-part
 * project reads exactly as it did before multi-part existed (I8) and the surfaces cannot
 * drift from each other.
 */
export const $partScopeName = computed([$partEntries, $activePartMeta], (entries, meta) =>
  entries.length > 1 ? (meta?.name ?? null) : null,
);

/**
 * Mirrors the active entry id into `editorStore`, which stamps it onto the clipboard (D5 /
 * P6.03) and hands it to `ivaStore`'s seat-view clamp (P6.02). Those modules cannot import
 * THIS one — the import direction is one-way (see the header) and reversing it would evaluate
 * this file inside `editorStore`'s temporal dead zone, because `$partsSnapshot` below reads
 * `$part` at module scope. Subscribing here keeps the mirror honest with zero boot wiring.
 */
$activePartId.subscribe(setActivePartEntryId);

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

/**
 * Every KSA `<Part Id>` currently in the project — the active part's live id plus each parked
 * doc's. Ids are the EXPORT namespace, not the editor one: unlike entity ids (I3, per-part) they
 * must be unique project-wide, because a multi-part export writes N `<Part>` / `<PartGameData>`
 * siblings into the same file and KSA takes the first of a duplicated id.
 */
function takenPartIds(exceptId?: string): Set<string> {
  const activeId = $activePartId.get();
  const out = new Set<string>();
  for (const meta of $partEntries.get()) {
    if (meta.id === exceptId) continue;
    const part = meta.id === activeId ? $part.get() : inactiveDocs.get(meta.id)?.part;
    if (part) out.add(part.partId);
  }
  return out;
}

/**
 * `base` when free, else `base_2`, `base_3`, … — the Part Id counterpart of
 * {@link firstFreeName}, and the one place the de-collision suffix is spelled.
 *
 * Underscore rather than a space because a Part Id is a KSA identifier that also feeds
 * `partExportNs` (which sanitizes to `[A-Za-z0-9_]`); a space would sanitize away and re-collide
 * in the variant namespace, tripping `part-id-collision` instead of `duplicate-part-id`.
 */
export function uniquePartId(base: string, taken: ReadonlySet<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  return id;
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

/**
 * Drops the four intent/ephemeral atoms the P6.06 audit (above {@link switchPart}) marks
 * `cleared-here`. Each of them names something in the OUTGOING document — by an entity id the
 * incoming part may reuse (I3), or as a measurement of geometry that is about to be replaced.
 * Shared by {@link switchPart} and {@link createPart}: a brand-new part hydrates the same live
 * stores, so a surviving `{ _light1: 2 }` would ambush the first light the user adds to it.
 * `applyProjectSnapshot` calls it too — ids repeat across PROJECTS for the same reason they
 * repeat across parts, so opening a project carries the identical hazard.
 */
export function clearPartScopedIntents(): void {
  $revealEntity.set(null);
  $colliderEditContext.set({});
  $lightEditContext.set({});
  clearCoverageReport();
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
 * THE intent/ephemeral-atom audit (P6.06). Every un-namespaced atom that can hold an ACTIVE
 * PART entity id was read together with its consumers; a stale id must be harmless, because
 * ids are per-part namespaces (I3) and part B may reuse `_light1` / `_seat1` / `layer2`.
 *
 * | atom | verdict |
 * |---|---|
 * | `$dataScope` (`dataModeStore`) | clamped-by-self — `computed([…, $part])` falls back to the part scope when the template isn't placed; a surviving `templateId` is a CATALOG-global id, so a hit is genuinely correct |
 * | `$surfaceMeshId` / `$surfaceFace` / `$faceDraft` (`surfaceModeStore`) | clamped-by-self — `$part.subscribe(clampSurfacePick)`; mesh ids are project-unique (I4), so a survivor really is this project's mesh |
 * | animation set — `$activeAnimationId`, `$activeJointId`, `$editKeyframeId`, `$timelineSelection`, `$membersView`, `$playheadSec`, `$workingPivot` (`animationStore`) | clamped-by-self — the `$part.subscribe` clamp re-resolves all of them |
 * | `$chainSession` (`chainStore`) | cleared-here — `closeChain()` below drops the whole session (seeds + ops) |
 * | `$seatView` / `$seatLook` (`ivaStore`) | clamped-by-self — its own `$part.subscribe` exits when the seat is gone OR when the entry-time part id no longer matches, which is what makes part B's same-numbered seat exit too (P6.02) |
 * | `$moduleFlash` (`engineStore`) | no-op-on-miss — keyed by FIELD name (`'mixtureRatio'`…), never an entity id |
 * | `$colliderFitRequest` (`colliderStore`) | no-op-on-miss — `EditorScene`'s subscriber clears it synchronously, so it cannot outlive the switch |
 * | `$coverageRequest` (`colliderStore`) | no-op-on-miss — a bare boolean, consumed synchronously |
 * | `$ivaSeatAimRequest` (`ivaSeatStore`) | no-op-on-miss — consumed + cleared synchronously, and guarded by `part.ivaSeats[req.index]` |
 * | `$surfaceRevealRequest` (`surfaceModeStore`) | no-op-on-miss — carries a project-unique mesh id; `MeshPicker` returns early when the row is missing |
 * | `$dataFlash` (`dataModeStore`) | no-op-on-miss — a 600 ms tint that expires on its own timer; worst case one wrong mesh blinks |
 * | `$revealEntity` (`editorStore`) | **cleared-here** — its only consumer is the Build-mode-only Outliner, so a reveal published from Data/Animation mode is never drained and would scroll to + flash part B's SAME-ID row on the next Build mount |
 * | `$colliderEditContext` (`editorStore`) | **cleared-here** — see below |
 * | `$lightEditContext` (`editorStore`) | **cleared-here** — see below |
 * | `$coverageReport` (`colliderStore`) | **cleared-here** — holds no ids, but it is a MEASUREMENT of the outgoing document: its uncovered-point dots and percentage would keep rendering over part B and read as part B's score |
 *
 * The two `EditContext` records are the real I3 offenders: `_colliderN` / `_lightN` ids are
 * minted per part, so `{ _light1: 2 }` set by clicking part A's third marker survives into
 * part B and silently anchors the gizmo, the inspector's part-frame fields and the keyboard
 * tools to a placement instance the user never picked in THIS document. Every reader clamps
 * the index to the owner's placement count, so it can only ever be wrong, never a crash —
 * and both maps are append-only, so clearing here also stops them growing all session.
 *
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
  clearPartScopedIntents();
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
  // Every new part starts on the same placeholder id, so the 2nd one onward would collide with
  // the 1st and block export ('duplicate-part-id') until the user renamed it. Suffix instead —
  // `isDefaultPartId` still reads the result as "unset", so nothing downstream mistakes
  // `fixme_part_id_2` for an id the user chose.
  part.partId = uniquePartId(part.partId, takenPartIds());
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
  clearPartScopedIntents();
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
  // Part Ids de-collide on the same rule as names, and against the same running set: an envelope
  // can carry two parts that already share an id, so seeding from the project alone would let the
  // batch collide with itself. Mutating `entry.doc.part` is safe — the doc was built for this
  // call by `entryToPart` and is not shared with the caller's payload.
  const takenIds = takenPartIds();
  const added: PartMetaEntry[] = [];
  const ids: string[] = [];
  for (const entry of entries) {
    const id = newPartEntryId();
    const name = firstFreeName(entry.name.trim() || 'Part', taken);
    taken.add(name);
    entry.doc.part.partId = uniquePartId(entry.doc.part.partId, takenIds);
    takenIds.add(entry.doc.part.partId);
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

  // RACE: the clone above is async, so any registry read taken before it is stale — a second
  // duplicate or a `deletePart` can land in that window. Everything below is built from THIS
  // read: publishing a pre-await snapshot would drop the interleaved copy (leaving
  // `$activePartId` naming an entry `$partEntries` no longer lists) or resurrect a deleted
  // entry whose parked document is already gone (`snapshotParts()` would spread `undefined`).
  const entries = $partEntries.get();
  const index = entries.findIndex((entry) => entry.id === id);
  // Bailing here means the clone's re-minted blobs are already written but will never be
  // registered to a part, and nothing else reclaims them (no orphan GC), so sweep them now.
  if (index === -1) {
    await assetSweeper?.(cloned);
    return null;
  }
  const source = entries[index];

  // Two parts sharing a KSA Part Id is a P3 export-preflight blocker, so de-collide the copy's.
  // `_copy` first (it reads as what it is), then a counter for the 2nd copy onward — `X_copy`,
  // `X_copy_2`, … The placeholder gets no `_copy`: it is the "unset" value the user is expected
  // to replace in Data ▸ Identity, so it stays recognizable as one (`isDefaultPartId`) and only
  // takes the counter. Computed HERE, after the await, so it sees any part added in that window.
  cloned.partId = isDefaultPartId(cloned.partId)
    ? uniquePartId(DEFAULT_PART_ID, takenPartIds())
    : uniquePartId(`${cloned.partId}_copy`, takenPartIds());

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

/** One included part as the export builders want it: the document plus its registry identity. */
export interface ExportPartEntry {
  entryId: string;
  name: string;
  part: EditingPart;
}

/**
 * THE gathering rule (I7): which parts a registry snapshot exports, in registry order, with
 * the entry id + display name each export builder needs to namespace and label them. Excluded
 * parts are invisible to export.
 *
 * Split out of {@link partsForExport} so a React surface holding a snapshot from
 * `$partsSnapshot` can apply the very same filter+map — a zero-argument store reader called in
 * a render body would be memoized by the React Compiler against a dependency it cannot see.
 * One rule, one place: a future extra filter or sort cannot desync the dialog from the preview
 * store and the writers.
 */
export function exportEntriesFrom(snapshot: readonly SavedPartEntry[]): ExportPartEntry[] {
  return snapshot
    .filter((entry) => entry.includeInExport)
    .map((entry) => ({ entryId: entry.id, name: entry.name, part: entry.part }));
}

/** {@link exportEntriesFrom} over the live registry. */
export function partsForExport(): ExportPartEntry[] {
  return exportEntriesFrom(snapshotParts());
}
