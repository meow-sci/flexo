/**
 * ICRP document state: the project (N static objects, one active), selection,
 * and undo/redo (plans/ICRP_PLAN.md P3.01/P3.02).
 *
 * Undo model (flexo's two-pattern invariant I6, simplified to whole-project
 * snapshots — a launch complex is a few hundred placements, so structuredClone
 * is cheap):
 *  - discrete mutators call `pushUndo(desc)` themselves, then mutate;
 *  - streaming gestures (gizmo drags, typing sessions) call `beginGesture(desc)`
 *    ONCE at interaction start, then stream mutations without further pushes.
 *
 * Layering: no react, no three (AGENTS.md).
 */
import { atom, computed } from 'nanostores';
import { randomId } from '../../../../src/state/ids';
import {
  createStaticObjectDoc,
  identityTransform,
  type Placement,
  type StaticObjectDoc,
  type Transform,
} from '../ksa/types';

export const ICRP_PROJECT_SCHEMA_VERSION = 1;

export const DEFAULT_LAYER_ID = 'default';

export interface IcrpProjectDoc {
  schemaVersion: typeof ICRP_PROJECT_SCHEMA_VERSION;
  /** Mod name (drives export ids/folder; sanitized at export). */
  modName: string;
  objects: StaticObjectDoc[];
  activeObjectId: string;
}

function freshProject(): IcrpProjectDoc {
  const first = createStaticObjectDoc(`icrp_object_${randomId().slice(0, 8)}`, 'Object 1');
  return {
    schemaVersion: ICRP_PROJECT_SCHEMA_VERSION,
    modName: 'my-complex',
    objects: [first],
    activeObjectId: first.id,
  };
}

export const $project = atom<IcrpProjectDoc>(freshProject());

/** The active object (always resolvable — the store keeps activeObjectId valid). */
export const $activeObject = computed($project, (p) => {
  return p.objects.find((o) => o.id === p.activeObjectId) ?? p.objects[0];
});

/** Selected placement instanceIds (active object only). */
export const $selection = atom<string[]>([]);

// --- Undo/redo -----------------------------------------------------------------

interface HistoryEntry {
  description: string;
  project: IcrpProjectDoc;
  selection: string[];
}

const MAX_UNDO = 50;
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
let gestureActive = false;

/** Undo/redo depths, for toolbar button disabling. */
export const $historyDepth = atom<{ undo: number; redo: number }>({ undo: 0, redo: 0 });

function publishDepth(): void {
  $historyDepth.set({ undo: undoStack.length, redo: redoStack.length });
}

function snapshot(description: string): HistoryEntry {
  return {
    description,
    project: structuredClone($project.get()),
    selection: [...$selection.get()],
  };
}

/** Discrete-mutator pattern: capture state BEFORE the mutation. */
export function pushUndo(description: string): void {
  undoStack.push(snapshot(description));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack = [];
  publishDepth();
}

/**
 * Streaming pattern: push once at interaction start; subsequent streamed
 * mutations (gizmo drag frames, per-keystroke commits) skip the push.
 */
export function beginGesture(description: string): void {
  if (gestureActive) return;
  gestureActive = true;
  pushUndo(description);
}

/** Ends the streaming gesture begun by {@link beginGesture}. */
export function endGesture(): void {
  gestureActive = false;
}

export function undo(): string {
  const entry = undoStack.pop();
  if (!entry) return '';
  redoStack.push(snapshot(entry.description));
  $project.set(entry.project);
  $selection.set(entry.selection);
  publishDepth();
  return entry.description;
}

export function redo(): string {
  const entry = redoStack.pop();
  if (!entry) return '';
  undoStack.push(snapshot(entry.description));
  $project.set(entry.project);
  $selection.set(entry.selection);
  publishDepth();
  return entry.description;
}

/** Test/boot hook: clears history and replaces the project without an undo step. */
export function resetProject(project?: IcrpProjectDoc): void {
  undoStack = [];
  redoStack = [];
  gestureActive = false;
  $selection.set([]);
  $project.set(project ?? freshProject());
  publishDepth();
}

// --- Mutation helpers ----------------------------------------------------------

/** Immutably updates the active object through `fn` (no undo push — callers own that). */
function mutateActive(fn: (obj: StaticObjectDoc) => StaticObjectDoc): void {
  const p = $project.get();
  $project.set({
    ...p,
    objects: p.objects.map((o) => (o.id === $activeObject.get().id ? fn(o) : o)),
  });
}

/** Clamps the selection to placements that still exist in the active object. */
function clampSelection(): void {
  const ids = new Set($activeObject.get().placements.map((pl) => pl.instanceId));
  const kept = $selection.get().filter((id) => ids.has(id));
  if (kept.length !== $selection.get().length) $selection.set(kept);
}

// --- Placement mutators (each enrolled in undo, invariant I6) -------------------

/** Adds a placement of `pieceId` and selects it. Returns the new instance id. */
export function addPlacement(pieceId: string, transform?: Transform): string {
  pushUndo('Add piece');
  const instanceId = `${pieceId.replace(/^.*_Subpart_/, '').toLowerCase()}_${randomId().slice(0, 8)}`;
  const placement: Placement = {
    instanceId,
    pieceId,
    transform: transform ?? identityTransform(),
    layerId: DEFAULT_LAYER_ID,
  };
  mutateActive((o) => ({ ...o, placements: [...o.placements, placement] }));
  $selection.set([instanceId]);
  return instanceId;
}

export function removePlacements(instanceIds: readonly string[]): void {
  if (instanceIds.length === 0) return;
  pushUndo('Delete');
  const dead = new Set(instanceIds);
  mutateActive((o) => ({
    ...o,
    placements: o.placements.filter((pl) => !dead.has(pl.instanceId)),
  }));
  clampSelection();
}

/** Duplicates the given placements (fresh ids, same transforms) and selects the copies. */
export function duplicatePlacements(instanceIds: readonly string[]): string[] {
  if (instanceIds.length === 0) return [];
  pushUndo('Duplicate');
  const src = new Set(instanceIds);
  const copies: Placement[] = [];
  for (const pl of $activeObject.get().placements) {
    if (!src.has(pl.instanceId)) continue;
    copies.push({
      ...structuredClone(pl),
      instanceId: `${pl.pieceId.replace(/^.*_Subpart_/, '').toLowerCase()}_${randomId().slice(0, 8)}`,
    });
  }
  mutateActive((o) => ({ ...o, placements: [...o.placements, ...copies] }));
  $selection.set(copies.map((c) => c.instanceId));
  return copies.map((c) => c.instanceId);
}

/**
 * Streaming transform write (gizmo drags / typing): callers MUST have begun a
 * gesture (or pushed undo) first.
 */
export function setPlacementTransform(instanceId: string, transform: Transform): void {
  mutateActive((o) => ({
    ...o,
    placements: o.placements.map((pl) =>
      pl.instanceId === instanceId ? { ...pl, transform } : pl,
    ),
  }));
}

/** Reads one placement of the active object. */
export function getPlacement(instanceId: string): Placement | undefined {
  return $activeObject.get().placements.find((pl) => pl.instanceId === instanceId);
}

/**
 * Batch discrete transform write (align/distribute/drop/rest): ONE undo step
 * for the whole batch.
 */
export function transformPlacements(
  description: string,
  updates: ReadonlyMap<string, Transform>,
): void {
  if (updates.size === 0) return;
  pushUndo(description);
  mutateActive((o) => ({
    ...o,
    placements: o.placements.map((pl) => {
      const t = updates.get(pl.instanceId);
      return t ? { ...pl, transform: t } : pl;
    }),
  }));
}

/**
 * Adds array copies of a seed placement (plans/ICRP_PLAN.md P4.05): one undo
 * step, copies selected afterwards. Transforms come from `three/arrays.ts`.
 */
export function addArrayCopies(seedInstanceId: string, transforms: readonly Transform[]): string[] {
  const seed = getPlacement(seedInstanceId);
  if (!seed || transforms.length === 0) return [];
  pushUndo('Array');
  const copies: Placement[] = transforms.map((t) => ({
    instanceId: `${seed.pieceId.replace(/^.*_Subpart_/, '').toLowerCase()}_${randomId().slice(0, 8)}`,
    pieceId: seed.pieceId,
    transform: structuredClone(t) as Transform,
    layerId: seed.layerId,
  }));
  mutateActive((o) => ({ ...o, placements: [...o.placements, ...copies] }));
  $selection.set([seedInstanceId, ...copies.map((c) => c.instanceId)]);
  return copies.map((c) => c.instanceId);
}

// --- Object metres -------------------------------------------------------------

export function setObjectMeters(
  field: 'groundOffsetM' | 'surfaceHeightM' | 'footprintRadiusM',
  value: number | null,
): void {
  mutateActive((o) => ({ ...o, [field]: value }));
}

// --- Object CRUD ---------------------------------------------------------------

export function addObject(name?: string): string {
  pushUndo('New object');
  const p = $project.get();
  const doc = createStaticObjectDoc(
    `icrp_object_${randomId().slice(0, 8)}`,
    name ?? `Object ${p.objects.length + 1}`,
  );
  $project.set({ ...p, objects: [...p.objects, doc], activeObjectId: doc.id });
  $selection.set([]);
  return doc.id;
}

export function switchObject(objectId: string): void {
  const p = $project.get();
  if (!p.objects.some((o) => o.id === objectId) || p.activeObjectId === objectId) return;
  $project.set({ ...p, activeObjectId: objectId });
  $selection.set([]);
}

export function removeObject(objectId: string): void {
  const p = $project.get();
  if (p.objects.length <= 1) return; // a project always holds at least one object
  pushUndo('Delete object');
  const objects = p.objects.filter((o) => o.id !== objectId);
  $project.set({
    ...p,
    objects,
    activeObjectId: p.activeObjectId === objectId ? objects[0].id : p.activeObjectId,
  });
  $selection.set([]);
}

export function renameObject(objectId: string, name: string): void {
  pushUndo('Rename object');
  const p = $project.get();
  $project.set({
    ...p,
    objects: p.objects.map((o) => (o.id === objectId ? { ...o, name } : o)),
  });
}
