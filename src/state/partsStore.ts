import { atom, computed } from 'nanostores';
import { createEmptyPart } from '../ksa/types';
import type { EditingPart, Vec3 } from '../ksa/types';
import { $activeLayerId, $part } from './editorStore';
import type { HistorySnapshot } from './editorStore';
import { $layerView } from './layerStore';
import type { LayerViewState } from './layerStore';
import { deriveCounts } from './projectDb';
import type { ProjectCounts, SavedPartEntry } from './projectDb';

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
