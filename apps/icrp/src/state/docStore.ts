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
  DEFAULT_LAYER_ID,
  identityTransform,
  type LayerDef,
  type PartCollider,
  type Placement,
  type StaticObjectDoc,
  type Transform,
} from '../ksa/types';
import { defaultDecal, type Site } from '../ksa/siteTypes';

export const ICRP_PROJECT_SCHEMA_VERSION = 1;

export { DEFAULT_LAYER_ID };

export interface IcrpProjectDoc {
  schemaVersion: typeof ICRP_PROJECT_SCHEMA_VERSION;
  /** Mod name (drives export ids/folder; sanitized at export). */
  modName: string;
  objects: StaticObjectDoc[];
  activeObjectId: string;
  /** Launch sites (plan P7.02) — exported as the mod's `<System>` scenario. */
  sites: Site[];
}

function freshProject(): IcrpProjectDoc {
  const first = createStaticObjectDoc(`icrp_object_${randomId().slice(0, 8)}`, 'Object 1');
  return {
    schemaVersion: ICRP_PROJECT_SCHEMA_VERSION,
    modName: 'my-complex',
    objects: [first],
    activeObjectId: first.id,
    sites: [],
  };
}

export const $project = atom<IcrpProjectDoc>(freshProject());

/** The active object (always resolvable — the store keeps activeObjectId valid). */
export const $activeObject = computed($project, (p) => {
  return p.objects.find((o) => o.id === p.activeObjectId) ?? p.objects[0];
});

/** Selected placement instanceIds (active object only). */
export const $selection = atom<string[]>([]);

/** The layer new placements land in (session state; clamped on object switch). */
export const $activeLayerId = atom<string>(DEFAULT_LAYER_ID);

/**
 * The selected COLLIDER (single-select; mutually exclusive with the placement
 * selection). `owner` = a placement instanceId for a placement-owned collider,
 * or null for an object-level one. Template (piece-owned) colliders are
 * read-only and never selectable.
 */
export interface ColliderRef {
  owner: string | null;
  colliderId: string;
}

export const $colliderSelection = atom<ColliderRef | null>(null);

/** Reads the collider a ref points at, or undefined. */
export function getCollider(ref: ColliderRef): PartCollider | undefined {
  const obj = $activeObject.get();
  const list =
    ref.owner === null
      ? obj.objectColliders
      : obj.placements.find((pl) => pl.instanceId === ref.owner)?.colliders;
  return list?.find((c) => c.id === ref.colliderId);
}

function clampColliderSelection(): void {
  const ref = $colliderSelection.get();
  if (ref && !getCollider(ref)) $colliderSelection.set(null);
}

function clampActiveLayer(): void {
  const layers = $activeObject.get().layers;
  if (!layers.some((l) => l.id === $activeLayerId.get())) {
    $activeLayerId.set(DEFAULT_LAYER_ID);
  }
}

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
  clampColliderSelection();
  publishDepth();
  return entry.description;
}

export function redo(): string {
  const entry = redoStack.pop();
  if (!entry) return '';
  undoStack.push(snapshot(entry.description));
  $project.set(entry.project);
  $selection.set(entry.selection);
  clampColliderSelection();
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
  clampColliderSelection();
}

// --- Placement mutators (each enrolled in undo, invariant I6) -------------------

/** Adds a placement of `pieceId` and selects it. Returns the new instance id. */
export function addPlacement(pieceId: string, transform?: Transform): string {
  pushUndo('Add piece');
  const instanceId = `${pieceId.replace(/^.*_Subpart_/, '').toLowerCase()}_${randomId().slice(0, 8)}`;
  clampActiveLayer();
  const placement: Placement = {
    instanceId,
    pieceId,
    transform: transform ?? identityTransform(),
    layerId: $activeLayerId.get(),
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

/**
 * Streaming BATCH transform write — ONE store update for a whole group drag
 * frame (a per-id loop would run the scene reconcile N times per frame).
 * Callers own the gesture, exactly like {@link setPlacementTransform}.
 */
export function setPlacementTransformsBatch(updates: ReadonlyMap<string, Transform>): void {
  if (updates.size === 0) return;
  mutateActive((o) => ({
    ...o,
    placements: o.placements.map((pl) => {
      const t = updates.get(pl.instanceId);
      return t ? { ...pl, transform: t } : pl;
    }),
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
  clampActiveLayer();
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

// --- Sites (plan P7.02) ---------------------------------------------------------

export function addSite(bodyId: string): string {
  pushUndo('Add site');
  const p = $project.get();
  const site: Site = {
    id: `site_${randomId().slice(0, 8)}`,
    landmarkId: `Site ${p.sites.length + 1}`,
    bodyId,
    latDeg: 0,
    lonDeg: 0,
    staticObjectId: $activeObject.get().id,
    decal: defaultDecal(),
  };
  $project.set({ ...p, sites: [...p.sites, site] });
  return site.id;
}

/** Discrete site field edit (callers begin a gesture for typing sessions). */
export function updateSite(siteId: string, patch: Partial<Omit<Site, 'id'>>): void {
  const p = $project.get();
  $project.set({
    ...p,
    sites: p.sites.map((s) => (s.id === siteId ? { ...s, ...patch } : s)),
  });
}

export function removeSite(siteId: string): void {
  pushUndo('Delete site');
  const p = $project.get();
  $project.set({ ...p, sites: p.sites.filter((s) => s.id !== siteId) });
}

// --- Layers (editor-only grouping; never exported) ------------------------------

export function addLayer(name: string): string {
  pushUndo('New layer');
  const layer: LayerDef = { id: `layer_${randomId().slice(0, 8)}`, name, visible: true };
  mutateActive((o) => ({ ...o, layers: [...o.layers, layer] }));
  $activeLayerId.set(layer.id);
  return layer.id;
}

export function renameLayer(layerId: string, name: string): void {
  pushUndo('Rename layer');
  mutateActive((o) => ({
    ...o,
    layers: o.layers.map((l) => (l.id === layerId ? { ...l, name } : l)),
  }));
}

/** Deletes a layer; its placements move to Default. The Default layer is permanent. */
export function removeLayer(layerId: string): void {
  if (layerId === DEFAULT_LAYER_ID) return;
  pushUndo('Delete layer');
  mutateActive((o) => ({
    ...o,
    layers: o.layers.filter((l) => l.id !== layerId),
    placements: o.placements.map((pl) =>
      pl.layerId === layerId ? { ...pl, layerId: DEFAULT_LAYER_ID } : pl,
    ),
  }));
  clampActiveLayer();
}

/** Visibility is view state — mutates the doc (it persists) but is NOT an undo step. */
export function setLayerVisible(layerId: string, visible: boolean): void {
  mutateActive((o) => ({
    ...o,
    layers: o.layers.map((l) => (l.id === layerId ? { ...l, visible } : l)),
  }));
  // A hidden layer's placements can no longer be selected.
  if (!visible) {
    const hidden = new Set(
      $activeObject
        .get()
        .placements.filter((pl) => pl.layerId === layerId)
        .map((pl) => pl.instanceId),
    );
    $selection.set($selection.get().filter((id) => !hidden.has(id)));
  }
}

/** Moves placements onto a layer (one undo step). */
export function setPlacementsLayer(instanceIds: readonly string[], layerId: string): void {
  if (instanceIds.length === 0) return;
  pushUndo('Move to layer');
  const ids = new Set(instanceIds);
  mutateActive((o) => ({
    ...o,
    placements: o.placements.map((pl) => (ids.has(pl.instanceId) ? { ...pl, layerId } : pl)),
  }));
}

/** Selects every placement on a visible, unlocked layer. */
export function selectAllVisible(): void {
  const obj = $activeObject.get();
  const usable = new Set(obj.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  $selection.set(obj.placements.filter((pl) => usable.has(pl.layerId)).map((pl) => pl.instanceId));
}

/** Lock = rendered but unpickable (view state, like visibility — not an undo step). */
export function setLayerLocked(layerId: string, locked: boolean): void {
  mutateActive((o) => ({
    ...o,
    layers: o.layers.map((l) => (l.id === layerId ? { ...l, locked } : l)),
  }));
  if (locked) {
    const affected = new Set(
      $activeObject
        .get()
        .placements.filter((pl) => pl.layerId === layerId)
        .map((pl) => pl.instanceId),
    );
    $selection.set($selection.get().filter((id) => !affected.has(id)));
  }
}

/** Isolate (solo) a layer: only it stays visible; a second call restores all. */
export function isolateLayer(layerId: string): void {
  const obj = $activeObject.get();
  const isIsolated =
    obj.layers.every((l) => (l.id === layerId ? l.visible : !l.visible)) && obj.layers.length > 1;
  mutateActive((o) => ({
    ...o,
    layers: o.layers.map((l) => ({ ...l, visible: isIsolated ? true : l.id === layerId })),
  }));
  if (!isIsolated) {
    const hidden = new Set(
      $activeObject
        .get()
        .placements.filter((pl) => pl.layerId !== layerId)
        .map((pl) => pl.instanceId),
    );
    $selection.set($selection.get().filter((id) => !hidden.has(id)));
  }
}

/** Selects every (visible-layer) placement of a layer. */
export function selectLayerContents(layerId: string): void {
  $selection.set(
    $activeObject
      .get()
      .placements.filter((pl) => pl.layerId === layerId)
      .map((pl) => pl.instanceId),
  );
}

// --- Stock-part import (plan follow-up: Parts as reusable primitives) -----------

export interface StockPartImportResult {
  imported: string[];
  /** SubPart template ids skipped because no piece exists for them (no mesh/material). */
  skippedTemplates: string[];
  /** Part-level colliders dropped (they have no piece to ride; see the import UI note). */
  droppedPartColliders: number;
  layerId: string;
}

/**
 * Imports a stock vessel `<Part>` as its individual SubPart placements (kept as
 * separate pieces, exactly like flexo renders a Part) into a NEW layer named
 * after the part or an existing one. One undo step; the copies are selected so
 * the multi-select gizmo can move the whole part as a unit.
 */
export function importStockPart(
  part: {
    id: string;
    placements: readonly {
      instanceId: string;
      subPartTemplateId: string;
      position: Transform['position'];
      rotation: Transform['rotation'];
      scale: Transform['scale'];
    }[];
  },
  target: { kind: 'new' } | { kind: 'existing'; layerId: string },
  pieceExists: (pieceId: string) => boolean,
  /**
   * The part's PART-level colliders, already LOCALIZED into the frame of the
   * first importable placement (see `three/partImport.ts` — the localization
   * needs quaternion math, which stays out of state/).
   */
  anchorColliders?: readonly import('../ksa/types').PartCollider[],
): StockPartImportResult {
  pushUndo('Import part');

  let layerId: string;
  if (target.kind === 'new') {
    // Short display name: "CoreFuelTankA_Prefab_LF1W1HA" → "LF1W1HA".
    const name = part.id.replace(/^.*_Prefab_/, '') || part.id;
    const layer: LayerDef = { id: `layer_${randomId().slice(0, 8)}`, name, visible: true };
    mutateActive((o) => ({ ...o, layers: [...o.layers, layer] }));
    layerId = layer.id;
  } else {
    layerId = target.layerId;
  }
  $activeLayerId.set(layerId);

  const copies: Placement[] = [];
  const skipped = new Set<string>();
  for (const pl of part.placements) {
    if (!pieceExists(pl.subPartTemplateId)) {
      skipped.add(pl.subPartTemplateId);
      continue;
    }
    copies.push({
      instanceId: `${pl.instanceId}_${randomId().slice(0, 8)}`,
      pieceId: pl.subPartTemplateId,
      transform: {
        position: { ...pl.position },
        rotation: { ...pl.rotation },
        scale: { ...pl.scale },
      },
      layerId,
    });
  }
  if (copies.length > 0 && anchorColliders && anchorColliders.length > 0) {
    copies[0].colliders = structuredClone(anchorColliders) as Placement['colliders'];
  }
  mutateActive((o) => ({ ...o, placements: [...o.placements, ...copies] }));
  $selection.set(copies.map((c) => c.instanceId));
  return {
    imported: copies.map((c) => c.instanceId),
    skippedTemplates: [...skipped],
    droppedPartColliders: copies.length === 0 && anchorColliders ? anchorColliders.length : 0,
    layerId,
  };
}

// --- Collider CRUD (plans: the collider-system follow-up) -----------------------

/** Unique collider id within the owner's list. */
function mintColliderId(existing: readonly PartCollider[], shape: string): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((c) => c.id));
  while (taken.has(`${shape}Collider${n}`)) n++;
  return `${shape}Collider${n}`;
}

/** Adds a collider to a placement (owner = instanceId) or the object (null); selects it. */
export function addColliderTo(
  owner: string | null,
  collider: Omit<PartCollider, 'id' | 'layerId' | 'ownerTemplateId'>,
): ColliderRef | null {
  const obj = $activeObject.get();
  const list =
    owner === null
      ? obj.objectColliders
      : (obj.placements.find((pl) => pl.instanceId === owner)?.colliders ?? []);
  if (owner !== null && !obj.placements.some((pl) => pl.instanceId === owner)) return null;
  pushUndo('Add collider');
  const full: PartCollider = {
    ...collider,
    id: mintColliderId(list, collider.shape),
    ownerTemplateId: null,
    layerId: DEFAULT_LAYER_ID,
  };
  mutateActive((o) =>
    owner === null
      ? { ...o, objectColliders: [...o.objectColliders, full] }
      : {
          ...o,
          placements: o.placements.map((pl) =>
            pl.instanceId === owner ? { ...pl, colliders: [...(pl.colliders ?? []), full] } : pl,
          ),
        },
  );
  const ref: ColliderRef = { owner, colliderId: full.id };
  $selection.set([]);
  $colliderSelection.set(ref);
  return ref;
}

/** Streaming collider edit (gizmo/typing) — callers own the gesture. */
export function updateCollider(ref: ColliderRef, patch: Partial<PartCollider>): void {
  const apply = (c: PartCollider) => (c.id === ref.colliderId ? { ...c, ...patch, id: c.id } : c);
  mutateActive((o) =>
    ref.owner === null
      ? { ...o, objectColliders: o.objectColliders.map(apply) }
      : {
          ...o,
          placements: o.placements.map((pl) =>
            pl.instanceId === ref.owner
              ? { ...pl, colliders: (pl.colliders ?? []).map(apply) }
              : pl,
          ),
        },
  );
}

export function removeCollider(ref: ColliderRef): void {
  pushUndo('Delete collider');
  mutateActive((o) =>
    ref.owner === null
      ? { ...o, objectColliders: o.objectColliders.filter((c) => c.id !== ref.colliderId) }
      : {
          ...o,
          placements: o.placements.map((pl) =>
            pl.instanceId === ref.owner
              ? { ...pl, colliders: (pl.colliders ?? []).filter((c) => c.id !== ref.colliderId) }
              : pl,
          ),
        },
  );
  if ($colliderSelection.get()?.colliderId === ref.colliderId) $colliderSelection.set(null);
}

export function duplicateColliderRef(ref: ColliderRef): void {
  const src = getCollider(ref);
  if (!src) return;
  addColliderTo(ref.owner, {
    shape: src.shape,
    position: { x: src.position.x + 0.5, y: src.position.y + 0.5, z: src.position.z },
    rotation: { ...src.rotation },
    scale: { ...src.scale },
  });
}
