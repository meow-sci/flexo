import { atom, computed } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';
import type {
  Battery,
  Combustor,
  Connector,
  ConnectorCapability,
  ConnectorFlag,
  ConsumerFeedWiring,
  CustomReaction,
  Decoupler,
  DeLavalNozzle,
  DockingPort,
  EditingPart,
  EulerXYZ,
  EvaDoor,
  FeedSource,
  Generator,
  KittenInstance,
  Gimbal,
  IvaSeat,
  KittenKind,
  Layer,
  LayerColor,
  LightType,
  ColliderShape,
  PartAnimation,
  PartCollider,
  PartGameData,
  PartLight,
  PlumbingClass,
  PowerConsumer,
  RawXmlNode,
  Rocket,
  RocketController,
  RocketControllerKind,
  SolarPanel,
  SolidGrainSegment,
  SolidMotor,
  SolidMotorNozzle,
  SubPartGameData,
  SubPartIdRef,
  SubPartPlacement,
  Tank,
  TankShape,
  Vec3,
} from '../ksa/types';
import {
  BUILT_IN_LAYER_IDS,
  COLLIDER_SHAPES,
  createCombustor,
  createEmptyPart,
  createGimbal,
  createNozzle,
  createPartLight,
  createPowerConsumer,
  createRocket,
  createRocketController,
  createSolarPanel,
  createSolidGrainSegment,
  createSolidMotor,
  createSolidMotorNozzle,
  createSubPartGameData,
  createTank,
  DEFAULT_LAYER_ID,
  ENTITY_ONLY_LAYER_IDS,
  isSubPartGameDataEmpty,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
  type LayerableKind,
  LIGHT_LAYER_ID,
} from '../ksa/types';
import { normalizeColliderSize } from '../ksa/colliderSize';
import { seatAxesFromRotation } from '../ksa/ivaSeatAxes';
import { remapRawConnectorRefs } from '../ksa/partXmlParser';
import { remapConsumerFeedWiring, remapConsumerFeeds } from '../ksa/idRemap';
import { unwiredConsumersOf } from './feedTargets';
import type { ReferenceContainer } from './containerStore';
import type { LineMeasurement } from './measurementStore';
import { mergeProjectImport } from './projectTransfer';
import type { ImportSummary, ProjectExportEnvelope } from './projectTransfer';
// layerStore imports back into this module (deselectLayer); both directions are
// function-scoped, so the cycle never runs at module-init time.
import { isLayerLocked, isLayerVisible } from './layerStore';

/**
 * Framework-agnostic editor state (nanostores). No React / three.js imports —
 * the three.js scene subscribes via `$part.subscribe(...)` and React reads via
 * `useStore($...)`. Actions are plain exported functions; `$part` is treated as
 * immutable (every mutation replaces it with a fresh object so subscribers fire).
 *
 * Mirrors space-tape's PartEditorController (undo/redo, selection, add/remove/
 * duplicate, transform updates).
 */

export type ToolMode = 'translate' | 'rotate' | 'scale';
export interface SnapSettings {
  translate?: number;
  rotateDeg?: number;
}

/**
 * The single world axis the arrow-key nudge tool moves along: ↑/↓ translate the
 * selection by ±step on this axis, ←/→ cycle which axis is active (see
 * src/three/nudgeSelection.ts). A persisted global tool preference (see {@link $nudgeAxis}).
 */
export type NudgeAxis = 'x' | 'y' | 'z';

export interface PlacementTransform {
  position: Vec3;
  rotation: EulerXYZ;
  scale: Vec3;
}

export const $part = atom<EditingPart>(createEmptyPart());

// ---------------------------------------------------------------------------
// THE SELECTION (design: plans/flexo_v2/design/design-build-mode.md §1.1)
//
// ONE ordered atom of stable {kind, id} refs. It replaced six per-kind INDEX
// arrays, whose positional nature made the selection alias a different entity
// after an undo (clamping an index that now names someone else) and forced every
// selection operation to be hand-expanded six ways. Ids already exist on every
// entity kind, so a ref survives splices, reorders and undo/redo untouched:
// "clamping" is now a filter that drops refs whose entity is gone.
//
// Selection is EPHEMERAL: never persisted, never an undo step, survives mode
// switches (foundation §2.4).
// ---------------------------------------------------------------------------

/** An entity kind that can be selected. (Renamed from `SelectableKind` — design §1.1.) */
export type EntityKind = 'subpart' | 'connector' | 'collider' | 'ivaSeat' | 'light' | 'kitten';

/**
 * @deprecated transitional alias for {@link EntityKind}, kept so v1 surfaces compile
 * unchanged. DELETE in P5A.17 with the last of them.
 */
export type SelectableKind = EntityKind;

/**
 * A stable reference to a selected entity: `id` is the instanceId (SubParts) or the
 * entity id (connector / collider / seat / light / kitten).
 */
export interface SelectionRef {
  kind: EntityKind;
  id: string;
}

/**
 * THE selection. Ordered — the LAST element is the primary (what a single-entity
 * inspector and the gizmo's single-attach branch resolve through).
 */
export const $selection = atom<readonly SelectionRef[]>([]);

/**
 * The order kinds are enumerated in whenever a selection is BUILT or flattened
 * (`selectedTransformRefs`, `selectLayerEntities`, `selectionOps`). Bulk transform math
 * pairs a snapshot with a write-back by position, so this order is load-bearing.
 */
export const KIND_ORDER: readonly EntityKind[] = [
  'subpart',
  'connector',
  'collider',
  'ivaSeat',
  'kitten',
  'light',
];

const refKey = (r: SelectionRef): string => `${r.kind}:${r.id}`;

/** The `$part` list holding `kind`, as read-only rows carrying the field every kind shares. */
function entityList(part: EditingPart, kind: EntityKind): readonly { layerId: string }[] {
  switch (kind) {
    case 'subpart':
      return part.placements;
    case 'connector':
      return part.connectors;
    case 'collider':
      return part.colliders;
    case 'ivaSeat':
      return part.ivaSeats;
    case 'light':
      return part.lights;
    case 'kitten':
      return part.kittens;
  }
}

/** Where the entity a ref names currently sits in its list, or -1 when it no longer exists. */
export function entityIndexOf(part: EditingPart, kind: EntityKind, id: string): number {
  switch (kind) {
    case 'subpart':
      return part.placements.findIndex((p) => p.instanceId === id);
    case 'connector':
      return part.connectors.findIndex((c) => c.id === id);
    case 'collider':
      return part.colliders.findIndex((c) => c.id === id);
    case 'ivaSeat':
      return part.ivaSeats.findIndex((s) => s.id === id);
    case 'light':
      return part.lights.findIndex((l) => l.id === id);
    case 'kitten':
      return part.kittens.findIndex((k) => k.id === id);
  }
}

/** The stable id of the entity at `index`, or null when the index is out of range. */
export function entityIdAt(part: EditingPart, kind: EntityKind, index: number): string | null {
  switch (kind) {
    case 'subpart':
      return part.placements[index]?.instanceId ?? null;
    case 'connector':
      return part.connectors[index]?.id ?? null;
    case 'collider':
      return part.colliders[index]?.id ?? null;
    case 'ivaSeat':
      return part.ivaSeats[index]?.id ?? null;
    case 'light':
      return part.lights[index]?.id ?? null;
    case 'kitten':
      return part.kittens[index]?.id ?? null;
  }
}

/** The layerId of the entity a ref names (`''` when the ref is dead). */
export function refLayerId(part: EditingPart, ref: SelectionRef): string {
  const index = entityIndexOf(part, ref.kind, ref.id);
  return index < 0 ? '' : entityList(part, ref.kind)[index].layerId;
}

/** A ref for the entity at `index`, or null when nothing is there. */
function refAt(part: EditingPart, kind: EntityKind, index: number): SelectionRef | null {
  const id = entityIdAt(part, kind, index);
  return id === null ? null : { kind, id };
}

function sameRefs(a: readonly SelectionRef[], b: readonly SelectionRef[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++)
    if (a[i].kind !== b[i].kind || a[i].id !== b[i].id) return false;
  return true;
}

/** Writes the selection, skipping the store update when nothing actually changed. */
function setSelectionRefs(next: readonly SelectionRef[]): void {
  if (!sameRefs($selection.get(), next)) $selection.set(next);
}

/**
 * Replaces (or additively extends) the selection. Deduped by `kind:id`, first occurrence
 * wins, and refs whose entity does not exist are silently dropped.
 */
export function select(refs: readonly SelectionRef[], opts?: { additive?: boolean }): void {
  const part = $part.get();
  const base = opts?.additive ? $selection.get() : [];
  const seen = new Set(base.map(refKey));
  const next: SelectionRef[] = [...base];
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    if (entityIndexOf(part, ref.kind, ref.id) < 0) continue;
    seen.add(key);
    next.push({ kind: ref.kind, id: ref.id });
  }
  setSelectionRefs(next);
}

/**
 * Adds or removes ONE ref, leaving the rest of the selection intact (the additive
 * viewport click). An appended ref becomes the primary (last).
 */
export function toggleRef(ref: SelectionRef): void {
  const key = refKey(ref);
  const current = $selection.get();
  if (current.some((r) => refKey(r) === key)) {
    setSelectionRefs(current.filter((r) => refKey(r) !== key));
    return;
  }
  if (entityIndexOf($part.get(), ref.kind, ref.id) < 0) return;
  setSelectionRefs([...current, { kind: ref.kind, id: ref.id }]);
}

/** Drops `refs` from the selection, leaving everything else (the subtractive marquee). */
export function deselectRefs(refs: readonly SelectionRef[]): void {
  if (refs.length === 0) return;
  const drop = new Set(refs.map(refKey));
  setSelectionRefs($selection.get().filter((r) => !drop.has(refKey(r))));
}

/**
 * The selection's refs of one kind, resolved to live indices in SELECTION order (dead refs
 * dropped). The bridge for the mutators that still splice/read `$part` positionally.
 */
function selectedIndicesOf(part: EditingPart, kind: EntityKind): number[] {
  const out: number[] = [];
  for (const ref of $selection.get()) {
    if (ref.kind !== kind) continue;
    const index = entityIndexOf(part, kind, ref.id);
    if (index >= 0) out.push(index);
  }
  return out;
}

// ── legacy per-kind INDEX views ──────────────────────────────────────────────
//
// The six atoms {@link $selection} replaced, re-expressed as derived views so the v1
// surfaces that still index into `$part` (AssetsList and friends) keep running
// unchanged. Every one of them is deleted with its last consumer in P5A.17.

const indicesOf = (kind: EntityKind) =>
  computed([$selection, $part], (sel, part) =>
    sel
      .flatMap((r) => (r.kind === kind ? [entityIndexOf(part, r.kind, r.id)] : []))
      .filter((i) => i >= 0),
  );
const primaryIndexOf = (view: ReturnType<typeof indicesOf>) =>
  computed(view, (indices) => (indices.length > 0 ? indices[indices.length - 1] : -1));

/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedIndices = indicesOf('subpart');
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedIndex = primaryIndexOf($selectedIndices);
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedConnectorIndices = indicesOf('connector');
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedConnectorIndex = primaryIndexOf($selectedConnectorIndices);
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedColliderIndices = indicesOf('collider');
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedColliderIndex = primaryIndexOf($selectedColliderIndices);
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedIvaSeatIndices = indicesOf('ivaSeat');
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedIvaSeatIndex = primaryIndexOf($selectedIvaSeatIndices);
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedKittenIndices = indicesOf('kitten');
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedKittenIndex = primaryIndexOf($selectedKittenIndices);
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedLightIndices = indicesOf('light');
/** @deprecated legacy index view — DELETE in P5A.17. */
export const $selectedLightIndex = primaryIndexOf($selectedLightIndices);

/**
 * Snapshots of copied entities (SubParts, connectors, kittens, colliders, IVA seats),
 * stored WITHOUT
 * their ids — paste regenerates fresh ids so copies never collide. Ephemeral
 * editor state like selection: NOT persisted and NOT part of undo history. An
 * in-app clipboard (not the OS clipboard) so paste reliably reconstructs entity
 * data without serialization/permission round-trips; copy/paste are still driven
 * by the platform shortcuts (⌘/Ctrl + C/V). Null when nothing has been copied.
 */
export interface PartClipboard {
  placements: SubPartPlacement[];
  connectors: Connector[];
  kittens: KittenInstance[];
  colliders: PartCollider[];
  ivaSeats: IvaSeat[];
}
export const $clipboard = atom<PartClipboard | null>(null);
/** True once something has been copied — drives enable/disable of paste affordances. */
export const $hasClipboard = computed($clipboard, (c) => c != null);
/**
 * The layer new SubParts/connectors are added to. Ephemeral UI state (like
 * selection) — NOT persisted and NOT in undo history. Always clamped to an
 * existing layer; falls back to {@link DEFAULT_LAYER_ID}.
 */
export const $activeLayerId = atom<string>(DEFAULT_LAYER_ID);
export const $toolMode = atom<ToolMode>('translate');
export const $snap = atom<SnapSettings>({});
// Nudge/rotate tool preferences. Global (not per-project) and persisted to
// localStorage so they survive reloads and apply across every project; cleared by
// "Reset Everything" (which wipes localStorage). React reads via `useStore`.
/** Active nudge axis. Default 'y' — the vertical/world-up axis. */
export const $nudgeAxis = persistentJSON<NudgeAxis>('flexo:nudgeAxis', 'y');
/** Distance (m) each arrow-key nudge moves the selection. Adjusted by ⇧← / ⇧→. */
export const $nudgeStep = persistentJSON<number>('flexo:nudgeStep', 0.1);
/** Degrees each rotate key (W/S, A/D, Q/E) turns the selection. Adjusted by [ / ]. */
export const $rotateStep = persistentJSON<number>('flexo:rotateStep', 45);
/**
 * Cyclic offset (0/1/2) applied to every rotate pair's base axis, advanced by the
 * R key. 0 = the default mapping (W/S=X, A/D=Y, Q/E=Z); see {@link rotatePairAxis}.
 */
export const $rotateAxisOffset = persistentJSON<number>('flexo:rotateAxisOffset', 0);
/**
 * How multi-select scale treats positions. 'smart' (default) scales the whole
 * group about its centroid so both sizes and inter-object gaps shrink/grow by the
 * same factor; 'inPlace' multiplies each item's own scale only, leaving positions
 * fixed (the legacy behavior). Drives both the numeric inspector and the 3D gizmo.
 */
export type BulkScaleMode = 'smart' | 'inPlace';
export const $bulkScaleMode = persistentJSON<BulkScaleMode>('flexo:bulkScaleMode', 'smart');
export const $canUndo = atom(false);
export const $canRedo = atom(false);
/** Description of the action that will be undone next (empty when nothing to undo). */
export const $undoDescription = atom<string>('');
/** Description of the action that will be redone next (empty when nothing to redo). */
export const $redoDescription = atom<string>('');

// ---------------------------------------------------------------------------
// Editor-aid store registration
//
// containerStore and measurementStore are separate from $part but must be
// snapshotted together with it for undo/redo. To avoid circular module
// imports, the actual atom accessors are registered by main.tsx at startup
// via registerEditorAidStores(). Until then, the stubs return/ignore empty
// arrays (which is safe — no undo is possible before the app boots).
// ---------------------------------------------------------------------------

let _getContainers: () => ReferenceContainer[] = () => [];
let _setContainers: (c: ReferenceContainer[]) => void = () => {};
let _getMeasurements: () => LineMeasurement[] = () => [];
let _setMeasurements: (m: LineMeasurement[]) => void = () => {};

/**
 * Wires containerStore and measurementStore into the undo/redo system. Call
 * ONCE at app startup (before any user interactions) in main.tsx. The setter
 * callbacks are responsible for clamping ephemeral state (active container /
 * active measurement) when those ids no longer exist after a restore.
 */
export function registerEditorAidStores(opts: {
  getContainers: () => ReferenceContainer[];
  setContainers: (c: ReferenceContainer[]) => void;
  getMeasurements: () => LineMeasurement[];
  setMeasurements: (m: LineMeasurement[]) => void;
}): void {
  _getContainers = opts.getContainers;
  _setContainers = opts.setContainers;
  _getMeasurements = opts.getMeasurements;
  _setMeasurements = opts.setMeasurements;
}

/** An entry in the undo or redo stack: the document snapshot plus a human-readable label. */
export interface HistoryEntry {
  part: EditingPart;
  containers: ReferenceContainer[];
  measurements: LineMeasurement[];
  description: string;
  /** Contextual detail, e.g. entity name, layer name. Empty string if none. */
  detail: string;
}

/**
 * One row in the history-list popover.
 * `stepsFromCurrent < 0` → undo that many steps; `> 0` → redo; `0` → current state.
 */
export interface HistoryListItem {
  description: string;
  detail: string;
  stepsFromCurrent: number;
}

/** All history entries ordered redo-first → current → undo-last, for the history popover. */
export const $historyList = atom<HistoryListItem[]>([]);

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
 *      removeSelected, duplicateSelected, applyActionChain, setConnectorFlags,
 *      setEditorTags.
 *
 *   2. Streaming mutation (many rapid updates that collapse into one undo step,
 *      e.g. a gizmo drag or a typing session): do NOT call `pushUndo()` here; the
 *      caller pushes once at interaction start (gizmo drag-start, field focus).
 *      Examples: updatePlacementTransform(s), updateConnectorTransform,
 *      updateSelectedTransform, and setPartId (focus-pushed by PartDataDialog).
 *
 * If you add a `$part` mutator and pick neither pattern, that change silently
 * bypasses undo — a bug. Keep docs/editor-state.md and AGENTS.md in sync.
 */
const MAX_UNDO = 50;
const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];

function clone(part: EditingPart): EditingPart {
  return structuredClone(part);
}

function refreshHistoryFlags(): void {
  $canUndo.set(undoStack.length > 0);
  $canRedo.set(redoStack.length > 0);
  $undoDescription.set(undoStack.at(-1)?.description ?? '');
  $redoDescription.set(redoStack.at(-1)?.description ?? '');
  const items: HistoryListItem[] = [];
  for (let i = 0; i < redoStack.length; i++) {
    items.push({
      description: redoStack[i].description,
      detail: redoStack[i].detail,
      stepsFromCurrent: redoStack.length - i,
    });
  }
  items.push({ description: '', detail: '', stepsFromCurrent: 0 });
  for (let i = undoStack.length - 1; i >= 0; i--) {
    items.push({
      description: undoStack[i].description,
      detail: undoStack[i].detail,
      stepsFromCurrent: -(undoStack.length - i),
    });
  }
  $historyList.set(items);
}

/**
 * Drops every selection ref whose entity no longer exists (after undo/redo, a delete, a
 * layer wipe). This is the WHOLE of what v1 called clamping: an id either resolves or it
 * doesn't, so a survivor is never silently re-pointed at a different entity the way a
 * clamped index was (census: selection-transform pain 14).
 */
function clampSelection(): void {
  const part = $part.get();
  const current = $selection.get();
  const kept = current.filter((r) => entityIndexOf(part, r.kind, r.id) >= 0);
  if (kept.length !== current.length) $selection.set(kept);
}

/** Resets the active layer to Default if it no longer exists (e.g. after undo). */
function clampActiveLayer(): void {
  const part = $part.get();
  if (!part.layers.some((l) => l.id === $activeLayerId.get())) {
    $activeLayerId.set(DEFAULT_LAYER_ID);
  }
}

/** The active layer id, clamped to a layer that exists in `part`. */
function currentLayerId(part: EditingPart): string {
  const active = $activeLayerId.get();
  return part.layers.some((l) => l.id === active) ? active : DEFAULT_LAYER_ID;
}

/** Snapshot current state onto the undo stack before a mutation. `description` labels the action; `detail` adds context (entity name, layer, etc.). */
export function pushUndo(description: string, detail: string = ''): void {
  undoStack.push({
    part: clone($part.get()),
    containers: structuredClone(_getContainers()),
    measurements: structuredClone(_getMeasurements()),
    description,
    detail,
  });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  refreshHistoryFlags();
}

/** Undoes the last action. Returns a formatted label (e.g. "move · thruster_1_1") for toast display. */
export function undo(): string {
  const entry = undoStack.pop();
  if (!entry) return '';
  redoStack.push({
    part: clone($part.get()),
    containers: structuredClone(_getContainers()),
    measurements: structuredClone(_getMeasurements()),
    description: entry.description,
    detail: entry.detail,
  });
  $part.set(entry.part);
  _setContainers(entry.containers);
  _setMeasurements(entry.measurements);
  clampSelection();
  clampActiveLayer();
  refreshHistoryFlags();
  return entry.detail ? `${entry.description} · ${entry.detail}` : entry.description;
}

/** Redoes the next action. Returns a formatted label (e.g. "add part · bolt_2") for toast display. */
export function redo(): string {
  const entry = redoStack.pop();
  if (!entry) return '';
  undoStack.push({
    part: clone($part.get()),
    containers: structuredClone(_getContainers()),
    measurements: structuredClone(_getMeasurements()),
    description: entry.description,
    detail: entry.detail,
  });
  $part.set(entry.part);
  _setContainers(entry.containers);
  _setMeasurements(entry.measurements);
  clampSelection();
  clampActiveLayer();
  refreshHistoryFlags();
  return entry.detail ? `${entry.description} · ${entry.detail}` : entry.description;
}

/** A serializable snapshot of the undo/redo stacks (newest-last), for project persistence. */
export interface HistorySnapshot {
  undo: Array<{
    part: EditingPart;
    containers?: ReferenceContainer[];
    measurements?: LineMeasurement[];
    description: string;
    detail: string;
  }>;
  redo: Array<{
    part: EditingPart;
    containers?: ReferenceContainer[];
    measurements?: LineMeasurement[];
    description: string;
    detail: string;
  }>;
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
  };
}

/**
 * Replaces the undo/redo stacks with deep copies of `snapshot` (used when a project
 * is loaded). Does NOT touch `$part` — the caller sets the document separately; this
 * only restores the history that goes with it. Refreshes the can-undo/redo flags.
 * Handles legacy saves where entries were plain EditingPart or lacked detail/description.
 */
export function importHistory(snapshot: HistorySnapshot): void {
  undoStack.length = 0;
  redoStack.length = 0;
  for (const raw of snapshot.undo as unknown[]) {
    const e = raw as {
      part?: EditingPart;
      containers?: ReferenceContainer[];
      measurements?: LineMeasurement[];
      description?: string;
      detail?: string;
    } & EditingPart;
    undoStack.push({
      part: clone(e.part ?? (e as EditingPart)),
      containers: structuredClone(e.containers ?? []),
      measurements: structuredClone(e.measurements ?? []),
      description: e.description ?? 'edit',
      detail: e.detail ?? '',
    });
  }
  for (const raw of snapshot.redo as unknown[]) {
    const e = raw as {
      part?: EditingPart;
      containers?: ReferenceContainer[];
      measurements?: LineMeasurement[];
      description?: string;
      detail?: string;
    } & EditingPart;
    redoStack.push({
      part: clone(e.part ?? (e as EditingPart)),
      containers: structuredClone(e.containers ?? []),
      measurements: structuredClone(e.measurements ?? []),
      description: e.description ?? 'edit',
      detail: e.detail ?? '',
    });
  }
  if (undoStack.length > MAX_UNDO) undoStack.splice(0, undoStack.length - MAX_UNDO);
  refreshHistoryFlags();
}

/**
 * Jumps to a specific point in history by applying N undo or redo steps.
 * Negative `steps` = undo that many times; positive = redo. Returns the
 * description of the last step applied (empty if no steps taken).
 */
export function jumpToHistory(steps: number): string {
  if (steps === 0) return '';
  let last = '';
  if (steps < 0) {
    for (let i = 0; i < -steps; i++) last = undo();
  } else {
    for (let i = 0; i < steps; i++) last = redo();
  }
  return last;
}

function lastSegmentLower(templateId: string): string {
  const seg = templateId.split('.').pop() ?? templateId;
  return seg.toLowerCase();
}

/** Adds a SubPart from the catalog at the origin and selects it. */
export function addSubPart(templateId: string): void {
  const current = $part.get();
  const base = lastSegmentLower(templateId);
  const count = current.placements.filter((p) => p.subPartTemplateId === templateId).length;
  const instanceId = `${base}_${count + 1}`;
  pushUndo('add part', instanceId);
  const part = clone(current);
  part.placements.push({
    instanceId,
    subPartTemplateId: templateId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: currentLayerId(part),
  });
  $part.set(part);
  select([{ kind: 'subpart', id: instanceId }]);
}

/** GameData carried into {@link addPart} from a built-in Part so its imports keep it. */
export interface ImportedGameData {
  /** Connector-bound coupling bindings (connectorIds in the source's original id space). */
  decoupler: Decoupler | null;
  dockingPort: DockingPort | null;
  evaDoor: EvaDoor | null;
  /** Part diameter (<Diameter M/>) and command marker (<Control/>) carried in on import. */
  diameterM: number | null;
  /** Extra `<Diameter M/>` size classes (adapter prefabs) carried in on import. */
  extraDiametersM: number[];
  controllable: boolean;
  /** Part-level `<CustomMass>` mass override (Kg) + its preserved unmodeled children (inertia). */
  customMass: number | null;
  customMassExtras: RawXmlNode[];
  /** Unmodeled `<PartGameData>` attrs + child elements, preserved verbatim on import. */
  unknownAttrs: Record<string, string>;
  unknownChildren: RawXmlNode[];
  /** Part-level power modules — appended to the project's part (a Part may carry several). */
  batteries: Battery[];
  generators: Generator[];
  solarPanels: SolarPanel[];
  /** The part's single power consumer / light switch, or null (KSA has one switch slot). */
  powerConsumer: PowerConsumer | null;
  /** Per-SubPart-template data (tanks / solar panels / engine modules) for the imported SubParts. */
  subPartGameData: SubPartGameData[];
  /** Part-level engine modules (controllers/rockets/combustors/nozzles/gimbals); instance refs in the source id space. */
  rocketControllers: RocketController[];
  rockets: Rocket[];
  combustors: Combustor[];
  nozzles: DeLavalNozzle[];
  gimbals: Gimbal[];
  /** Part-level `<Tank>` containers carried in on import. */
  tanks: Tank[];
  /** Part-level solid-motor hardware; `<FeedsFrom>` refs in the source id space. */
  solidMotors: SolidMotor[];
  solidNozzles: SolidMotorNozzle[];
  solidGrainSegments: SolidGrainSegment[];
  /** `<ConsumerFeedWiring>`; SubPart + connector refs in the source id space. */
  consumerFeedWiring: ConsumerFeedWiring[];
  /**
   * The source Part's collision volume, from every authoring site it uses (geometry
   * `<Part>`, `<PartGameData>`, and the `<SubPartGameData>` of the templates it places).
   * `ownerTemplateId` names a SubPart TEMPLATE, which import never renames, so unlike the
   * module refs above these need no remapping — only fresh document ids.
   */
  colliders: PartCollider[];
  /**
   * The source Part's `<IVASeat>`s, from both Part-level authoring sites (geometry `<Part>`
   * and `<PartGameData>`), already merged in document order. Ids are REGENERATED on import
   * and never emitted (flexo authors no `<IVASeat Id>`), so unlike the module refs above no
   * `idRemap` entry is needed — nothing can reference a seat.
   *
   * ORDER IS LOAD-BEARING and preserved verbatim: it is KSA's seat cycle order (the first
   * seat is the one IVA opens on, `C` walks the rest — see plans/IVA_PLAN.md §1.4).
   */
  ivaSeats: IvaSeat[];
  /**
   * The source Part's cast lights, from both GameData authoring sites (`<PartGameData>` ⇒
   * `ownerTemplateId: null`, `<SubPartGameData>` ⇒ that template id). Like colliders,
   * `ownerTemplateId` names a SubPart TEMPLATE, which import never renames — so no
   * remapping, only fresh document ids.
   */
  lights: PartLight[];
}

/** Remaps a module→SubPart-instance reference through the import id map (null ⇒ root part, unchanged). */
function remapSubPartRef(ref: SubPartIdRef, idMap: ReadonlyMap<string, string>): SubPartIdRef {
  if (!ref.subPartInstanceId) return { id: ref.id, subPartInstanceId: ref.subPartInstanceId };
  return {
    id: ref.id,
    subPartInstanceId: idMap.get(ref.subPartInstanceId) ?? ref.subPartInstanceId,
  };
}

/**
 * Remaps every id-bearing reference on an imported `SubPartGameData`: its rockets'
 * SubPart refs and its consumers' feed points. A SubPart-level consumer normally
 * declares `{ kind: 'parent' }` (which needs no remap), but a container/connector feed
 * points into the placing Part's id space and does.
 */
function remapSubPartGameData(
  spd: SubPartGameData,
  connectorIdMap: ReadonlyMap<string, string>,
  idMap: ReadonlyMap<string, string>,
): SubPartGameData {
  return {
    ...spd,
    rockets: spd.rockets.map((r) => remapRocket(r, idMap)),
    combustors: spd.combustors.map((c) => remapConsumerFeeds(c, connectorIdMap, idMap)),
    solidMotors: spd.solidMotors.map((m) => remapConsumerFeeds(m, connectorIdMap, idMap)),
  };
}

/** Remaps a rocket's core + nozzle SubPart-instance references through the import id map. */
function remapRocket(rocket: Rocket, idMap: ReadonlyMap<string, string>): Rocket {
  return {
    id: rocket.id,
    core: remapSubPartRef(rocket.core, idMap),
    nozzles: rocket.nozzles.map((n) => remapSubPartRef(n, idMap)),
  };
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
  idMap: ReadonlyMap<string, string>,
  /** Layer the import's geometry landed on — colliders follow it (seats/lights are pinned). */
  layerId: string,
): void {
  const game = target.gameData;
  if (game.decoupler == null && src.decoupler) {
    const id = connectorIdMap.get(src.decoupler.connectorId);
    if (id) game.decoupler = { ...src.decoupler, connectorId: id };
  }
  if (game.dockingPort == null && src.dockingPort) {
    const id = connectorIdMap.get(src.dockingPort.connectorId);
    if (id) game.dockingPort = { ...src.dockingPort, connectorId: id };
  }
  if (game.evaDoor == null && src.evaDoor) {
    const id = connectorIdMap.get(src.evaDoor.connectorId);
    if (id) game.evaDoor = { connectorId: id };
  }
  // Part diameter + command marker: filled only when not already set. The extra
  // adapter size classes ride along with the primary (they're meaningless without it).
  if (game.diameterM == null && src.diameterM != null) {
    game.diameterM = src.diameterM;
    game.extraDiametersM = src.extraDiametersM;
  }
  if (!game.controllable && src.controllable) game.controllable = true;
  // Custom mass: filled only when not already set; the preserved extras (inertia) ride along.
  if (game.customMass == null && src.customMass != null) {
    game.customMass = src.customMass;
    game.customMassExtras = src.customMassExtras;
  }
  // Unmodeled passthrough: fill only when the target has none (first import's leftover XML wins).
  // Connector refs inside the raw XML (<Aligned>/<SymmetryGroup> <ConnectorRef>s) are in the
  // source's original id space — rewrite them onto the regenerated connector ids.
  if (Object.keys(game.unknownAttrs).length === 0 && Object.keys(src.unknownAttrs).length > 0)
    game.unknownAttrs = src.unknownAttrs;
  if (game.unknownChildren.length === 0 && src.unknownChildren.length > 0)
    game.unknownChildren = remapRawConnectorRefs(src.unknownChildren, connectorIdMap);
  game.batteries.push(...src.batteries);
  game.generators.push(...src.generators);
  game.solarPanels.push(...src.solarPanels);
  // Single consumer per part: keep the target's, adopt the source's only when empty.
  if (!game.powerConsumer && src.powerConsumer) game.powerConsumer = src.powerConsumer;
  for (const spd of src.subPartGameData) {
    if (!target.subPartGameData.some((s) => s.subPartTemplateId === spd.subPartTemplateId)) {
      // Per-subpart rockets + consumer feeds can reference sibling instances / the
      // placing part's connectors — remap those refs too.
      target.subPartGameData.push(remapSubPartGameData(spd, connectorIdMap, idMap));
    }
  }
  // Engine modules are lists: append, remapping every SubPart-instance reference from
  // the source id space onto the freshly-generated instance ids (the bug-prone bit).
  game.rocketControllers.push(
    ...src.rocketControllers.map((c) => ({
      ...c,
      rocketRefs: c.rocketRefs.map((r) => remapSubPartRef(r, idMap)),
    })),
  );
  game.rockets.push(...src.rockets.map((r) => remapRocket(r, idMap)));
  game.combustors.push(...src.combustors.map((c) => remapConsumerFeeds(c, connectorIdMap, idMap)));
  game.nozzles.push(...src.nozzles);
  game.gimbals.push(
    ...src.gimbals.map((gimbal) => ({
      ...gimbal,
      subPartInstanceId: idMap.get(gimbal.subPartInstanceId) ?? gimbal.subPartInstanceId,
    })),
  );
  // Plumbing topology: tanks are plain containers, but solid motors carry feed points
  // and the wiring entries carry both a placement scope and feed points.
  game.tanks.push(...src.tanks);
  game.solidMotors.push(
    ...src.solidMotors.map((m) => remapConsumerFeeds(m, connectorIdMap, idMap)),
  );
  game.solidNozzles.push(...src.solidNozzles);
  game.solidGrainSegments.push(...src.solidGrainSegments);
  game.consumerFeedWiring.push(
    ...src.consumerFeedWiring.map((w) => remapConsumerFeedWiring(w, connectorIdMap, idMap)),
  );
  // Colliders are a top-level list, not GameData: append with fresh ids on the SAME layer
  // the import's SubParts landed on (a collider belongs with the geometry it wraps).
  // Nothing references a collider by id, so no map is threaded out.
  for (const c of src.colliders) {
    target.colliders.push({
      ...structuredClone(c),
      id: nextColliderId(target),
      layerId,
    });
  }
  // Seats are a top-level list too: append with fresh ids on the built-in IVA Seats layer,
  // IN ORDER and AFTER any seats already in the document — order is KSA's seat cycle order.
  // Nothing references a seat by id (flexo emits none), so no map is threaded out.
  for (const s of src.ivaSeats) {
    target.ivaSeats.push({
      ...structuredClone(s),
      id: nextIvaSeatId(target),
      layerId: IVA_SEAT_LAYER_ID,
    });
  }
  // Lights are a top-level list too: append with fresh ids on the built-in Lights layer.
  // Nothing references a light by id (flexo emits none), so no map is threaded out. Scale is
  // re-pinned (1,1,1) — KSA ignores light scale and the model invariant is "always pinned",
  // so a hand-edited payload can't smuggle one in.
  for (const l of src.lights) {
    target.lights.push({
      ...structuredClone(l),
      id: nextLightId(target),
      layerId: LIGHT_LAYER_ID,
      scale: { x: 1, y: 1, z: 1 },
    });
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
 * `targetLayerId` when given (and it exists), else the active layer; the Part's
 * connectors and colliders land on that SAME layer, so one import is one logical
 * group (layers are editor-only and absent from KSA XML). Everything the import added
 * is left selected — SubParts, connectors, colliders, IVA seats and lights — so the
 * fresh Part can be moved as a unit.
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
  if (placements.length === 0 && connectors.length === 0) return DEFAULT_LAYER_ID;
  const importDetail =
    placements.length > 0 && connectors.length === 0
      ? placements.length === 1
        ? lastSegmentLower(placements[0].subPartTemplateId)
        : `${placements.length} parts`
      : connectors.length > 0 && placements.length === 0
        ? `${connectors.length} connector${connectors.length > 1 ? 's' : ''}`
        : `${placements.length} parts, ${connectors.length} connectors`;
  pushUndo('import', importDetail);
  const part = clone($part.get());
  // An import always lands on an ORDINARY layer: a pinned one (seats/lights/kittens)
  // holds its own kind exclusively, so a caller naming one falls back to the active layer.
  const layerId =
    targetLayerId && isMoveTarget(part, targetLayerId) ? targetLayerId : currentLayerId(part);
  for (const tag of editorTags) {
    if (!part.editorTags.includes(tag)) part.editorTags.push(tag);
  }
  const importedSubIds: string[] = [];
  // Original KSA instance id → regenerated id, so imported animations can rewire their
  // joint members / solar-tracking refs (which target SubParts by their original id).
  const idMap = new Map<string, string>();
  for (const src of placements) {
    const base = lastSegmentLower(src.subPartTemplateId);
    const count = part.placements.filter(
      (p) => p.subPartTemplateId === src.subPartTemplateId,
    ).length;
    const instanceId = `${base}_${count + 1}`;
    idMap.set(src.instanceId, instanceId);
    part.placements.push({
      instanceId,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId,
    });
    importedSubIds.push(instanceId);
  }
  if (buildAnimations) part.animations.push(...buildAnimations(idMap));
  // Original KSA connector id → regenerated id, so imported coupling bindings
  // (which target connectors by their original id) can be rewired.
  const connectorStart = part.connectors.length;
  const connectorIdMap = new Map<string, string>();
  for (const src of connectors) {
    const id = nextConnectorId(part); // regenerated against the growing list
    connectorIdMap.set(src.id, id);
    part.connectors.push({
      id,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      flags: [...src.flags],
      capabilities: [...src.capabilities],
      siblingIds: [...src.siblingIds],
      layerId, // with the SubParts they attach to
    });
  }
  // Sibling refs point at other connectors by their original id — rewire to the
  // regenerated ids, dropping any that point outside the imported set.
  for (let i = connectorStart; i < part.connectors.length; i++) {
    part.connectors[i].siblingIds = part.connectors[i].siblingIds
      .map((s) => connectorIdMap.get(s))
      .filter((s): s is string => s != null);
  }
  const colliderStart = part.colliders.length;
  const seatStart = part.ivaSeats.length;
  const lightStart = part.lights.length;
  if (imported) applyImportedGameData(part, imported, connectorIdMap, idMap, layerId);
  $part.set(part);
  // Select exactly what this import added — SubParts AND its connectors / colliders /
  // IVA seats / lights (each kind is appended, so the imported ones are the tail past
  // the pre-import length). Selecting every kind is what lets a "move the part I just
  // imported" drag carry its colliders and connectors along instead of stranding them.
  // Pre-existing entities on the same layers are deliberately left out. Entity kinds
  // whose layer is hidden or locked are skipped, matching the select-all rule in
  // AssetsList (and keeping the "locked ⇒ never selected" invariant of setLayerLocked).
  const selectable = (id: string): boolean => isLayerVisible(id) && !isLayerLocked(id);
  const importedOnLayer = selectable(layerId);
  const refs: SelectionRef[] = importedSubIds.map((id) => ({ kind: 'subpart', id }));
  const tailRefs = (kind: EntityKind, from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      const ref = refAt(part, kind, i);
      if (ref) refs.push(ref);
    }
  };
  if (importedOnLayer) {
    tailRefs('connector', connectorStart, part.connectors.length);
    tailRefs('collider', colliderStart, part.colliders.length);
  }
  if (selectable(IVA_SEAT_LAYER_ID)) tailRefs('ivaSeat', seatStart, part.ivaSeats.length);
  if (selectable(LIGHT_LAYER_ID)) tailRefs('light', lightStart, part.lights.length);
  select(refs);
  return layerId;
}

/**
 * Additively imports a project-export envelope (see src/state/projectTransfer.ts) into
 * the current workspace in one undo step: meshes/connectors/kittens/animations/GameData
 * are appended with collision-free ids and all cross-references remapped. Imported
 * meshes land on freshly-created layers mirroring the source's (so the existing Default
 * is untouched); the first new layer becomes active so the user lands on the import.
 */
export function importProjectData(env: ProjectExportEnvelope): ImportSummary {
  const { part, summary, newLayerIds } = mergeProjectImport($part.get(), env);
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
      .join(', ') || 'nothing';
  pushUndo('import project', detail);
  $part.set(part);
  // New layers aren't in $layerView (which defaults to visible), so no reveal needed.
  if (newLayerIds.length > 0) $activeLayerId.set(newLayerIds[0]);
  return summary;
}

/** Adds a connector at the origin (facing local +X), on the active layer, and selects it. */
export function addConnector(): void {
  const current = $part.get();
  const newId = nextConnectorId(current);
  pushUndo('add connector', newId);
  const part = clone(current);
  part.connectors.push({
    id: newId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    flags: [],
    capabilities: [],
    siblingIds: [],
    layerId: currentLayerId(part),
  });
  $part.set(part);
  select([{ kind: 'connector', id: newId }]);
}

/**
 * Adds a collision primitive at the origin (on the active layer) and selects it.
 *
 * `transform` seeds position/rotation/size — the fitting tools pass a fitted one; without it
 * the collider starts as a 1 m unit shape at the Part origin. `ownerTemplateId` names the
 * SubPart template that owns it (`null` ⇒ part-level; see {@link PartCollider}).
 */
export function addCollider(
  shape: ColliderShape,
  transform?: PlacementTransform,
  ownerTemplateId: string | null = null,
): void {
  const current = $part.get();
  const newId = nextColliderId(current);
  pushUndo('add collider', `${shape.toLowerCase()} ${newId}`);
  const part = clone(current);
  part.colliders.push({
    id: newId,
    shape,
    ownerTemplateId,
    position: transform ? { ...transform.position } : { x: 0, y: 0, z: 0 },
    rotation: transform ? { ...transform.rotation } : { x: 0, y: 0, z: 0 },
    scale: normalizeColliderSize(shape, transform?.scale ?? { x: 1, y: 1, z: 1 }),
    layerId: currentLayerId(part),
  });
  $part.set(part);
  select([{ kind: 'collider', id: newId }]);
}

/**
 * Changes a collider's primitive shape, re-snapping its size onto the new shape's degrees
 * of freedom (e.g. Box 2×3×1 → Cylinder becomes diameter 2, height 3). Discrete → undo.
 */
export function setColliderShape(index: number, shape: ColliderShape): void {
  const current = $part.get();
  const c = current.colliders[index];
  if (!c || c.shape === shape || !COLLIDER_SHAPES.includes(shape)) return;
  pushUndo('collider shape', `${c.id} → ${shape}`);
  const part = clone(current);
  part.colliders[index].shape = shape;
  part.colliders[index].scale = normalizeColliderSize(shape, c.scale);
  $part.set(part);
}

/**
 * Re-homes a collider onto another owner, CONVERTING its transform through `frame` so it
 * doesn't visually jump. `frame` is the placement whose local space the collider is moving
 * into or out of (the caller resolves it — see EditorScene); pass null for a pure
 * part-level ↔ part-level no-op frame. Discrete → undo.
 */
export function setColliderOwner(
  index: number,
  ownerTemplateId: string | null,
  converted?: PlacementTransform,
): void {
  const current = $part.get();
  const c = current.colliders[index];
  if (!c || c.ownerTemplateId === ownerTemplateId) return;
  pushUndo('collider owner', `${c.id} → ${ownerTemplateId ?? 'Part'}`);
  const part = clone(current);
  const next = part.colliders[index];
  next.ownerTemplateId = ownerTemplateId;
  if (converted) {
    next.position = { ...converted.position };
    next.rotation = { ...converted.rotation };
    next.scale = normalizeColliderSize(next.shape, converted.scale);
  }
  $part.set(part);
}

/**
 * Sets a collider's outer size in meters (the numeric inspector fields). Streaming
 * mutation — the caller pushes undo once at field focus. Always normalized, so typing
 * a cylinder's X never leaves Z stale.
 */
export function setColliderSize(index: number, size: Vec3): void {
  const current = $part.get();
  const c = current.colliders[index];
  if (!c) return;
  const part = clone(current);
  part.colliders[index].scale = normalizeColliderSize(c.shape, size);
  $part.set(part);
}

/** Like {@link updatePlacementTransform} but for a collider (size-normalized). No undo. */
export function updateColliderTransform(index: number, t: PlacementTransform): void {
  const current = $part.get();
  if (index < 0 || index >= current.colliders.length) return;
  const part = clone(current);
  assignCollider(part.colliders[index], t);
  $part.set(part);
}

/**
 * Applies several collider transforms in one store update (bulk gizmo drag). No undo —
 * the caller pushes once at interaction start.
 */
export function updateColliderTransforms(
  updates: readonly { index: number; transform: PlacementTransform }[],
): void {
  if (updates.length === 0) return;
  const part = clone($part.get());
  for (const { index, transform } of updates) assignCollider(part.colliders[index], transform);
  $part.set(part);
}

/** Removes a single collider by index (per-row context menu). Discrete → undo. */
export function removeCollider(index: number): void {
  const current = $part.get();
  if (index < 0 || index >= current.colliders.length) return;
  pushUndo('delete collider', current.colliders[index].id);
  const part = clone(current);
  part.colliders.splice(index, 1);
  $part.set(part);
  clampSelection(); // id refs survive the splice; only the removed one has to go
}

// ── IVA seats ────────────────────────────────────────────────────────────────
//
// A seat is a placed, oriented entity like a collider, so it gets the same shape of
// machinery. The one thing it does NOT have is a size: KSA's `<IVASeat>` is three
// vectors (position + forward/up), so `scale` is a permanently-unused slot pinned to
// (1,1,1) by {@link assignIvaSeat}. ORDER IS LOAD-BEARING — see {@link moveIvaSeat}.

/**
 * Adds an IVA camera vantage point (on the built-in IVA Seats layer) and selects it.
 *
 * `transform` seeds position + rotation; without it the seat starts un-rotated at the Part
 * origin, which is KSA's own schema default (forward +X, up −Z). `scale` is ignored: a seat
 * has no size (see {@link assignIvaSeat}). The new seat lands LAST, i.e. last in the IVA
 * cycle order. Discrete → undo.
 */
export function addIvaSeat(transform?: PlacementTransform): void {
  const current = $part.get();
  const newId = nextIvaSeatId(current);
  pushUndo('add IVA seat', newId);
  const part = clone(current);
  part.ivaSeats.push({
    id: newId,
    position: transform ? { ...transform.position } : { x: 0, y: 0, z: 0 },
    rotation: transform ? { ...transform.rotation } : { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: IVA_SEAT_LAYER_ID,
  });
  $part.set(part);
  select([{ kind: 'ivaSeat', id: newId }]);
}

/** Like {@link updatePlacementTransform} but for an IVA seat (scale pinned). No undo. */
export function updateIvaSeatTransform(index: number, t: PlacementTransform): void {
  const current = $part.get();
  if (index < 0 || index >= current.ivaSeats.length) return;
  const part = clone(current);
  assignIvaSeat(part.ivaSeats[index], t);
  $part.set(part);
}

/**
 * Applies several seat transforms in one store update (bulk gizmo drag). No undo —
 * the caller pushes once at interaction start.
 */
export function updateIvaSeatTransforms(
  updates: readonly { index: number; transform: PlacementTransform }[],
): void {
  if (updates.length === 0) return;
  const part = clone($part.get());
  for (const { index, transform } of updates) assignIvaSeat(part.ivaSeats[index], transform);
  $part.set(part);
}

/**
 * Points a seat's gaze by writing its rotation outright — what the inspector's aim presets
 * and "Aim at selection" produce (both go through `seatRotationFromAxes`). Position is left
 * alone. One gesture, one undo step → discrete.
 */
export function aimIvaSeat(index: number, rotation: EulerXYZ): void {
  const current = $part.get();
  const seat = current.ivaSeats[index];
  if (!seat) return;
  pushUndo('aim IVA seat', seat.id);
  const part = clone(current);
  part.ivaSeats[index].rotation = { ...rotation };
  $part.set(part);
}

/**
 * Reorders a seat by `delta` places (−1 = earlier, +1 = later), clamped to the ends.
 *
 * THIS IS THE KSA SEAT CYCLE ORDER, not cosmetics: the vehicle's IVA camera opens on the
 * first seat and `C` walks the rest in document order, which is the order flexo emits
 * `<IVASeat>` in. Discrete → one undo step. The moved seat stays selected.
 */
export function moveIvaSeat(index: number, delta: number): void {
  const current = $part.get();
  const seat = current.ivaSeats[index];
  if (!seat) return;
  const target = Math.min(current.ivaSeats.length - 1, Math.max(0, index + delta));
  if (target === index) return;
  pushUndo('reorder IVA seat', `${seat.id} → ${target + 1}`);
  const part = clone(current);
  const [moved] = part.ivaSeats.splice(index, 1);
  part.ivaSeats.splice(target, 0, moved);
  $part.set(part);
  // No selection fix-up: seat ids are stable across a reorder, so the refs already
  // point at the same seats (the v1 index remap died with the index model).
}

/** Removes a single IVA seat by index (per-row context menu). Discrete → undo. */
export function removeIvaSeat(index: number): void {
  const current = $part.get();
  if (index < 0 || index >= current.ivaSeats.length) return;
  pushUndo('delete IVA seat', current.ivaSeats[index].id);
  const part = clone(current);
  part.ivaSeats.splice(index, 1);
  $part.set(part);
  clampSelection(); // id refs survive the splice; only the removed one has to go
}

/** Adds a kitten visual aide at the origin (on the built-in Kittens layer) and selects it. */
export function addKitten(kind: KittenKind): void {
  const current = $part.get();
  const newId = nextKittenId(current);
  pushUndo('add kitten', kind);
  const part = clone(current);
  part.kittens.push({
    id: newId,
    kind,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: KITTEN_LAYER_ID,
  });
  $part.set(part);
  select([{ kind: 'kitten', id: newId }]);
}

/**
 * A kitten stands upright, so it is placed with a pure YAW — the heading of `forward`
 * projected onto the horizontal (XZ) plane. Tilting it to follow a pitched seat would put
 * a crew member on their back and tell you nothing about head clearance.
 *
 * The model faces its local **−Z** (KSA's own `Forward`, and the basis flexo shares with
 * it — see src/three/coords.ts), so a yaw `θ` about +Y sends it to `(−sinθ, 0, −cosθ)`;
 * matching that to `forward` gives `θ = atan2(−fx, −fz)`. A seat looking straight up or
 * down has no heading at all — keep the default facing rather than snapping to an
 * arbitrary one.
 */
function kittenYawFacing(forward: Vec3): number {
  if (Math.hypot(forward.x, forward.z) < 1e-9) return 0;
  return Math.atan2(-forward.x, -forward.z);
}

/**
 * Places a kitten visual aide AT an IVA seat, facing where the seat looks, so eye height
 * and head clearance can be eyeballed against a real crew member.
 *
 * The kitten is a flexo-only aide and is never exported; this only borrows the seat's
 * pose. Its origin is its FEET, not its eye point, so the placement is a starting point to
 * nudge from — the inspector says so.
 */
export function addKittenAtSeat(seatIndex: number, kind: KittenKind = 'hunter'): void {
  const current = $part.get();
  const seat = current.ivaSeats[seatIndex];
  if (!seat) return;
  const newId = nextKittenId(current);
  pushUndo('add kitten at seat', `Seat ${seatIndex + 1}`);
  const part = clone(current);
  part.kittens.push({
    id: newId,
    kind,
    position: { ...seat.position },
    rotation: { x: 0, y: kittenYawFacing(seatAxesFromRotation(seat.rotation).forward), z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    layerId: KITTEN_LAYER_ID,
  });
  $part.set(part);
  select([{ kind: 'kitten', id: newId }]);
}

/** Returns the next free "kitten_N" id (max existing N + 1). */
function nextKittenId(part: EditingPart): string {
  let max = 0;
  for (const k of part.kittens) {
    const m = /^kitten_(\d+)$/.exec(k.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `kitten_${max + 1}`;
}

/** Returns the next free "_colliderN" id (max existing N + 1). */
function nextColliderId(part: EditingPart): string {
  let max = 0;
  for (const c of part.colliders) {
    const m = /^_collider(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_collider${max + 1}`;
}

/** Returns the next free "_seatN" id (max existing N + 1). */
function nextIvaSeatId(part: EditingPart): string {
  let max = 0;
  for (const s of part.ivaSeats) {
    const m = /^_seat(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_seat${max + 1}`;
}

/** Returns the next free "_connectorN" id (max existing N + 1). */
function nextConnectorId(part: EditingPart): string {
  let max = 0;
  for (const c of part.connectors) {
    const m = /^_connector(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_connector${max + 1}`;
}

export function setConnectorFlags(index: number, flags: readonly ConnectorFlag[]): void {
  const current = $part.get();
  if (index < 0 || index >= current.connectors.length) return;
  pushUndo(
    'connector flags',
    `${current.connectors[index].id} → ${flags.length ? flags.join(', ') : 'none'}`,
  );
  const part = clone(current);
  part.connectors[index].flags = [...flags];
  $part.set(part);
}

/**
 * Sets a connector's `<Capabilities>` — what may FLOW across it (KSA 2026.7.9). An
 * empty list is not "nothing": it is KSA's implicit `Electricity | ServiceFluid`.
 */
export function setConnectorCapabilities(
  index: number,
  capabilities: readonly ConnectorCapability[],
): void {
  const current = $part.get();
  if (index < 0 || index >= current.connectors.length) return;
  pushUndo(
    'connector capabilities',
    `${current.connectors[index].id} → ${capabilities.length ? capabilities.join(', ') : 'default'}`,
  );
  const part = clone(current);
  part.connectors[index].capabilities = [...capabilities];
  $part.set(part);
}

/**
 * Removes every selected entity — SubParts, connectors, colliders, IVA seats,
 * lights AND kittens — in one undo step. A single-entity delete keeps a neighbor of
 * that kind selected (matching the old per-kind behavior); any multi/mixed delete
 * clears the selection.
 */
export function removeSelected(): void {
  const part0 = $part.get();
  const sub = selectedIndicesOf(part0, 'subpart');
  const con = selectedIndicesOf(part0, 'connector');
  const kit = selectedIndicesOf(part0, 'kitten');
  const col = selectedIndicesOf(part0, 'collider');
  const seat = selectedIndicesOf(part0, 'ivaSeat');
  const lig = selectedIndicesOf(part0, 'light');
  const total = sub.length + con.length + kit.length + col.length + seat.length + lig.length;
  if (total === 0) return;

  const kinds =
    (sub.length ? 1 : 0) +
    (con.length ? 1 : 0) +
    (kit.length ? 1 : 0) +
    (col.length ? 1 : 0) +
    (seat.length ? 1 : 0) +
    (lig.length ? 1 : 0);
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
          : kit.length
            ? kit.length === 1
              ? 'delete kitten'
              : 'delete kittens'
            : col.length
              ? col.length === 1
                ? 'delete collider'
                : 'delete colliders'
              : seat.length
                ? seat.length === 1
                  ? 'delete IVA seat'
                  : 'delete IVA seats'
                : lig.length === 1
                  ? 'delete light'
                  : 'delete lights';
  const detail =
    total === 1
      ? ((sub.length
          ? part0.placements[sub[0]]?.instanceId
          : con.length
            ? part0.connectors[con[0]]?.id
            : kit.length
              ? part0.kittens[kit[0]]?.id
              : col.length
                ? part0.colliders[col[0]]?.id
                : seat.length
                  ? part0.ivaSeats[seat[0]]?.id
                  : part0.lights[lig[0]]?.id) ?? '')
      : [
          sub.length ? `${sub.length} part${sub.length === 1 ? '' : 's'}` : '',
          con.length ? `${con.length} connector${con.length === 1 ? '' : 's'}` : '',
          kit.length ? `${kit.length} kitten${kit.length === 1 ? '' : 's'}` : '',
          col.length ? `${col.length} collider${col.length === 1 ? '' : 's'}` : '',
          seat.length ? `${seat.length} IVA seat${seat.length === 1 ? '' : 's'}` : '',
          lig.length ? `${lig.length} light${lig.length === 1 ? '' : 's'}` : '',
        ]
          .filter(Boolean)
          .join(', ');
  pushUndo(description, detail);

  const part = clone(part0);
  // Splice each array in descending order so earlier indices stay valid.
  for (const i of [...sub].sort((a, b) => b - a)) part.placements.splice(i, 1);
  for (const i of [...con].sort((a, b) => b - a)) part.connectors.splice(i, 1);
  for (const i of [...kit].sort((a, b) => b - a)) part.kittens.splice(i, 1);
  for (const i of [...col].sort((a, b) => b - a)) part.colliders.splice(i, 1);
  for (const i of [...seat].sort((a, b) => b - a)) part.ivaSeats.splice(i, 1);
  for (const i of [...lig].sort((a, b) => b - a)) part.lights.splice(i, 1);
  $part.set(part);

  // After a SINGLE-entity delete keep a neighbor of the same kind selected. The
  // neighbor is resolved against the PRE-splice document (the entity after the removed
  // one, else the one before it) and then re-selected by ID — v1's post-splice
  // `Math.min(index, length - 1)` was the index-aliasing hazard in miniature.
  const onlyKind: EntityKind | null =
    total !== 1
      ? null
      : sub.length
        ? 'subpart'
        : con.length
          ? 'connector'
          : kit.length
            ? 'kitten'
            : col.length
              ? 'collider'
              : seat.length
                ? 'ivaSeat'
                : 'light';
  const onlyIndex = sub[0] ?? con[0] ?? kit[0] ?? col[0] ?? seat[0] ?? lig[0];
  const neighborId = onlyKind
    ? (entityIdAt(part0, onlyKind, onlyIndex + 1) ?? entityIdAt(part0, onlyKind, onlyIndex - 1))
    : null;
  if (onlyKind && neighborId !== null) select([{ kind: onlyKind, id: neighborId }]);
  else clearSelection();
}

/**
 * Removes a single SubPart by index (used by the per-row context menu, which acts
 * on its own row regardless of the current selection). Discrete mutation → records
 * undo. The selection needs no fix-up beyond dropping the deleted entity: stable-id
 * refs keep naming the same SubParts across the splice.
 */
export function removePlacement(index: number): void {
  const current = $part.get();
  if (index < 0 || index >= current.placements.length) return;
  pushUndo('delete part', current.placements[index].instanceId);
  const part = clone(current);
  part.placements.splice(index, 1);
  $part.set(part);
  clampSelection(); // id refs survive the splice; only the removed one has to go
}

/** Duplicates every selected entity (SubParts, connectors, colliders, seats, lights, kittens) and selects the copies. */
export function duplicateSelected(): void {
  const part0 = $part.get();
  const sub = selectedIndicesOf(part0, 'subpart');
  const con = selectedIndicesOf(part0, 'connector');
  const kit = selectedIndicesOf(part0, 'kitten');
  const col = selectedIndicesOf(part0, 'collider');
  const seat = selectedIndicesOf(part0, 'ivaSeat');
  const lig = selectedIndicesOf(part0, 'light');
  const total = sub.length + con.length + kit.length + col.length + seat.length + lig.length;
  if (total === 0) return;

  const detail =
    total === 1
      ? ((sub.length
          ? part0.placements[sub[0]]?.instanceId
          : con.length
            ? part0.connectors[con[0]]?.id
            : kit.length
              ? part0.kittens[kit[0]]?.id
              : col.length
                ? part0.colliders[col[0]]?.id
                : seat.length
                  ? part0.ivaSeats[seat[0]]?.id
                  : part0.lights[lig[0]]?.id) ?? '')
      : entityCountLabel(sub.length, con.length, kit.length, col.length, seat.length, lig.length);
  pushUndo('duplicate', detail);

  const part = clone(part0);
  const copies: SelectionRef[] = [];
  for (const i of [...sub].sort((a, b) => a - b)) {
    const src = part.placements[i];
    if (!src) continue;
    const base = lastSegmentLower(src.subPartTemplateId);
    const count = part.placements.filter(
      (p) => p.subPartTemplateId === src.subPartTemplateId,
    ).length;
    const instanceId = `${base}_${count + 1}`;
    part.placements.push({
      instanceId,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId: src.layerId,
    });
    copies.push({ kind: 'subpart', id: instanceId });
  }
  for (const i of [...con].sort((a, b) => a - b)) {
    const src = part.connectors[i];
    if (!src) continue;
    const id = nextConnectorId(part);
    part.connectors.push({
      id,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      flags: [...src.flags],
      capabilities: [...src.capabilities],
      siblingIds: [...src.siblingIds],
      layerId: src.layerId,
    });
    copies.push({ kind: 'connector', id });
  }
  for (const i of [...kit].sort((a, b) => a - b)) {
    const src = part.kittens[i];
    if (!src) continue;
    const id = nextKittenId(part);
    part.kittens.push({
      id,
      kind: src.kind,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId: KITTEN_LAYER_ID,
    });
    copies.push({ kind: 'kitten', id });
  }
  for (const i of [...col].sort((a, b) => a - b)) {
    const src = part.colliders[i];
    if (!src) continue;
    // Keeps the source's layer, like a duplicated placement or connector.
    const id = nextColliderId(part);
    part.colliders.push({ ...structuredClone(src), id });
    copies.push({ kind: 'collider', id });
  }
  // Copies land at the END of the seat list, i.e. last in the IVA cycle order.
  for (const i of [...seat].sort((a, b) => a - b)) {
    const src = part.ivaSeats[i];
    if (!src) continue;
    const id = nextIvaSeatId(part);
    part.ivaSeats.push({ ...structuredClone(src), id, layerId: IVA_SEAT_LAYER_ID });
    copies.push({ kind: 'ivaSeat', id });
  }
  // A duplicate keeps the source's owner: a SubPart-owned copy lands on the same
  // template (and therefore on every placement of it), like colliders.
  for (const i of [...lig].sort((a, b) => a - b)) {
    const src = part.lights[i];
    if (!src) continue;
    const id = nextLightId(part);
    part.lights.push({ ...structuredClone(src), id, layerId: LIGHT_LAYER_ID });
    copies.push({ kind: 'light', id });
  }
  $part.set(part);
  select(copies);
}

/**
 * Layer a pasted entity lands on: the one it was copied from when that layer still
 * exists, else the active layer. The clipboard outlives layer deletion, so this is the
 * one guard that keeps a paste from stranding entities on a layer nothing lists.
 */
function pasteLayerId(part: EditingPart, sourceLayerId: string): string {
  return part.layers.some((l) => l.id === sourceLayerId) ? sourceLayerId : currentLayerId(part);
}

/** Human label for a count of mixed entities, e.g. "3 parts" or "5 items". */
function entityCountLabel(
  sub: number,
  con: number,
  kit: number,
  col: number,
  seat = 0,
  lig = 0,
): string {
  const total = sub + con + kit + col + seat + lig;
  const kinds =
    (sub ? 1 : 0) + (con ? 1 : 0) + (kit ? 1 : 0) + (col ? 1 : 0) + (seat ? 1 : 0) + (lig ? 1 : 0);
  if (kinds > 1) return `${total} items`;
  if (sub) return `${sub} ${sub === 1 ? 'part' : 'parts'}`;
  if (con) return `${con} ${con === 1 ? 'connector' : 'connectors'}`;
  if (kit) return `${kit} ${kit === 1 ? 'kitten' : 'kittens'}`;
  if (col) return `${col} ${col === 1 ? 'collider' : 'colliders'}`;
  if (seat) return `${seat} IVA seat${seat === 1 ? '' : 's'}`;
  return `${lig} light${lig === 1 ? '' : 's'}`;
}

/**
 * Copies the current selection (every kind) into the in-app
 * {@link $clipboard}, stripping ids so a later paste regenerates fresh ones.
 * Leaves the workspace and selection untouched. Returns how many entities were
 * copied (0 when nothing is selected — the clipboard is left as-is).
 */
export function copySelected(): number {
  const part = $part.get();
  const sub = selectedIndicesOf(part, 'subpart');
  const con = selectedIndicesOf(part, 'connector');
  const kit = selectedIndicesOf(part, 'kitten');
  const col = selectedIndicesOf(part, 'collider');
  const seat = selectedIndicesOf(part, 'ivaSeat');
  const total = sub.length + con.length + kit.length + col.length + seat.length;
  if (total === 0) return 0;
  const order = (a: number, b: number) => a - b;
  $clipboard.set({
    placements: [...sub].sort(order).map((i) => structuredClone(part.placements[i])),
    connectors: [...con].sort(order).map((i) => structuredClone(part.connectors[i])),
    kittens: [...kit].sort(order).map((i) => structuredClone(part.kittens[i])),
    colliders: [...col].sort(order).map((i) => structuredClone(part.colliders[i])),
    // Sorted by index so a paste preserves the seats' relative cycle order.
    ivaSeats: [...seat].sort(order).map((i) => structuredClone(part.ivaSeats[i])),
  });
  return total;
}

/**
 * Pastes the {@link $clipboard} contents back into the workspace in place (same
 * position/rotation/scale they were copied at), regenerating ids so the pastes
 * never collide with existing entities, and selects the newly pasted entities.
 * Discrete mutation → records one undo step. A pasted SubPart, connector or collider
 * keeps its original layer when that layer still exists, else falls back to the active
 * layer (see {@link pasteLayerId} — the clipboard can outlive the layer it was copied
 * from). Returns how many entities were pasted (0 when the clipboard is empty).
 */
export function pasteClipboard(): number {
  const clip = $clipboard.get();
  if (!clip) return 0;
  const total =
    clip.placements.length +
    clip.connectors.length +
    clip.kittens.length +
    clip.colliders.length +
    clip.ivaSeats.length;
  if (total === 0) return 0;

  pushUndo(
    'paste',
    entityCountLabel(
      clip.placements.length,
      clip.connectors.length,
      clip.kittens.length,
      clip.colliders.length,
      clip.ivaSeats.length,
    ),
  );
  const part = clone($part.get());
  const pasted: SelectionRef[] = [];
  for (const src of clip.placements) {
    const base = lastSegmentLower(src.subPartTemplateId);
    const count = part.placements.filter(
      (p) => p.subPartTemplateId === src.subPartTemplateId,
    ).length;
    const layerId = pasteLayerId(part, src.layerId);
    const instanceId = `${base}_${count + 1}`;
    part.placements.push({
      instanceId,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId,
    });
    pasted.push({ kind: 'subpart', id: instanceId });
  }
  for (const src of clip.connectors) {
    const id = nextConnectorId(part);
    part.connectors.push({
      id,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      flags: [...src.flags],
      capabilities: [...src.capabilities],
      siblingIds: [...src.siblingIds],
      layerId: pasteLayerId(part, src.layerId),
    });
    pasted.push({ kind: 'connector', id });
  }
  for (const src of clip.kittens) {
    const id = nextKittenId(part);
    part.kittens.push({
      id,
      kind: src.kind,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId: KITTEN_LAYER_ID,
    });
    pasted.push({ kind: 'kitten', id });
  }
  for (const src of clip.colliders) {
    const id = nextColliderId(part);
    part.colliders.push({
      ...structuredClone(src),
      id,
      layerId: pasteLayerId(part, src.layerId),
    });
    pasted.push({ kind: 'collider', id });
  }
  // Pasted seats land at the END of the cycle order, in the order they were copied.
  for (const src of clip.ivaSeats) {
    const id = nextIvaSeatId(part);
    part.ivaSeats.push({ ...structuredClone(src), id, layerId: IVA_SEAT_LAYER_ID });
    pasted.push({ kind: 'ivaSeat', id });
  }
  $part.set(part);
  select(pasted);
  return total;
}

/**
 * Duplicates a single SubPart by index (used by the per-row context menu, which
 * acts on its own row regardless of the current selection). Discrete mutation →
 * records undo. The copy lands on the same layer and is selected.
 */
export function duplicatePlacement(index: number): void {
  const current = $part.get();
  const src = current.placements[index];
  if (!src) return;
  pushUndo('duplicate', src.instanceId);
  const part = clone(current);
  const base = lastSegmentLower(src.subPartTemplateId);
  const count = part.placements.filter((p) => p.subPartTemplateId === src.subPartTemplateId).length;
  const instanceId = `${base}_${count + 1}`;
  part.placements.push({
    instanceId,
    subPartTemplateId: src.subPartTemplateId,
    position: { ...src.position },
    rotation: { ...src.rotation },
    scale: { ...src.scale },
    layerId: src.layerId,
  });
  $part.set(part);
  select([{ kind: 'subpart', id: instanceId }]);
}

/** One evaluated action-chain instance, ready to commit (see {@link applyActionChain}). */
export interface ChainCommitEntry {
  /** `instanceId` of the seed placement this instance descends from. */
  seedInstanceId: string;
  /** Where the instance ends up — already fully evaluated by the chain engine. */
  transform: PlacementTransform;
  /** True for the one instance per seed that IS the seed (it moves in place, no clone). */
  isSeed: boolean;
}

/**
 * Fresh, collision-free `instanceId` for an action-chain clone of `templateId`.
 *
 * Starts from the app-wide convention — `<last dot-segment, lowercased>_<count + 1>`,
 * counted against the GROWING `part.placements` exactly like the duplicate loop — then
 * skips forward while the candidate is already taken. That skip is a deliberate deviation
 * from `duplicateSelected`/`duplicatePlacement`, which stop at `count + 1` and therefore
 * collide with survivors of a deletion (delete `bolt_1`, keep `bolt_2` → count 1 → a
 * second `bolt_2`). One odd id from a single Duplicate is a known, tolerated quirk; a
 * chain mass-produces up to 500 placements in ONE gesture, where the same formula would
 * stamp out colliding ids wholesale and only surface much later as the pre-export
 * duplicate-id warning in `ExportDialog.tsx`. Existing duplicate paths are untouched.
 */
function nextChainInstanceId(part: EditingPart, templateId: string): string {
  const base = lastSegmentLower(templateId);
  let n = part.placements.filter((p) => p.subPartTemplateId === templateId).length + 1;
  while (part.placements.some((p) => p.instanceId === `${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/**
 * Commits an evaluated action chain: seed entries overwrite their original placement's
 * transform (identity, template and layer untouched); every other entry appends a clone
 * of its seed — same template and layer, fresh collision-free `instanceId`. Like
 * `duplicateSelected`, clones carry NO references (animations, gimbals, feeds,
 * couplings); template-keyed behavior follows automatically.
 *
 * Discrete mutation → ONE undo entry for the whole chain. Afterwards the seeds plus every
 * new copy are selected, so the user can immediately chain or transform the result.
 *
 * Returns the number of placements created, or `-1` when `entries` is empty or any
 * `seedInstanceId` no longer resolves (no mutation, no undo entry — the caller's seeds
 * were deleted out from under the session).
 */
export function applyActionChain(entries: readonly ChainCommitEntry[], detail: string): number {
  if (entries.length === 0) return -1;
  const current = $part.get();
  // Resolve every distinct seed FIRST: a partial commit would be worse than none.
  const seedIndexById = new Map<string, number>();
  for (const entry of entries) {
    if (seedIndexById.has(entry.seedInstanceId)) continue;
    const index = current.placements.findIndex((p) => p.instanceId === entry.seedInstanceId);
    if (index < 0) return -1;
    seedIndexById.set(entry.seedInstanceId, index);
  }

  pushUndo('action chain', detail);
  const part = clone(current);
  const seedRefs: SelectionRef[] = [];
  for (const entry of entries) {
    if (!entry.isSeed) continue;
    const index = seedIndexById.get(entry.seedInstanceId)!;
    const target = part.placements[index];
    target.position = { ...entry.transform.position };
    target.rotation = { ...entry.transform.rotation };
    target.scale = { ...entry.transform.scale };
    seedRefs.push({ kind: 'subpart', id: target.instanceId });
  }
  const cloneRefs: SelectionRef[] = [];
  for (const entry of entries) {
    if (entry.isSeed) continue;
    const seed = part.placements[seedIndexById.get(entry.seedInstanceId)!];
    const instanceId = nextChainInstanceId(part, seed.subPartTemplateId);
    part.placements.push({
      instanceId,
      subPartTemplateId: seed.subPartTemplateId,
      position: { ...entry.transform.position },
      rotation: { ...entry.transform.rotation },
      scale: { ...entry.transform.scale },
      layerId: seed.layerId,
    });
    cloneRefs.push({ kind: 'subpart', id: instanceId });
  }
  $part.set(part);
  select([...seedRefs, ...cloneRefs]);
  return cloneRefs.length;
}

// ── deprecated index-based setter shims ─────────────────────────────────────
//
// Same exported names + signatures as the v1 per-kind setters, re-expressed over
// {@link select} / {@link toggleRef}. They exist ONLY so the v1 surfaces that still speak
// indices (AssetsList and friends) compile untouched; each one dies with its last
// consumer in P5A.17. New code selects by ref.

/** Indices → refs, dropping anything that does not resolve. */
function refsFromIndices(kind: EntityKind, indices: readonly number[]): SelectionRef[] {
  const part = $part.get();
  const out: SelectionRef[] = [];
  for (const i of indices) {
    const ref = refAt(part, kind, i);
    if (ref) out.push(ref);
  }
  return out;
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function selectPlacement(index: number): void {
  select(refsFromIndices('subpart', [index]));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function setSelectedPlacements(indices: readonly number[]): void {
  select(refsFromIndices('subpart', indices));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `toggleRef`. */
export function togglePlacement(index: number): void {
  const ref = refAt($part.get(), 'subpart', index);
  if (ref) toggleRef(ref);
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function selectConnector(index: number): void {
  select(refsFromIndices('connector', [index]));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function setSelectedConnectors(indices: readonly number[]): void {
  select(refsFromIndices('connector', indices));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function selectKitten(index: number): void {
  select(refsFromIndices('kitten', [index]));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function setSelectedKittens(indices: readonly number[]): void {
  select(refsFromIndices('kitten', indices));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function selectCollider(index: number): void {
  select(refsFromIndices('collider', [index]));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function setSelectedColliders(indices: readonly number[]): void {
  select(refsFromIndices('collider', indices));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function selectIvaSeat(index: number): void {
  select(refsFromIndices('ivaSeat', [index]));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function setSelectedIvaSeats(indices: readonly number[]): void {
  select(refsFromIndices('ivaSeat', indices));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function selectLight(index: number): void {
  select(refsFromIndices('light', [index]));
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `select`. */
export function setSelectedLights(indices: readonly number[]): void {
  select(refsFromIndices('light', indices));
}

/**
 * @deprecated index-based shim — DELETE in P5A.17. Use `select`.
 *
 * The v1 cross-kind setter: every omitted list still CLEARS its kind, which the ref-based
 * `select` gets for free (it replaces the whole selection).
 */
export function setSelection(
  subIndices: readonly number[],
  conIndices: readonly number[],
  kitIndices: readonly number[],
  colIndices: readonly number[] = [],
  seatIndices: readonly number[] = [],
  lightIndices: readonly number[] = [],
): void {
  select([
    ...refsFromIndices('subpart', subIndices),
    ...refsFromIndices('connector', conIndices),
    ...refsFromIndices('collider', colIndices),
    ...refsFromIndices('ivaSeat', seatIndices),
    ...refsFromIndices('kitten', kitIndices),
    ...refsFromIndices('light', lightIndices),
  ]);
}

/** @deprecated index-based shim — DELETE in P5A.17. Use `toggleRef`. */
export function toggleEntity(kind: EntityKind, index: number): void {
  const ref = refAt($part.get(), kind, index);
  if (ref) toggleRef(ref);
}

/** Clears the whole selection. */
export function clearSelection(): void {
  setSelectionRefs([]);
}

/**
 * The entity the Assets list should scroll into view, identified by kind + stable
 * id (instanceId / connector id / kitten id). Set when a selection originates from
 * a 3D viewport click — the list has no other way to know the click happened. A
 * fresh object is published on every reveal (even for the same entity, e.g. a
 * deselect-then-reselect) so the list's effect re-fires; the list nulls it once
 * consumed. Ephemeral UI state: not persisted, not in undo history.
 */
export const $revealEntity = atom<{ kind: EntityKind; id: string } | null>(null);

/** Asks the Assets list to scroll `id` (of `kind`) into view — used by 3D-click selection. */
export function revealEntity(kind: EntityKind, id: string): void {
  $revealEntity.set({ kind, id });
}

/** A selected entity plus its current transform — the unit of bulk transform work. */
export interface SelectedTransformRef {
  kind: EntityKind;
  /** The entity's STABLE id — what the write-back addresses it by. */
  id: string;
  /**
   * index: transitional — EditorScene's `colliderGizmoFrame`/`lightGizmoFrame` and
   * TransformInspector still index into `$part`; remove when 5B dissolves
   * TransformInspector. Recomputed fresh on every call, so it is always valid at read time.
   */
  index: number;
  transform: PlacementTransform;
  layerId: string;
  name: string;
}

/**
 * All selected entities (SubParts, then connectors, then colliders, then IVA seats,
 * then kittens, then lights) with their transforms. This is what the gizmo, the
 * keyboard nudge/rotate tools and the bulk inspector all iterate — being listed here
 * is what makes a seat (or a light) participate in those for free. NOTE a light's
 * transform is its OWNER-frame transform verbatim (part frame only when part-level),
 * like a collider's — EditorScene's `worldTransformRefs` lifts both into part space
 * for bulk math (via `lightWorld`) and pushes back down through
 * `lightLocalFromWorld` on write.
 */
export function selectedTransformRefs(): SelectedTransformRef[] {
  const part = $part.get();
  const tx = (e: PlacementTransform): PlacementTransform => ({
    position: { ...e.position },
    rotation: { ...e.rotation },
    scale: { ...e.scale },
  });
  const out: SelectedTransformRef[] = [];
  // Grouped into KIND_ORDER, not selection order: bulk-math consumers pair a snapshot
  // with its write-back positionally, so the flattening order must be stable.
  for (const kind of KIND_ORDER) {
    for (const ref of $selection.get()) {
      if (ref.kind !== kind) continue;
      const index = entityIndexOf(part, kind, ref.id);
      if (index < 0) continue;
      const row = entityList(part, kind)[index] as { layerId: string } & PlacementTransform;
      out.push({
        kind,
        id: ref.id,
        index,
        transform: tx(row),
        layerId: row.layerId,
        name: ref.id,
      });
    }
  }
  return out;
}

/**
 * Updates the transform of the placement at `index`. Does NOT push undo — the
 * caller pushes once at the start of an interaction (gizmo drag / field focus).
 */
export function updatePlacementTransform(index: number, t: PlacementTransform): void {
  const current = $part.get();
  if (index < 0 || index >= current.placements.length) return;
  const part = clone(current);
  const p = part.placements[index];
  p.position = { ...t.position };
  p.rotation = { ...t.rotation };
  p.scale = { ...t.scale };
  $part.set(part);
}

/**
 * Applies several placement transforms in a single store update (one subscriber
 * fire, one reconcile). Used for bulk transforms of a multi-selection. Does NOT
 * push undo — the caller pushes once at interaction start (gizmo drag / Apply).
 */
export function updatePlacementTransforms(
  updates: readonly { index: number; transform: PlacementTransform }[],
): void {
  if (updates.length === 0) return;
  const current = $part.get();
  const part = clone(current);
  for (const { index, transform } of updates) {
    if (index < 0 || index >= part.placements.length) continue;
    const p = part.placements[index];
    p.position = { ...transform.position };
    p.rotation = { ...transform.rotation };
    p.scale = { ...transform.scale };
  }
  $part.set(part);
}

/** Like {@link updatePlacementTransform} but for a connector. No undo (see above). */
export function updateConnectorTransform(index: number, t: PlacementTransform): void {
  const current = $part.get();
  if (index < 0 || index >= current.connectors.length) return;
  const part = clone(current);
  const c = part.connectors[index];
  c.position = { ...t.position };
  c.rotation = { ...t.rotation };
  c.scale = { ...t.scale };
  $part.set(part);
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
  if (updates.length === 0) return;
  const current = $part.get();
  const part = clone(current);
  for (const { index, transform } of updates) {
    if (index < 0 || index >= part.connectors.length) continue;
    const c = part.connectors[index];
    c.position = { ...transform.position };
    c.rotation = { ...transform.rotation };
    c.scale = { ...transform.scale };
  }
  $part.set(part);
}

/** Like {@link updatePlacementTransform} but for a kitten. No undo (see above). */
export function updateKittenTransform(index: number, t: PlacementTransform): void {
  const current = $part.get();
  if (index < 0 || index >= current.kittens.length) return;
  const part = clone(current);
  const k = part.kittens[index];
  k.position = { ...t.position };
  k.rotation = { ...t.rotation };
  k.scale = { ...t.scale };
  $part.set(part);
}

/**
 * Applies transforms to a MIX of selected entities (SubParts/connectors/kittens)
 * in a single store update — the bulk write-back for a unified multi-selection
 * (gizmo drag, keyboard nudge/rotate, inspector bulk panel). No undo — the caller
 * pushes once at interaction start.
 */
export function updateSelectedTransforms(
  updates: readonly { kind: EntityKind; id: string; transform: PlacementTransform }[],
): void {
  if (updates.length === 0) return;
  const part = clone($part.get());
  const assign = (e: PlacementTransform | undefined, t: PlacementTransform) => {
    if (!e) return;
    e.position = { ...t.position };
    e.rotation = { ...t.rotation };
    e.scale = { ...t.scale };
  };
  for (const { kind, id, transform } of updates) {
    // Addressed BY ID and switched on exhaustively. v1 indexed the list and fell through
    // to a kitten default, so a kind that missed its branch silently moved the kitten at
    // the same index — the documented order trap died with the index model.
    const index = entityIndexOf(part, kind, id);
    if (index < 0) continue;
    switch (kind) {
      case 'subpart':
        assign(part.placements[index], transform);
        break;
      case 'connector':
        assign(part.connectors[index], transform);
        break;
      case 'collider':
        assignCollider(part.colliders[index], transform);
        break;
      case 'ivaSeat':
        assignIvaSeat(part.ivaSeats[index], transform);
        break;
      case 'light':
        assignLight(part.lights[index], transform);
        break;
      case 'kitten':
        assign(part.kittens[index], transform);
        break;
    }
  }
  $part.set(part);
}

/**
 * Writes a transform onto a collider, snapping its `scale` (which IS its size in meters)
 * back onto the degrees of freedom its shape actually has. Without this, a non-uniform
 * scale-gizmo drag on a cylinder would describe a shape KSA cannot represent.
 */
function assignCollider(c: PartCollider | undefined, t: PlacementTransform): void {
  if (!c) return;
  c.position = { ...t.position };
  c.rotation = { ...t.rotation };
  c.scale = normalizeColliderSize(c.shape, t.scale);
}

/**
 * Writes a transform onto an IVA seat: position + rotation only, with `scale` PINNED to
 * (1,1,1). KSA's `<IVASeat>` is three vectors — an eye point and two axes — and has no
 * size of any kind, so there is nothing for a scale to mean; pinning it here makes a
 * scale-mode gizmo drag (or a scale-mode bulk transform) a silent no-op on a seat instead
 * of writing a number that could never be emitted. The marker's on-screen size is a global
 * view setting, not document data.
 */
function assignIvaSeat(s: IvaSeat | undefined, t: PlacementTransform): void {
  if (!s) return;
  s.position = { ...t.position };
  s.rotation = { ...t.rotation };
  s.scale = { x: 1, y: 1, z: 1 };
}

/**
 * Writes a transform onto a light: position + rotation only, with `scale` PINNED to
 * (1,1,1) — the {@link assignIvaSeat} pattern. KSA parses a light's `<Scale>` but
 * ignores it (and flexo never emits it — see {@link PartLight}), so pinning here makes
 * a scale-mode gizmo drag / bulk transform a silent no-op on a light instead of writing
 * a number that could never be emitted. The transform is the light's OWNER-frame
 * transform (part frame only when {@link PartLight.ownerTemplateId} is null).
 */
function assignLight(l: PartLight | undefined, t: PlacementTransform): void {
  if (!l) return;
  l.position = { ...t.position };
  l.rotation = { ...t.rotation };
  l.scale = { x: 1, y: 1, z: 1 };
}

/**
 * Scales the ENTIRE workspace by per-axis factors around the world origin
 * (0,0,0): every placed SubPart, connector, collider, IVA seat and kitten, AND
 * every animation keyframe pose. Rotations and keyframe times are left untouched.
 * One undoable step. Anchored at the origin so the Part's mount reference stays fixed.
 *
 * This is the animation-safe counterpart to a multi-select gizmo resize, which
 * only touches the selected placements and silently breaks animation offsets.
 *
 * GEOMETRY INSTANCES (placements/kittens) are rig LEAVES — a point map
 * `Σ·placement` — so both `position` and `scale` multiply (the mesh grows).
 *
 * CONNECTORS only MOVE. A connector's `<Scale>` is KSA's attach-node size CLASS
 * (compared across parts to resolve nested/internal connections), not the size of
 * anything drawn, so re-grading it on a workspace resize would silently change how the
 * Part connects in the vehicle editor. Same rule as the group-scale gizmo — see
 * `scalesWithGroup` in src/three/bulkTransform.ts.
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
  const { x, y, z } = factor;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  if (x === 1 && y === 1 && z === 1) return;
  pushUndo('scale everything', `${x}×${y}×${z}`);
  const part = clone($part.get());
  const scalePos = (p: Vec3): Vec3 => ({ x: p.x * x, y: p.y * y, z: p.z * z });
  const scaleInstance = (e: { position: Vec3; scale: Vec3 }): void => {
    e.position = scalePos(e.position);
    e.scale = scalePos(e.scale);
  };
  for (const p of part.placements) scaleInstance(p);
  for (const k of part.kittens) scaleInstance(k);
  // Position only — the connector's own size class is left alone (see above).
  for (const c of part.connectors) c.position = scalePos(c.position);
  // A collider's `scale` is its SIZE in meters, so the same multiply is right for it too
  // (the shape constraint is re-applied so a non-uniform factor can't skew a cylinder).
  for (const c of part.colliders) {
    c.position = scalePos(c.position);
    c.scale = normalizeColliderSize(c.shape, scalePos(c.scale));
  }
  // A seat is a POINT with a look direction: only its eye position moves. Scaling its
  // rotation would tilt the gaze, and its `scale` is the unused slot (see assignIvaSeat).
  for (const s of part.ivaSeats) s.position = scalePos(s.position);
  for (const a of part.animations) {
    for (const kf of a.keyframes) {
      // Translation only — see the conjugation note above.
      for (const pose of Object.values(kf.poses)) pose.position = scalePos(pose.position);
    }
  }
  $part.set(part);
}

/**
 * Updates the transform of whichever entity is selected (SubPart, connector,
 * collider, IVA seat, light or kitten). No undo — the caller pushes once at
 * interaction start.
 */
export function updateSelectedTransform(t: PlacementTransform): void {
  const primary = $selection.get().at(-1);
  if (!primary) return;
  updateSelectedTransforms([{ kind: primary.kind, id: primary.id, transform: t }]);
}

/**
 * Sets the Part id. Streaming mutation (per-keystroke from a text field): does NOT
 * push undo — the caller pushes once on field focus (see PartDataDialog) so a
 * typing session collapses into a single undo step.
 */
export function setPartId(partId: string): void {
  const part = clone($part.get());
  part.partId = partId;
  $part.set(part);
}

/**
 * Sets the instanceId of the SubPart at `index`. Streaming mutation (per-keystroke
 * from a text field): does NOT push undo — the caller pushes once on field focus so
 * a typing session collapses into a single undo step. No-op when blank.
 */
export function setSubPartInstanceId(index: number, instanceId: string): void {
  if (!instanceId.trim()) return;
  const part = clone($part.get());
  const placement = part.placements[index];
  if (!placement) return;
  placement.instanceId = instanceId;
  $part.set(part);
}

/** Replaces the editor tags. Discrete mutation (add/remove one tag) → self-records undo. */
export function setEditorTags(editorTags: readonly string[]): void {
  const tagsDetail =
    editorTags.length === 0
      ? 'none'
      : editorTags.slice(0, 2).join(', ') + (editorTags.length > 2 ? ', …' : '');
  pushUndo('edit tags', tagsDetail);
  const part = clone($part.get());
  part.editorTags = [...editorTags];
  $part.set(part);
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
const DEFAULT_COUPLING_FORCE = 500;
/** Default latching kinetic-energy budget (J) when a docking port is first enabled (matches DockingPortTemplate). */
const DEFAULT_LATCHING_KINETIC_ENERGY_J = 50;
/** Default undock push-off impulse (N·s) when a docking port is first enabled (matches DockingPortTemplate). */
const DEFAULT_PUSHOFF_IMPULSE_NS = 5000;
/** Default mass (kg) when the custom-mass override is first enabled. */
const DEFAULT_CUSTOM_MASS_KG = 100;
/** Default diameter (m) when the part-diameter size class is first enabled (Core's most common value). */
const DEFAULT_DIAMETER_M = 1;

/** Streaming gameData mutation: no undo push (caller focus-pushes). */
function mutateGameData(mutate: (g: PartGameData) => void): void {
  const part = clone($part.get());
  mutate(part.gameData);
  $part.set(part);
}

/** Discrete gameData mutation: records one undo step, then mutates. */
function commitGameData(label: string, detail: string, mutate: (g: PartGameData) => void): void {
  pushUndo(label, detail);
  mutateGameData(mutate);
}

/** Streaming: set the in-game display name. Caller pushes undo on field focus. */
export function setDisplayName(name: string): void {
  mutateGameData((g) => {
    g.displayName = name;
  });
}

/** Discrete: enable/disable the custom-mass override (off → null, on → default). */
export function setCustomMassEnabled(enabled: boolean): void {
  commitGameData('custom mass', enabled ? 'on' : 'off', (g) => {
    g.customMass = enabled ? (g.customMass ?? DEFAULT_CUSTOM_MASS_KG) : null;
    // Preserved inertia/offset children belong to the imported mass; drop them with it.
    if (!enabled) g.customMassExtras = [];
  });
}

/** Streaming: set the custom mass in kg. Caller pushes undo on field focus. */
export function setCustomMass(massKg: number): void {
  mutateGameData((g) => {
    g.customMass = massKg;
  });
}

/** Discrete: enable/disable the part-diameter size class (off → null, on → default 1 m). */
export function setDiameterEnabled(enabled: boolean): void {
  commitGameData('part diameter', enabled ? 'on' : 'off', (g) => {
    g.diameterM = enabled ? (g.diameterM ?? DEFAULT_DIAMETER_M) : null;
    // Extra adapter size classes are meaningless without a primary — drop them when disabling.
    if (!enabled) g.extraDiametersM = [];
  });
}

/** Streaming: set the part diameter in meters. Caller pushes undo on field focus. */
export function setDiameter(diameterM: number): void {
  mutateGameData((g) => {
    g.diameterM = diameterM;
  });
}

/** Discrete: toggle the part's command-capability marker (<Control/>). */
export function setControllable(enabled: boolean): void {
  commitGameData('command capable', enabled ? 'on' : 'off', (g) => {
    g.controllable = enabled;
  });
}

// --- SubPart GameData (per-template) ---

function getOrCreateSubPartData(part: EditingPart, subPartTemplateId: string): SubPartGameData {
  let spd = part.subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId);
  if (!spd) {
    spd = createSubPartGameData(subPartTemplateId);
    part.subPartGameData.push(spd);
  }
  return spd;
}

function mutateSubPartData(subPartTemplateId: string, mutate: (s: SubPartGameData) => void): void {
  const part = clone($part.get());
  mutate(getOrCreateSubPartData(part, subPartTemplateId));
  part.subPartGameData = part.subPartGameData.filter((s) => !isSubPartGameDataEmpty(s));
  $part.set(part);
}

function commitSubPartData(
  label: string,
  detail: string,
  subPartTemplateId: string,
  mutate: (s: SubPartGameData) => void,
): void {
  pushUndo(label, detail);
  mutateSubPartData(subPartTemplateId, mutate);
}

// --- Tanks (part level or per SubPart template) ---
//
// A `<Tank>` may be authored on the `<PartGameData>` (where Core puts its prefab tank
// data, and the only level a `<FeedsFrom Container>` can address without a `SubPart=`
// scope) or on a `<SubPartGameData>` so it travels with a reused mesh. `null` selects
// the part level; a template id selects that SubPart's entry.

/** The tank list a `subPartTemplateId` of `null` (part level) or an id (SubPart) names. */
export type TankOwner = string | null;

/** Reads the current tank list for an owner, or null when the owner has no entry yet. */
function tanksOf(owner: TankOwner): Tank[] | null {
  if (owner === null) return $part.get().gameData.tanks;
  return $part.get().subPartGameData.find((s) => s.subPartTemplateId === owner)?.tanks ?? null;
}

/** Applies `mutate` to the owner's tank list, creating the SubPart entry if needed. */
function mutateTanks(owner: TankOwner, mutate: (tanks: Tank[]) => void): void {
  if (owner === null) {
    const part = clone($part.get());
    mutate(part.gameData.tanks);
    $part.set(part);
    return;
  }
  mutateSubPartData(owner, (s) => mutate(s.tanks));
}

/** Discrete: append a default tank to the part or the given SubPart template. */
export function addTank(owner: TankOwner): void {
  pushUndo('add tank', '');
  mutateTanks(owner, (tanks) => tanks.push(createTank()));
}

/** Discrete: remove the tank at `index`. */
export function removeTank(owner: TankOwner, index: number): void {
  const tanks = tanksOf(owner);
  if (!tanks || index < 0 || index >= tanks.length) return;
  pushUndo('remove tank', '');
  mutateTanks(owner, (t) => t.splice(index, 1));
}

/** Discrete: change a tank's shape (cylindrical/spherical). */
export function setTankShape(owner: TankOwner, index: number, shape: TankShape): void {
  const tanks = tanksOf(owner);
  if (!tanks || index < 0 || index >= tanks.length) return;
  pushUndo('tank shape', shape);
  mutateTanks(owner, (t) => {
    t[index].shape = shape;
  });
}

/** Streaming: patch a tank's id / numeric / material fields. Caller pushes undo on field focus. */
export function updateTank(owner: TankOwner, index: number, patch: Partial<Tank>): void {
  const tanks = tanksOf(owner);
  if (!tanks || index < 0 || index >= tanks.length) return;
  mutateTanks(owner, (t) => {
    t[index] = { ...t[index], ...patch };
  });
}

// --- Solar panels (per SubPart template) ---

/** Discrete: append a default solar panel for the given SubPart template. */
export function addSubPartSolarPanel(subPartTemplateId: string): void {
  commitSubPartData('add solar panel', '', subPartTemplateId, (s) =>
    s.solarPanels.push(createSolarPanel()),
  );
}

/** Discrete: remove the solar panel at `index` for the given SubPart template. */
export function removeSubPartSolarPanel(subPartTemplateId: string, index: number): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId);
  if (!spd || index < 0 || index >= spd.solarPanels.length) return;
  commitSubPartData('remove solar panel', '', subPartTemplateId, (s) =>
    s.solarPanels.splice(index, 1),
  );
}

/** Streaming: set a SubPart solar panel's output (W). Caller pushes undo on field focus. */
export function setSubPartSolarPanelOutput(
  subPartTemplateId: string,
  index: number,
  outputWatts: number,
): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId);
  if (!spd || index < 0 || index >= spd.solarPanels.length) return;
  mutateSubPartData(subPartTemplateId, (s) => {
    s.solarPanels[index].outputWatts = outputWatts;
  });
}

/** Streaming: set a SubPart solar panel's orientation rotation (Euler XYZ radians). */
export function setSubPartSolarPanelRotation(
  subPartTemplateId: string,
  index: number,
  rotation: EulerXYZ,
): void {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId);
  if (!spd || index < 0 || index >= spd.solarPanels.length) return;
  mutateSubPartData(subPartTemplateId, (s) => {
    s.solarPanels[index].transform.rotation = rotation;
  });
}

// --- Lights (part level or per SubPart template) ---
//
// A `<Light>` may be authored on the `<PartGameData>` (Core: CoreCommandA headlights,
// CoreIVASpaceA's interior light) or on a `<SubPartGameData>` so it travels with a
// reused mesh (Core: CoreElectricalA spotlights). Lights are first-class part entities
// (`EditingPart.lights`, owner-grouped only at serialize time — see PartLight).

/**
 * Light id → which of its per-placement visuals is the current EDITING CONTEXT: the
 * instance last clicked in 3D (default 0 when never clicked; readers clamp to the
 * owner's placement count). Only meaningful for a SubPart-owned light, whose one
 * document entity is drawn once per placement of its template — the context names
 * the placement frame the gizmo writes back through AND the frame the inspector's
 * part-frame fields read through. It lives HERE (not as EditorScene's private map,
 * the `colliderInstance` precedent) precisely so those two consumers read one atom
 * and can never disagree (plans/LIGHT_MANAGEMENT_PLAN.md §3.9-1). Ephemeral view
 * state: not document data, never serialized, deliberately outside undo.
 */
export const $lightEditContext = atom<Readonly<Record<string, number>>>({});

/** Records the light instance last clicked in 3D (see {@link $lightEditContext}). */
export function setLightEditContext(lightId: string, instanceIndex: number): void {
  const current = $lightEditContext.get();
  if (current[lightId] === instanceIndex) return;
  $lightEditContext.set({ ...current, [lightId]: instanceIndex });
}

/** Returns the next free "_lightN" id (max existing N + 1). */
function nextLightId(part: EditingPart): string {
  let max = 0;
  for (const l of part.lights) {
    const m = /^_light(\d+)$/.exec(l.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `_light${max + 1}`;
}

/**
 * Discrete: append a light — a default white Spot (`createPartLight`) overridden by
 * `seed`. `ownerTemplateId` null ⇒ part-level (`<PartGameData>`, assembly frame);
 * a SubPart template id ⇒ that template's `<SubPartGameData>` (owner frame, applies
 * to every placement).
 *
 * `seed` exists for the glow panel's "Add matching light": KSA's `<Emissive>` map can only ever
 * add WHITE (MeshIndirect.frag:286), so a `<Light>` carrying the glow's colour is the only way a
 * part reads as a COLOURED lamp in-game — see analysis/KSA_EMISSIVE_AND_LUT.md §5.1.
 *
 * Selects the new light, like every other `add*` (the Add-menu command used to do this by
 * index from the outside).
 */
export function addLight(ownerTemplateId: string | null, seed?: Partial<PartLight>): void {
  const current = $part.get();
  const newId = nextLightId(current);
  pushUndo('add light', newId);
  const part = clone(current);
  part.lights.push({
    ...createPartLight(ownerTemplateId, newId),
    ...seed,
    // Identity + layer are never seed-overridable: the id was just allocated, the owner
    // is the explicit argument, and lights always live on the built-in Lights layer.
    id: newId,
    ownerTemplateId,
    layerId: LIGHT_LAYER_ID,
  });
  $part.set(part);
  select([{ kind: 'light', id: newId }]);
}

/** Discrete: remove the light at `index` (into `part.lights`). */
export function removeLight(index: number): void {
  const current = $part.get();
  if (index < 0 || index >= current.lights.length) return;
  pushUndo('remove light', current.lights[index].id);
  const part = clone(current);
  part.lights.splice(index, 1);
  $part.set(part);
  clampSelection();
}

/** Discrete: change a light's type (Spot/Point). */
export function setLightType(index: number, type: LightType): void {
  const current = $part.get();
  if (index < 0 || index >= current.lights.length) return;
  pushUndo('light type', type);
  const part = clone(current);
  part.lights[index].type = type;
  $part.set(part);
}

/** Discrete: toggle a light's IVA ray-tracing flag. */
export function setLightRayTracing(index: number, on: boolean): void {
  const current = $part.get();
  if (index < 0 || index >= current.lights.length) return;
  pushUndo('light ray tracing', on ? 'on' : 'off');
  const part = clone(current);
  part.lights[index].rayTracing = on;
  $part.set(part);
}

/**
 * Discrete: re-homes a light onto another owner (`null` ⇒ part-level `<PartGameData>`),
 * optionally rewriting its transform to `converted` in the same undo step.
 *
 * The world-pose-stable conversion (plans/LIGHT_MANAGEMENT_PLAN.md §3.8 — new local =
 * `lightLocalFromWorld(lightWorld(light, oldOwner₀), newOwner₀)` through instance 0 of
 * each owner's placements) is computed by the CALLER and passed as `converted`: this
 * store imports no three.js (docs/architecture.md layering) and the frame math lives in
 * `src/three/coords.ts`, so the mutator stays dumb — exactly the {@link setColliderOwner}
 * precedent, whose conversion also lives in the inspector. Omit `converted` to keep the
 * local numbers verbatim (the spec'd behavior when the NEW owner has no placements —
 * the light renders in the Part frame either way, and validation will flag it).
 * `scale` is pinned to (1,1,1) like every light-transform write.
 */
export function setLightOwner(
  index: number,
  ownerTemplateId: string | null,
  converted?: PlacementTransform,
): void {
  const current = $part.get();
  const l = current.lights[index];
  if (!l || l.ownerTemplateId === ownerTemplateId) return;
  pushUndo('light owner', `${l.id} → ${ownerTemplateId ?? 'Part'}`);
  const part = clone(current);
  const next = part.lights[index];
  next.ownerTemplateId = ownerTemplateId;
  if (converted) assignLight(next, converted);
  $part.set(part);
}

/** Streaming: patch a light's scalar/color fields. Caller pushes undo on field focus. */
export function updateLight(index: number, patch: Partial<PartLight>): void {
  const current = $part.get();
  if (index < 0 || index >= current.lights.length) return;
  const part = clone(current);
  part.lights[index] = { ...part.lights[index], ...patch };
  $part.set(part);
}

/** Streaming: set a light's owner-local position (m). Caller pushes undo on field focus. */
export function setLightPosition(index: number, position: Vec3): void {
  const current = $part.get();
  if (index < 0 || index >= current.lights.length) return;
  const part = clone(current);
  part.lights[index].position = position;
  $part.set(part);
}

/** Streaming: set a Spot light's aim rotation (Euler XYZ radians). Caller pushes undo. */
export function setLightRotation(index: number, rotation: EulerXYZ): void {
  const current = $part.get();
  if (index < 0 || index >= current.lights.length) return;
  const part = clone(current);
  part.lights[index].rotation = rotation;
  $part.set(part);
}

/**
 * Like {@link updatePlacementTransform} but for a light: the OWNER-frame transform,
 * scale pinned to (1,1,1) via {@link assignLight}. No undo — the caller pushes once at
 * interaction start (gizmo drag / field focus). Pulled forward from the gizmo phase so
 * a transform write on a selected light has a dedicated route and can never fall into
 * {@link updateSelectedTransforms}'s kitten fallback.
 */
export function updateLightTransform(index: number, t: PlacementTransform): void {
  const current = $part.get();
  if (index < 0 || index >= current.lights.length) return;
  const part = clone(current);
  assignLight(part.lights[index], t);
  $part.set(part);
}

// --- Engine modules (per SubPart template): combustor / nozzle / rocket ---
//
// These travel with the mesh (a reusable thrust chamber). The controller + gimbals
// that make them fire live on the part-level GameData below. Module ids are KSA-facing
// and cross-referenced, so new ones get a readable, scope-unique id.

/** Returns `base`, else `base2`, `base3`, … — the first not already in `taken`. */
function uniqueModuleId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/**
 * All engine-module ids currently in use across the part (so new ids never collide).
 *
 * The solid families share namespaces with the liquid ones: a `<Rocket><Core Id>` may
 * name a `<Combustor>` OR a `<SolidMotor>`, and a `<Nozzle Id>` a `<DeLavalNozzle>` OR a
 * `<SolidMotorNozzle>` — so they are pooled here. `containers` pools `<Tank Id>` with
 * `<SolidGrainSegment Id>` for the same reason (both are `Components` entries a
 * `<FeedsFrom Container>` resolves against).
 */
function allEngineModuleIds(part: EditingPart): {
  combustors: string[];
  nozzles: string[];
  rockets: string[];
  controllers: string[];
  containers: string[];
} {
  const combustors: string[] = [];
  const nozzles: string[] = [];
  const rockets: string[] = [];
  const containers: string[] = [];
  for (const spd of part.subPartGameData) {
    for (const c of spd.combustors) combustors.push(c.id);
    for (const m of spd.solidMotors) combustors.push(m.id);
    for (const noz of spd.nozzles) nozzles.push(noz.id);
    for (const noz of spd.solidNozzles) nozzles.push(noz.id);
    for (const r of spd.rockets) rockets.push(r.id);
    for (const t of spd.tanks) containers.push(t.id);
    for (const g of spd.solidGrainSegments) containers.push(g.id);
  }
  for (const c of part.gameData.combustors) combustors.push(c.id);
  for (const m of part.gameData.solidMotors) combustors.push(m.id);
  for (const noz of part.gameData.nozzles) nozzles.push(noz.id);
  for (const noz of part.gameData.solidNozzles) nozzles.push(noz.id);
  for (const r of part.gameData.rockets) rockets.push(r.id);
  for (const t of part.gameData.tanks) containers.push(t.id);
  for (const g of part.gameData.solidGrainSegments) containers.push(g.id);
  return {
    combustors,
    nozzles,
    rockets,
    controllers: part.gameData.rocketControllers.map((c) => c.id),
    containers: containers.filter((id) => id.trim()),
  };
}

function hasSubPartItem(
  subPartTemplateId: string,
  key: 'combustors' | 'nozzles' | 'rockets' | 'solidMotors' | 'solidNozzles' | 'solidGrainSegments',
  index: number,
): boolean {
  const spd = $part.get().subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId);
  return !!spd && index >= 0 && index < spd[key].length;
}

/** Discrete: append a default combustor for the given SubPart template. */
export function addCombustor(subPartTemplateId: string): void {
  const id = uniqueModuleId('ThrustChamber', allEngineModuleIds($part.get()).combustors);
  commitSubPartData('add combustor', '', subPartTemplateId, (s) =>
    s.combustors.push(createCombustor(id)),
  );
}
/** Discrete: remove the combustor at `index`. */
export function removeCombustor(subPartTemplateId: string, index: number): void {
  if (!hasSubPartItem(subPartTemplateId, 'combustors', index)) return;
  commitSubPartData('remove combustor', '', subPartTemplateId, (s) =>
    s.combustors.splice(index, 1),
  );
}
/** Streaming: patch a combustor's numeric fields. Caller pushes undo on field focus. */
export function updateCombustor(
  subPartTemplateId: string,
  index: number,
  patch: Partial<Combustor>,
): void {
  if (!hasSubPartItem(subPartTemplateId, 'combustors', index)) return;
  mutateSubPartData(subPartTemplateId, (s) => {
    s.combustors[index] = { ...s.combustors[index], ...patch };
  });
}
/**
 * Discrete: set a combustor's reaction id (the propellant) and its O/F mixture
 * ratio in one commit — picking a reaction resets the ratio to that reaction's
 * default, the way KSA's own designer does (null for FixedReactions).
 */
export function setCombustorReaction(
  subPartTemplateId: string,
  index: number,
  reactionId: string,
  mixtureRatio: number | null,
): void {
  if (!hasSubPartItem(subPartTemplateId, 'combustors', index)) return;
  commitSubPartData('reaction', reactionId, subPartTemplateId, (s) => {
    s.combustors[index].reactionId = reactionId;
    s.combustors[index].mixtureRatio = mixtureRatio;
  });
}

/**
 * Discrete: replace a SubPart-level combustor's `<FeedsFrom>` list. Feed points are a
 * discrete edit (add/remove/retarget a whole feed), so this records its own undo step
 * rather than streaming like {@link updateCombustor}.
 */
export function setCombustorFeeds(
  subPartTemplateId: string,
  index: number,
  feeds: readonly FeedSource[],
): void {
  if (!hasSubPartItem(subPartTemplateId, 'combustors', index)) return;
  commitSubPartData('feed points', '', subPartTemplateId, (s) => {
    s.combustors[index].feeds = [...feeds];
  });
}

/** Discrete: set a SubPart-level combustor's `<Plumbing>` class (Bulk / Service). */
export function setCombustorPlumbing(
  subPartTemplateId: string,
  index: number,
  plumbing: PlumbingClass,
): void {
  if (!hasSubPartItem(subPartTemplateId, 'combustors', index)) return;
  commitSubPartData('plumbing', plumbing, subPartTemplateId, (s) => {
    s.combustors[index].plumbing = plumbing;
  });
}

/** Discrete: append a default nozzle for the given SubPart template. */
export function addNozzle(subPartTemplateId: string): void {
  const id = uniqueModuleId('Nozzle', allEngineModuleIds($part.get()).nozzles);
  commitSubPartData('add nozzle', '', subPartTemplateId, (s) => s.nozzles.push(createNozzle(id)));
}
/** Discrete: remove the nozzle at `index`. */
export function removeNozzle(subPartTemplateId: string, index: number): void {
  if (!hasSubPartItem(subPartTemplateId, 'nozzles', index)) return;
  commitSubPartData('remove nozzle', '', subPartTemplateId, (s) => s.nozzles.splice(index, 1));
}
/** Streaming: patch a nozzle's fields (numbers, vectors, plume/sound). Caller pushes undo on focus/drag-start. */
export function updateNozzle(
  subPartTemplateId: string,
  index: number,
  patch: Partial<DeLavalNozzle>,
): void {
  if (!hasSubPartItem(subPartTemplateId, 'nozzles', index)) return;
  mutateSubPartData(subPartTemplateId, (s) => {
    s.nozzles[index] = { ...s.nozzles[index], ...patch };
  });
}

/** Discrete: append a `<Rocket>` (defaults to binding the first combustor + nozzle on this SubPart). */
export function addRocket(subPartTemplateId: string): void {
  const part = $part.get();
  const spd = part.subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId);
  const id = uniqueModuleId('Engine', allEngineModuleIds(part).rockets);
  const coreId = spd?.combustors[0]?.id ?? '';
  const nozzleIds = spd?.nozzles[0] ? [spd.nozzles[0].id] : [];
  commitSubPartData('add rocket', '', subPartTemplateId, (s) =>
    s.rockets.push(createRocket(id, coreId, nozzleIds)),
  );
}
/** Discrete: remove the `<Rocket>` at `index`. */
export function removeRocket(subPartTemplateId: string, index: number): void {
  if (!hasSubPartItem(subPartTemplateId, 'rockets', index)) return;
  commitSubPartData('remove rocket', '', subPartTemplateId, (s) => s.rockets.splice(index, 1));
}
/** Discrete: patch a `<Rocket>`'s wiring (core / nozzles). Structural, so it records one step. */
export function updateRocket(
  subPartTemplateId: string,
  index: number,
  patch: Partial<Rocket>,
): void {
  if (!hasSubPartItem(subPartTemplateId, 'rockets', index)) return;
  commitSubPartData('rocket wiring', '', subPartTemplateId, (s) => {
    s.rockets[index] = { ...s.rockets[index], ...patch };
  });
}

// --- Power (batteries / generators / consumers) ---

/** Discrete: append a battery (default capacity, in Wh). */
export function addBattery(): void {
  commitGameData('add battery', '', (g) => g.batteries.push({ capacityWh: 10 }));
}
/** Discrete: remove battery at `index`. */
export function removeBattery(index: number): void {
  if (index < 0 || index >= $part.get().gameData.batteries.length) return;
  commitGameData('remove battery', '', (g) => g.batteries.splice(index, 1));
}
/** Streaming: set a battery's capacity (Wh). Caller pushes undo on field focus. */
export function setBatteryCapacity(index: number, capacityWh: number): void {
  if (index < 0 || index >= $part.get().gameData.batteries.length) return;
  mutateGameData((g) => {
    g.batteries[index].capacityWh = capacityWh;
  });
}

/** Discrete: append a generator (default output). */
export function addGenerator(): void {
  commitGameData('add generator', '', (g) => g.generators.push({ outputWatts: 5 }));
}
/** Discrete: remove generator at `index`. */
export function removeGenerator(index: number): void {
  if (index < 0 || index >= $part.get().gameData.generators.length) return;
  commitGameData('remove generator', '', (g) => g.generators.splice(index, 1));
}
/** Streaming: set a generator's output (W). Caller pushes undo on field focus. */
export function setGeneratorOutput(index: number, outputWatts: number): void {
  if (index < 0 || index >= $part.get().gameData.generators.length) return;
  mutateGameData((g) => {
    g.generators[index].outputWatts = outputWatts;
  });
}

// --- Solar panels (part-level) ---

/** Discrete: append a solar panel (default output, identity orientation). */
export function addSolarPanel(): void {
  commitGameData('add solar panel', '', (g) => g.solarPanels.push(createSolarPanel()));
}
/** Discrete: remove solar panel at `index`. */
export function removeSolarPanel(index: number): void {
  if (index < 0 || index >= $part.get().gameData.solarPanels.length) return;
  commitGameData('remove solar panel', '', (g) => g.solarPanels.splice(index, 1));
}
/** Streaming: set a solar panel's output (W). Caller pushes undo on field focus. */
export function setSolarPanelOutput(index: number, outputWatts: number): void {
  if (index < 0 || index >= $part.get().gameData.solarPanels.length) return;
  mutateGameData((g) => {
    g.solarPanels[index].outputWatts = outputWatts;
  });
}
/** Streaming: set a solar panel's orientation rotation (Euler XYZ radians). */
export function setSolarPanelRotation(index: number, rotation: EulerXYZ): void {
  if (index < 0 || index >= $part.get().gameData.solarPanels.length) return;
  mutateGameData((g) => {
    g.solarPanels[index].transform.rotation = rotation;
  });
}

/** Discrete: add the part's single power consumer (defaults to a 60 W light switch). */
export function addPowerConsumer(): void {
  if ($part.get().gameData.powerConsumer) return;
  commitGameData('add consumer', '', (g) => {
    g.powerConsumer = createPowerConsumer();
  });
}
/** Discrete: remove the part's power consumer. */
export function removePowerConsumer(): void {
  if (!$part.get().gameData.powerConsumer) return;
  commitGameData('remove consumer', '', (g) => {
    g.powerConsumer = null;
  });
}
/** Streaming: set the consumer's draw (W). Caller pushes undo on field focus. */
export function setPowerConsumerWatts(consumedWatts: number): void {
  if (!$part.get().gameData.powerConsumer) return;
  mutateGameData((g) => {
    g.powerConsumer!.consumedWatts = consumedWatts;
  });
}
/** Discrete: toggle the consumer's `LightSwitch` (flight-toggleable light switch). */
export function setPowerConsumerLightSwitch(on: boolean): void {
  if (!$part.get().gameData.powerConsumer) return;
  commitGameData('toggle light switch', '', (g) => {
    g.powerConsumer!.lightSwitch = on;
  });
}
/** Discrete: toggle the consumer's `LightIsActive` (initial on/off state). */
export function setPowerConsumerLightIsActive(on: boolean): void {
  if (!$part.get().gameData.powerConsumer) return;
  commitGameData('toggle light active', '', (g) => {
    g.powerConsumer!.lightIsActive = on;
  });
}

// --- Coupling (decoupler / docking port / EVA door) — each references a connector ---

/** Discrete: enable/disable the decoupler. */
export function setDecouplerEnabled(enabled: boolean): void {
  commitGameData('decoupler', enabled ? 'on' : 'off', (g) => {
    g.decoupler = enabled
      ? (g.decoupler ?? { connectorId: '', force: DEFAULT_COUPLING_FORCE })
      : null;
  });
}
/** Discrete: bind the decoupler to a connector id. */
export function setDecouplerConnector(connectorId: string): void {
  commitGameData('decoupler connector', connectorId, (g) => {
    if (g.decoupler) g.decoupler.connectorId = connectorId;
  });
}
/** Streaming: set decoupler force (N). Caller pushes undo on field focus. */
export function setDecouplerForce(force: number): void {
  mutateGameData((g) => {
    if (g.decoupler) g.decoupler.force = force;
  });
}

/** Discrete: enable/disable the docking port. */
export function setDockingPortEnabled(enabled: boolean): void {
  commitGameData('docking port', enabled ? 'on' : 'off', (g) => {
    g.dockingPort = enabled
      ? (g.dockingPort ?? {
          connectorId: '',
          latchingKineticEnergyJ: DEFAULT_LATCHING_KINETIC_ENERGY_J,
          pushoffImpulseNs: DEFAULT_PUSHOFF_IMPULSE_NS,
        })
      : null;
  });
}
/** Discrete: bind the docking port to a connector id. */
export function setDockingPortConnector(connectorId: string): void {
  commitGameData('docking connector', connectorId, (g) => {
    if (g.dockingPort) g.dockingPort.connectorId = connectorId;
  });
}
/** Streaming: set docking port latching kinetic energy (J). Caller pushes undo on field focus. */
export function setDockingPortLatchingKineticEnergy(latchingKineticEnergyJ: number): void {
  mutateGameData((g) => {
    if (g.dockingPort) g.dockingPort.latchingKineticEnergyJ = latchingKineticEnergyJ;
  });
}
/** Streaming: set docking port push-off impulse (N·s). Caller pushes undo on field focus. */
export function setDockingPortPushoffImpulse(pushoffImpulseNs: number): void {
  mutateGameData((g) => {
    if (g.dockingPort) g.dockingPort.pushoffImpulseNs = pushoffImpulseNs;
  });
}

/** Discrete: enable/disable the EVA door. */
export function setEvaDoorEnabled(enabled: boolean): void {
  commitGameData('EVA door', enabled ? 'on' : 'off', (g) => {
    g.evaDoor = enabled ? (g.evaDoor ?? { connectorId: '' }) : null;
  });
}
/** Discrete: bind the EVA door to a connector id. */
export function setEvaDoorConnector(connectorId: string): void {
  commitGameData('EVA connector', connectorId, (g) => {
    if (g.evaDoor) g.evaDoor.connectorId = connectorId;
  });
}

// --- Engine controllers + gimbals + gas-generator modules (part-level) ---
//
// The controller is what makes a part an engine; it references rockets (by id) on
// specific SubPart instances. Gimbals overlay a placed instance and thrust-vector its
// nozzles. Part-level rockets/combustors/nozzles model gas-generator cycles.

function hasController(index: number): boolean {
  const c = $part.get().gameData.rocketControllers;
  return index >= 0 && index < c.length;
}

/** Discrete: append an engine (or thruster) controller. */
export function addRocketController(kind: RocketControllerKind = 'engine'): void {
  const id = uniqueModuleId(kind === 'thruster' ? 'Thruster' : 'Engine', [
    ...allEngineModuleIds($part.get()).controllers,
  ]);
  commitGameData('add controller', kind, (g) =>
    g.rocketControllers.push(createRocketController(id, kind)),
  );
}
/** Discrete: remove the controller at `index`. */
export function removeRocketController(index: number): void {
  if (!hasController(index)) return;
  commitGameData('remove controller', '', (g) => g.rocketControllers.splice(index, 1));
}
/** Discrete: patch a controller (id, kind, rocketRefs, control map). */
export function updateRocketController(index: number, patch: Partial<RocketController>): void {
  if (!hasController(index)) return;
  commitGameData('controller', '', (g) => {
    g.rocketControllers[index] = { ...g.rocketControllers[index], ...patch };
  });
}

/** Discrete: append a part-level gas-generator rocket. */
export function addPartRocket(): void {
  const id = uniqueModuleId('GasGenerator', allEngineModuleIds($part.get()).rockets);
  commitGameData('add rocket', '', (g) => g.rockets.push(createRocket(id)));
}
/** Discrete: remove the part-level rocket at `index`. */
export function removePartRocket(index: number): void {
  if (index < 0 || index >= $part.get().gameData.rockets.length) return;
  commitGameData('remove rocket', '', (g) => g.rockets.splice(index, 1));
}
/** Discrete: patch a part-level rocket's wiring. */
export function updatePartRocket(index: number, patch: Partial<Rocket>): void {
  if (index < 0 || index >= $part.get().gameData.rockets.length) return;
  commitGameData('rocket wiring', '', (g) => {
    g.rockets[index] = { ...g.rockets[index], ...patch };
  });
}

/** Discrete: append a part-level combustor (e.g. a gas-generator chamber). */
export function addPartCombustor(): void {
  const id = uniqueModuleId('GasGeneratorChamber', allEngineModuleIds($part.get()).combustors);
  commitGameData('add combustor', '', (g) => g.combustors.push(createCombustor(id)));
}
/** Discrete: remove the part-level combustor at `index`. */
export function removePartCombustor(index: number): void {
  if (index < 0 || index >= $part.get().gameData.combustors.length) return;
  commitGameData('remove combustor', '', (g) => g.combustors.splice(index, 1));
}
/** Streaming: patch a part-level combustor's numeric fields. Caller pushes undo on focus. */
export function updatePartCombustor(index: number, patch: Partial<Combustor>): void {
  if (index < 0 || index >= $part.get().gameData.combustors.length) return;
  mutateGameData((g) => {
    g.combustors[index] = { ...g.combustors[index], ...patch };
  });
}
/** Discrete: set a part-level combustor's reaction id + O/F mixture ratio (see setCombustorReaction). */
export function setPartCombustorReaction(
  index: number,
  reactionId: string,
  mixtureRatio: number | null,
): void {
  if (index < 0 || index >= $part.get().gameData.combustors.length) return;
  commitGameData('reaction', reactionId, (g) => {
    g.combustors[index].reactionId = reactionId;
    g.combustors[index].mixtureRatio = mixtureRatio;
  });
}

/** Discrete: replace a part-level combustor's `<FeedsFrom>` list (see setCombustorFeeds). */
export function setPartCombustorFeeds(index: number, feeds: readonly FeedSource[]): void {
  if (index < 0 || index >= $part.get().gameData.combustors.length) return;
  commitGameData('feed points', '', (g) => {
    g.combustors[index].feeds = [...feeds];
  });
}

/** Discrete: set a part-level combustor's `<Plumbing>` class (Bulk / Service). */
export function setPartCombustorPlumbing(index: number, plumbing: PlumbingClass): void {
  if (index < 0 || index >= $part.get().gameData.combustors.length) return;
  commitGameData('plumbing', plumbing, (g) => {
    g.combustors[index].plumbing = plumbing;
  });
}

// --- Solid rocket motors (KSA 2026.7.9): motor case + nozzle + stackable grain ---
//
// The solid analogue of combustor/DeLaval-nozzle/tank. A `<Rocket>` may bind ONLY solid
// parts or ONLY liquid ones (RocketTemplate.Create throws on a mix), so these get their
// own add/remove/update actions rather than options on the liquid ones.

/** Discrete: append a part-level `<SolidMotor>` (an SRB case). */
export function addPartSolidMotor(): void {
  const id = uniqueModuleId('MotorCore', allEngineModuleIds($part.get()).combustors);
  commitGameData('add solid motor', '', (g) => g.solidMotors.push(createSolidMotor(id)));
}
/** Discrete: remove the part-level solid motor at `index`. */
export function removePartSolidMotor(index: number): void {
  if (index < 0 || index >= $part.get().gameData.solidMotors.length) return;
  commitGameData('remove solid motor', '', (g) => g.solidMotors.splice(index, 1));
}
/** Streaming: patch a part-level solid motor's fields. Caller pushes undo on field focus. */
export function updatePartSolidMotor(index: number, patch: Partial<SolidMotor>): void {
  if (index < 0 || index >= $part.get().gameData.solidMotors.length) return;
  mutateGameData((g) => {
    g.solidMotors[index] = { ...g.solidMotors[index], ...patch };
  });
}
/** Discrete: replace a part-level solid motor's `<FeedsFrom>` list. */
export function setPartSolidMotorFeeds(index: number, feeds: readonly FeedSource[]): void {
  if (index < 0 || index >= $part.get().gameData.solidMotors.length) return;
  commitGameData('feed points', '', (g) => {
    g.solidMotors[index].feeds = [...feeds];
  });
}

/** Discrete: append a part-level `<SolidMotorNozzle>`. */
export function addPartSolidNozzle(): void {
  const id = uniqueModuleId('Nozzle', allEngineModuleIds($part.get()).nozzles);
  commitGameData('add solid nozzle', '', (g) => g.solidNozzles.push(createSolidMotorNozzle(id)));
}
/** Discrete: remove the part-level solid nozzle at `index`. */
export function removePartSolidNozzle(index: number): void {
  if (index < 0 || index >= $part.get().gameData.solidNozzles.length) return;
  commitGameData('remove solid nozzle', '', (g) => g.solidNozzles.splice(index, 1));
}
/** Streaming: patch a part-level solid nozzle's fields. Caller pushes undo on focus/drag-start. */
export function updatePartSolidNozzle(index: number, patch: Partial<SolidMotorNozzle>): void {
  if (index < 0 || index >= $part.get().gameData.solidNozzles.length) return;
  mutateGameData((g) => {
    g.solidNozzles[index] = { ...g.solidNozzles[index], ...patch };
  });
}

/** Discrete: append a part-level `<SolidGrainSegment>` (a feedable propellant container). */
export function addPartSolidGrainSegment(): void {
  const id = uniqueModuleId('Grain', allEngineModuleIds($part.get()).containers);
  commitGameData('add grain segment', '', (g) =>
    g.solidGrainSegments.push(createSolidGrainSegment(id)),
  );
}
/** Discrete: remove the part-level grain segment at `index`. */
export function removePartSolidGrainSegment(index: number): void {
  if (index < 0 || index >= $part.get().gameData.solidGrainSegments.length) return;
  commitGameData('remove grain segment', '', (g) => g.solidGrainSegments.splice(index, 1));
}
/** Streaming: patch a part-level grain segment's fields. Caller pushes undo on field focus. */
export function updatePartSolidGrainSegment(
  index: number,
  patch: Partial<SolidGrainSegment>,
): void {
  if (index < 0 || index >= $part.get().gameData.solidGrainSegments.length) return;
  mutateGameData((g) => {
    g.solidGrainSegments[index] = { ...g.solidGrainSegments[index], ...patch };
  });
}

/** Discrete: append a `<SolidMotor>` that travels with the given SubPart template. */
export function addSubPartSolidMotor(subPartTemplateId: string): void {
  const id = uniqueModuleId('MotorCore', allEngineModuleIds($part.get()).combustors);
  commitSubPartData('add solid motor', '', subPartTemplateId, (s) =>
    s.solidMotors.push(createSolidMotor(id)),
  );
}
/** Discrete: remove the SubPart-level solid motor at `index`. */
export function removeSubPartSolidMotor(subPartTemplateId: string, index: number): void {
  if (!hasSubPartItem(subPartTemplateId, 'solidMotors', index)) return;
  commitSubPartData('remove solid motor', '', subPartTemplateId, (s) =>
    s.solidMotors.splice(index, 1),
  );
}
/** Streaming: patch a SubPart-level solid motor's fields. Caller pushes undo on field focus. */
export function updateSubPartSolidMotor(
  subPartTemplateId: string,
  index: number,
  patch: Partial<SolidMotor>,
): void {
  if (!hasSubPartItem(subPartTemplateId, 'solidMotors', index)) return;
  mutateSubPartData(subPartTemplateId, (s) => {
    s.solidMotors[index] = { ...s.solidMotors[index], ...patch };
  });
}
/** Discrete: replace a SubPart-level solid motor's `<FeedsFrom>` list. */
export function setSubPartSolidMotorFeeds(
  subPartTemplateId: string,
  index: number,
  feeds: readonly FeedSource[],
): void {
  if (!hasSubPartItem(subPartTemplateId, 'solidMotors', index)) return;
  commitSubPartData('feed points', '', subPartTemplateId, (s) => {
    s.solidMotors[index].feeds = [...feeds];
  });
}

/** Discrete: append a `<SolidMotorNozzle>` that travels with the given SubPart template. */
export function addSubPartSolidNozzle(subPartTemplateId: string): void {
  const id = uniqueModuleId('Nozzle', allEngineModuleIds($part.get()).nozzles);
  commitSubPartData('add solid nozzle', '', subPartTemplateId, (s) =>
    s.solidNozzles.push(createSolidMotorNozzle(id)),
  );
}
/** Discrete: remove the SubPart-level solid nozzle at `index`. */
export function removeSubPartSolidNozzle(subPartTemplateId: string, index: number): void {
  if (!hasSubPartItem(subPartTemplateId, 'solidNozzles', index)) return;
  commitSubPartData('remove solid nozzle', '', subPartTemplateId, (s) =>
    s.solidNozzles.splice(index, 1),
  );
}
/** Streaming: patch a SubPart-level solid nozzle's fields. Caller pushes undo on focus/drag-start. */
export function updateSubPartSolidNozzle(
  subPartTemplateId: string,
  index: number,
  patch: Partial<SolidMotorNozzle>,
): void {
  if (!hasSubPartItem(subPartTemplateId, 'solidNozzles', index)) return;
  mutateSubPartData(subPartTemplateId, (s) => {
    s.solidNozzles[index] = { ...s.solidNozzles[index], ...patch };
  });
}

/** Discrete: append a `<SolidGrainSegment>` that travels with the given SubPart template. */
export function addSubPartSolidGrainSegment(subPartTemplateId: string): void {
  const id = uniqueModuleId('Grain', allEngineModuleIds($part.get()).containers);
  commitSubPartData('add grain segment', '', subPartTemplateId, (s) =>
    s.solidGrainSegments.push(createSolidGrainSegment(id)),
  );
}
/** Discrete: remove the SubPart-level grain segment at `index`. */
export function removeSubPartSolidGrainSegment(subPartTemplateId: string, index: number): void {
  if (!hasSubPartItem(subPartTemplateId, 'solidGrainSegments', index)) return;
  commitSubPartData('remove grain segment', '', subPartTemplateId, (s) =>
    s.solidGrainSegments.splice(index, 1),
  );
}
/** Streaming: patch a SubPart-level grain segment's fields. Caller pushes undo on field focus. */
export function updateSubPartSolidGrainSegment(
  subPartTemplateId: string,
  index: number,
  patch: Partial<SolidGrainSegment>,
): void {
  if (!hasSubPartItem(subPartTemplateId, 'solidGrainSegments', index)) return;
  mutateSubPartData(subPartTemplateId, (s) => {
    s.solidGrainSegments[index] = { ...s.solidGrainSegments[index], ...patch };
  });
}

// --- Consumer feed wiring (how a Part satisfies a placed SubPart's <FeedsFrom Parent>) ---

/** Discrete: append an empty wiring entry for the given consumer + placement scope. */
export function addConsumerFeedWiring(
  consumerId = '',
  subPartInstanceId: string | null = null,
): void {
  commitGameData('add feed wiring', consumerId, (g) =>
    g.consumerFeedWiring.push({ consumerId, subPartInstanceId, feeds: [] }),
  );
}

/** Discrete: remove the wiring entry at `index`. */
export function removeConsumerFeedWiring(index: number): void {
  if (index < 0 || index >= $part.get().gameData.consumerFeedWiring.length) return;
  commitGameData('remove feed wiring', '', (g) => g.consumerFeedWiring.splice(index, 1));
}

/** Discrete: retarget a wiring entry at the given consumer template id + placement scope. */
export function setConsumerFeedWiringTarget(
  index: number,
  consumerId: string,
  subPartInstanceId: string | null,
): void {
  if (index < 0 || index >= $part.get().gameData.consumerFeedWiring.length) return;
  commitGameData('feed wiring target', consumerId, (g) => {
    g.consumerFeedWiring[index].consumerId = consumerId;
    g.consumerFeedWiring[index].subPartInstanceId = subPartInstanceId;
  });
}

/** Discrete: replace a wiring entry's `<FeedsFrom>` list. */
export function setConsumerFeedWiringFeeds(index: number, feeds: readonly FeedSource[]): void {
  if (index < 0 || index >= $part.get().gameData.consumerFeedWiring.length) return;
  commitGameData('feed wiring points', '', (g) => {
    g.consumerFeedWiring[index].feeds = [...feeds];
  });
}

/**
 * Discrete: append an empty wiring entry for every placed SubPart consumer that defers
 * to its parent (`<FeedsFrom Parent="true"/>`) and has no matching entry — the one-click
 * fix for the most common authoring mistake. Without a wiring entry KSA logs *"Consumer X
 * feeds from its parent part, but Y has no ConsumerFeedWiring wiring for it"* and the
 * engine reaches no propellant. The user still has to pick each entry's feed points.
 *
 * Mirrors `PartTemplate.ResolveConsumerFeeds`'s lookup: an instance-scoped entry wins,
 * an unscoped one for the same consumer id is the fallback.
 */
export function autoWireUnwiredConsumers(): void {
  const wanted = unwiredConsumersOf($part.get());
  if (wanted.length === 0) return;
  commitGameData('auto-wire consumers', String(wanted.length), (g) => {
    for (const w of wanted) {
      g.consumerFeedWiring.push({
        consumerId: w.consumerId,
        subPartInstanceId: w.subPartInstanceId,
        feeds: [],
      });
    }
  });
}

/** Discrete: append a part-level nozzle. */
export function addPartNozzle(): void {
  const id = uniqueModuleId('Nozzle', allEngineModuleIds($part.get()).nozzles);
  commitGameData('add nozzle', '', (g) => g.nozzles.push(createNozzle(id)));
}
/** Discrete: remove the part-level nozzle at `index`. */
export function removePartNozzle(index: number): void {
  if (index < 0 || index >= $part.get().gameData.nozzles.length) return;
  commitGameData('remove nozzle', '', (g) => g.nozzles.splice(index, 1));
}
/** Streaming: patch a part-level nozzle's fields. Caller pushes undo on focus/drag-start. */
export function updatePartNozzle(index: number, patch: Partial<DeLavalNozzle>): void {
  if (index < 0 || index >= $part.get().gameData.nozzles.length) return;
  mutateGameData((g) => {
    g.nozzles[index] = { ...g.nozzles[index], ...patch };
  });
}

/** Streaming: set the gimbal limits on a placed SubPart instance, creating the gimbal if absent. */
export function setGimbal(
  subPartInstanceId: string,
  patch: Partial<Omit<Gimbal, 'subPartInstanceId'>>,
): void {
  if (!subPartInstanceId) return;
  mutateGameData((g) => {
    const existing = g.gimbals.find((gm) => gm.subPartInstanceId === subPartInstanceId);
    if (existing) Object.assign(existing, patch);
    else g.gimbals.push({ ...createGimbal(subPartInstanceId), ...patch });
  });
}
/** Discrete: remove the gimbal on a placed SubPart instance. */
export function removeGimbal(subPartInstanceId: string): void {
  if (!$part.get().gameData.gimbals.some((g) => g.subPartInstanceId === subPartInstanceId)) return;
  commitGameData('remove gimbal', '', (g) => {
    g.gimbals = g.gimbals.filter((gm) => gm.subPartInstanceId !== subPartInstanceId);
  });
}

/**
 * Discrete (one undo step): defines a complete, fires-in-game engine on a SubPart
 * template — a wired Combustor + DeLavalNozzle + Rocket on its SubPartGameData, plus
 * a part-level RocketEngineController referencing that rocket on the given placement
 * instance, and the "Engines" editor tag. The minimum to go from a reused mesh to a
 * working engine; the designer then tunes the physics/geometry. Returns the new
 * thrust-chamber's combustor id (for selection), or null if the template is invalid.
 */
export function addEngine(
  subPartTemplateId: string,
  instanceId: string | null,
  kind: RocketControllerKind = 'engine',
): string | null {
  if (!subPartTemplateId) return null;
  pushUndo('define engine', lastSegmentLower(subPartTemplateId));
  const part = clone($part.get());
  const ids = allEngineModuleIds(part);
  const combId = uniqueModuleId('ThrustChamber', ids.combustors);
  const nozId = uniqueModuleId('Nozzle', ids.nozzles);
  const rocketId = uniqueModuleId('Engine', ids.rockets);
  const ctrlId = uniqueModuleId(kind === 'thruster' ? 'Thruster' : 'Engine', ids.controllers);

  const spd = getOrCreateSubPartData(part, subPartTemplateId);
  spd.combustors.push(createCombustor(combId));
  spd.nozzles.push(createNozzle(nozId));
  spd.rockets.push(createRocket(rocketId, combId, [nozId]));

  const controller = createRocketController(ctrlId, kind, [rocketId]);
  if (instanceId) controller.rocketRefs[0].subPartInstanceId = instanceId;
  part.gameData.rocketControllers.push(controller);

  const tag = kind === 'thruster' ? 'RCS' : 'Engines';
  if (!part.editorTags.includes(tag)) part.editorTags.push(tag);

  $part.set(part);
  return combId;
}

/**
 * Discrete (one undo step): defines an "SRB (approximate)" — a data-only solid-rocket
 * fake. It's a normal engine pinned to {@link Combustor.minimumThrottle}=1 (so it
 * can't be throttled, like a solid) burning KSA 2026.7.5's APCP solid-propellant
 * reaction, with a sealed internal propellant Tank on the same SubPart, so it's
 * self-contained. KSA still has no solid-motor hardware, so this CANNOT reproduce
 * a real SRB: thrust is flat (no grain-regression thrust-vs-time curve), it stays
 * shutdown-able / re-ignitable, and the propellant drains like a liquid (CoM shifts).
 * See analysis/KSA_ENGINE_DETAILS.md §10. Returns the combustor id, or null.
 */
export function addSrbEngine(subPartTemplateId: string, instanceId: string | null): string | null {
  if (!subPartTemplateId) return null;
  pushUndo('define SRB', lastSegmentLower(subPartTemplateId));
  const part = clone($part.get());
  const ids = allEngineModuleIds(part);
  const combId = uniqueModuleId('SolidMotor', ids.combustors);
  const nozId = uniqueModuleId('Nozzle', ids.nozzles);
  const rocketId = uniqueModuleId('SRB', ids.rockets);
  const ctrlId = uniqueModuleId('SRB', ids.controllers);

  const spd = getOrCreateSubPartData(part, subPartTemplateId);
  const combustor = createCombustor(combId);
  combustor.minimumThrottle = 1; // fixed (non-throttleable), the one thing the fake gets right
  combustor.reactionId = 'APCP'; // Core's solid-propellant FixedReaction (2026.7.5)
  combustor.mixtureRatio = null; // fixed reactions take no O/F ratio
  spd.combustors.push(combustor);
  spd.nozzles.push(createNozzle(nozId));
  spd.rockets.push(createRocket(rocketId, combId, [nozId]));
  // A sealed internal propellant reservoir (modeled as a liquid tank — the limitation).
  spd.tanks.push(createTank());

  const controller = createRocketController(ctrlId, 'engine', [rocketId]);
  if (instanceId) controller.rocketRefs[0].subPartInstanceId = instanceId;
  part.gameData.rocketControllers.push(controller);
  if (!part.editorTags.includes('Engines')) part.editorTags.push('Engines');

  $part.set(part);
  return combId;
}

// --- Custom reactions (user-authored propellants) ---

/** Discrete: add a user-authored reaction (a custom propellant). */
export function addCustomReaction(reaction: CustomReaction): void {
  pushUndo('add propellant', reaction.name || reaction.id);
  const part = clone($part.get());
  part.customReactions.push(reaction);
  $part.set(part);
}
/** Discrete: remove the custom reaction with the given id. */
export function removeCustomReaction(id: string): void {
  if (!$part.get().customReactions.some((p) => p.id === id)) return;
  pushUndo('remove propellant', id);
  const part = clone($part.get());
  part.customReactions = part.customReactions.filter((p) => p.id !== id);
  $part.set(part);
}
/** Streaming: patch a custom reaction (name / category / reactants / LUT). Caller pushes undo on focus. */
export function updateCustomReaction(id: string, patch: Partial<CustomReaction>): void {
  const part = clone($part.get());
  const idx = part.customReactions.findIndex((p) => p.id === id);
  if (idx < 0) return;
  part.customReactions[idx] = { ...part.customReactions[idx], ...patch };
  $part.set(part);
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
  let max = 0;
  for (const l of part.layers) {
    const m = /^layer(\d+)$/.exec(l.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `layer${max + 1}`;
}

/** Creates a layer (name trimmed; blank → "Layer N"), makes it active, returns its id. */
export function createLayer(name: string): string {
  const layerCurrent = $part.get();
  const layerTrimmed = name.trim() || `Layer ${layerCurrent.layers.length + 1}`;
  pushUndo('add layer', layerTrimmed);
  const part = clone(layerCurrent);
  const id = nextLayerId(part);
  const trimmed = layerTrimmed;
  part.layers.push({ id, name: trimmed });
  $part.set(part);
  $activeLayerId.set(id);
  return id;
}

/** Renames a layer. No-op when unchanged/blank/unknown. Discrete (commit once). */
export function renameLayer(id: string, name: string): void {
  const current = $part.get();
  const layer = current.layers.find((l) => l.id === id);
  const trimmed = name.trim();
  if (!layer || !trimmed || layer.name === trimmed) return;
  pushUndo('rename layer', `${layer.name} → ${trimmed}`);
  const part = clone(current);
  const target = part.layers.find((l) => l.id === id)!;
  target.name = trimmed;
  $part.set(part);
}

/**
 * Sets (or clears, with `undefined`) a layer's Outliner swatch. Document state — the color
 * rides the project snapshot and the undo stack — but purely editor-facing: no serializer
 * reads it (design: design-build-mode.md §2.3.1). No-op for an unknown layer or a no-change
 * write, so re-picking the current swatch never grows the history.
 */
export function setLayerColor(id: string, color: LayerColor | undefined): void {
  const current = $part.get();
  const layer = current.layers.find((l) => l.id === id);
  if (!layer || layer.color === color) return;
  pushUndo('layer color', layer.name);
  const part = clone(current);
  part.layers = part.layers.map((l) =>
    l.id === id ? (color === undefined ? { id: l.id, name: l.name } : { ...l, color }) : l,
  );
  $part.set(part);
}

/**
 * Duplicates a layer AND everything movable on it — SubParts, connectors, colliders — in
 * ONE undo step (design: design-build-mode.md §2.2 ⋮ menu). The copy is inserted directly
 * after the source, becomes the active layer, and its clones become the selection.
 *
 * Built-in layers are refused: Default is the fallback every delete/move lands on, and the
 * three entity-only layers are pinned (their kinds may never live anywhere else), so a
 * second copy of either could not hold what its name promises. Returns the new layer id, or
 * null when nothing was done.
 *
 * Ids come from the SAME generators {@link duplicateSelected} uses, so a duplicated layer
 * and a duplicated selection can never mint colliding ids.
 */
export function duplicateLayer(id: string): string | null {
  const current = $part.get();
  if (BUILT_IN_LAYER_IDS.includes(id)) return null;
  const sourceIndex = current.layers.findIndex((l) => l.id === id);
  if (sourceIndex < 0) return null;
  const source = current.layers[sourceIndex];
  pushUndo('duplicate layer', source.name);

  const part = clone(current);
  const newId = nextLayerId(part);
  const copy: Layer = source.color
    ? { id: newId, name: `${source.name} copy`, color: source.color }
    : { id: newId, name: `${source.name} copy` };
  part.layers.splice(sourceIndex + 1, 0, copy);

  const copies: SelectionRef[] = [];
  // Snapshot the source rows first: the loops push onto the very arrays they read.
  for (const src of part.placements.filter((p) => p.layerId === id)) {
    const base = lastSegmentLower(src.subPartTemplateId);
    const count = part.placements.filter(
      (p) => p.subPartTemplateId === src.subPartTemplateId,
    ).length;
    const instanceId = `${base}_${count + 1}`;
    part.placements.push({
      instanceId,
      subPartTemplateId: src.subPartTemplateId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      layerId: newId,
    });
    copies.push({ kind: 'subpart', id: instanceId });
  }
  for (const src of part.connectors.filter((c) => c.layerId === id)) {
    const connectorId = nextConnectorId(part);
    part.connectors.push({
      id: connectorId,
      position: { ...src.position },
      rotation: { ...src.rotation },
      scale: { ...src.scale },
      flags: [...src.flags],
      capabilities: [...src.capabilities],
      siblingIds: [...src.siblingIds],
      layerId: newId,
    });
    copies.push({ kind: 'connector', id: connectorId });
  }
  for (const src of part.colliders.filter((c) => c.layerId === id)) {
    const colliderId = nextColliderId(part);
    part.colliders.push({ ...structuredClone(src), id: colliderId, layerId: newId });
    copies.push({ kind: 'collider', id: colliderId });
  }

  $part.set(part);
  $activeLayerId.set(newId);
  select(copies);
  return newId;
}

export interface DeleteLayerOptions {
  /** 'delete-items' removes the layer's entities; 'move-items' reassigns them. */
  mode: 'delete-items' | 'move-items';
  /** Destination layer for 'move-items' (falls back to Default if missing/invalid). */
  targetLayerId?: string;
}

/**
 * Deletes a layer. The built-in layers are protected (no-op). Entities in the layer —
 * placements, connectors AND colliders, every kind that can live on an ordinary layer —
 * are either removed ('delete-items') or moved to another layer ('move-items').
 */
export function deleteLayer(id: string, opts: DeleteLayerOptions): void {
  if (BUILT_IN_LAYER_IDS.includes(id)) return;
  const current = $part.get();
  if (!current.layers.some((l) => l.id === id)) return;
  pushUndo('delete layer', current.layers.find((l) => l.id === id)?.name ?? id);
  const part = clone(current);
  if (opts.mode === 'move-items') {
    const valid =
      opts.targetLayerId &&
      opts.targetLayerId !== id &&
      !ENTITY_ONLY_LAYER_IDS.includes(opts.targetLayerId) &&
      part.layers.some((l) => l.id === opts.targetLayerId);
    const target = valid ? opts.targetLayerId! : DEFAULT_LAYER_ID;
    for (const p of part.placements) if (p.layerId === id) p.layerId = target;
    for (const c of part.connectors) if (c.layerId === id) c.layerId = target;
    for (const c of part.colliders) if (c.layerId === id) c.layerId = target;
  } else {
    part.placements = part.placements.filter((p) => p.layerId !== id);
    part.connectors = part.connectors.filter((c) => c.layerId !== id);
    part.colliders = part.colliders.filter((c) => c.layerId !== id);
  }
  part.layers = part.layers.filter((l) => l.id !== id);
  $part.set(part);
  if ($activeLayerId.get() === id) $activeLayerId.set(DEFAULT_LAYER_ID);
  clampSelection();
}

/**
 * Removes every entity on a layer WITHOUT deleting the layer itself. Used by the
 * protected built-in Kittens layer, whose delete button clears its contents instead of
 * removing the (undeletable) layer. Discrete mutation → one undo step. No-op when the
 * layer is already empty.
 */
export function clearLayer(id: string): void {
  const current = $part.get();
  const onLayer = (e: { layerId: string }) => e.layerId === id;
  const total =
    current.placements.filter(onLayer).length +
    current.connectors.filter(onLayer).length +
    current.colliders.filter(onLayer).length +
    current.kittens.filter(onLayer).length;
  if (total === 0) return;
  pushUndo('clear layer', current.layers.find((l) => l.id === id)?.name ?? id);
  const part = clone(current);
  part.placements = part.placements.filter((p) => p.layerId !== id);
  part.connectors = part.connectors.filter((c) => c.layerId !== id);
  part.colliders = part.colliders.filter((c) => c.layerId !== id);
  part.kittens = part.kittens.filter((k) => k.layerId !== id);
  $part.set(part);
  clampSelection();
}

/** Reorders layers to `orderedIds` (must be a permutation of the existing ids). */
export function reorderLayers(orderedIds: readonly string[]): void {
  const current = $part.get();
  if (orderedIds.length !== current.layers.length) return;
  const ids = new Set(current.layers.map((l) => l.id));
  if (!orderedIds.every((lid) => ids.has(lid))) return;
  pushUndo('reorder layers');
  const part = clone(current);
  const byId = new Map(part.layers.map((l) => [l.id, l] as const));
  part.layers = orderedIds.map((lid) => byId.get(lid)!);
  $part.set(part);
}

/** The `EditingPart` list holding a given layerable kind, as mutable rows. */
function layerableList(part: EditingPart, kind: LayerableKind): { layerId: string }[] {
  return kind === 'subpart'
    ? part.placements
    : kind === 'connector'
      ? part.connectors
      : part.colliders;
}

/** True when `layerId` is a layer ordinary entities may be moved onto. */
function isMoveTarget(part: EditingPart, layerId: string): boolean {
  return !ENTITY_ONLY_LAYER_IDS.includes(layerId) && part.layers.some((l) => l.id === layerId);
}

/**
 * Moves a single entity — SubPart, connector or collider — to another layer (used by
 * the per-row context menu). Discrete mutation → records undo. No-op for an unknown
 * index/layer, one of the entity-only built-in layers, or when it is already there.
 */
export function moveEntityToLayer(kind: LayerableKind, index: number, layerId: string): void {
  const current = $part.get();
  if (!isMoveTarget(current, layerId)) return;
  const entity = layerableList(current, kind)[index];
  if (!entity || entity.layerId === layerId) return;
  const name =
    kind === 'subpart'
      ? current.placements[index].instanceId
      : kind === 'connector'
        ? current.connectors[index].id
        : current.colliders[index].id;
  pushUndo(
    'move to layer',
    `${name} → ${current.layers.find((l) => l.id === layerId)?.name ?? layerId}`,
  );
  const part = clone(current);
  layerableList(part, kind)[index].layerId = layerId;
  $part.set(part);
}

/**
 * Moves every selected SubPart, connector and collider to `layerId` in a single undo
 * step (pinned kinds — IVA seats, lights, kittens — are left where they are). Selection
 * is preserved: editing an entity's layerId doesn't reorder its list, so the selected
 * indices keep pointing at the same entities (and the Assets list shows all layers, so
 * they stay visible without changing the active layer). No-op for the entity-only
 * built-in layers, an unknown layer, or a selection with nothing movable in it.
 */
export function moveSelectionToLayer(layerId: string): void {
  const current = $part.get();
  if (!isMoveTarget(current, layerId)) return;
  const sub = selectedIndicesOf(current, 'subpart');
  const con = selectedIndicesOf(current, 'connector');
  const col = selectedIndicesOf(current, 'collider');
  const total = sub.length + con.length + col.length;
  if (total === 0) return;
  const destLayerName = current.layers.find((l) => l.id === layerId)?.name ?? layerId;
  const only =
    total === 1
      ? ((sub.length
          ? current.placements[sub[0]]?.instanceId
          : con.length
            ? current.connectors[con[0]]?.id
            : current.colliders[col[0]]?.id) ?? '')
      : null;
  pushUndo(
    'move to layer',
    only != null
      ? `${only} → ${destLayerName}`
      : `${entityCountLabel(sub.length, con.length, 0, col.length)} → ${destLayerName}`,
  );
  const part = clone(current);
  for (const [kind, indices] of [
    ['subpart', sub],
    ['connector', con],
    ['collider', col],
  ] as const) {
    const list = layerableList(part, kind);
    for (const i of indices) {
      const entity = list[i];
      if (entity) entity.layerId = layerId;
    }
  }
  $part.set(part);
}

/**
 * True when a placed template is a custom mesh that exports through KSA's translucent
 * `<PartModelGlass>` — a transparent (visor) kitten submesh in a glass surface mode, or an
 * imported glTF mesh flagged transparent. Mirrors the DOCUMENT-side half of the `glass` bit
 * modExport computes when it plans a custom SubPart.
 *
 * HONEST LIMIT: this only sees what the document itself knows, i.e. custom meshes. A BUILT-IN
 * template's glass-ness lives in the catalog, which `editorStore` does not (and must not)
 * import — the UI filters those out before calling, and this is only the backstop for what it
 * can prove.
 *
 * Exported so the menus that drive {@link setPlacementsInternal} can DISABLE the toggle instead
 * of silently dropping the write.
 */
export function isGlassTemplate(part: EditingPart, templateId: string): boolean {
  const mesh = part.customMeshes.find((m) => m.subPartId === templateId);
  if (!mesh) return false;
  if (mesh.imported?.transparent) return true;
  // A transparent kitten submesh defaults to the 'glass' surface; only the opaque 'glow' mode
  // leaves the glass path. 'glassGlow' is glass WHOLE (its emissive layer is split off under a
  // synthetic id the document holds no flag for), so it counts as glass here too.
  if (!mesh.kitten?.transparent) return false;
  const surface = mesh.surface ?? 'glass';
  return surface === 'glass' || surface === 'glassGlow';
}

/**
 * Discrete: sets the `<Internal>` (interior-only) flag on the DISTINCT SubPart templates of the
 * given placements. KSA's `<Internal>` lives on the template's `<PartModel>`, so this affects
 * every placement of each template — the UI says so.
 *
 * Templates whose geometry exports as `<PartModelGlass>` are skipped (KSA glass has no such
 * field); the caller filters them out so the menu can disable them, and this is the backstop.
 *
 * The explicit boolean is written UNCONDITIONALLY — there is no "delete the key when it matches
 * the inherited value", because that would need the catalog inside `editorStore`, which imports
 * no catalog today. A redundant `true` costs nothing: `buildExportVariantMap`'s `internalDiffers`
 * test collapses it to zero XML change.
 */
export function setPlacementsInternal(indices: readonly number[], internal: boolean): void {
  const current = $part.get();
  const templateIds: string[] = [];
  for (const i of indices) {
    const placement = current.placements[i];
    if (!placement) continue; // out-of-range index — ignore, like the neighbouring mutators
    const templateId = placement.subPartTemplateId;
    if (templateIds.includes(templateId)) continue; // one write per DISTINCT template
    if (isGlassTemplate(current, templateId)) continue;
    templateIds.push(templateId);
  }
  if (templateIds.length === 0) return;
  pushUndo(
    internal ? 'interior on' : 'interior off',
    templateIds.length === 1 ? templateIds[0] : `${templateIds.length} templates`,
  );
  const part = clone(current);
  for (const templateId of templateIds) part.internalFlags[templateId] = internal;
  $part.set(part);
}

/** Sets the active layer (where new items land). No-op for unknown ids. Ephemeral. */
export function setActiveLayer(id: string): void {
  if ($part.get().layers.some((l) => l.id === id)) $activeLayerId.set(id);
}

/**
 * Selects every entity in a layer — all of its SubParts, connectors, kittens,
 * colliders, IVA seats and lights at once (selection can span kinds). Clears when
 * the layer is empty.
 */
export function selectLayerEntities(id: string): void {
  const part = $part.get();
  const refs: SelectionRef[] = [];
  for (const kind of KIND_ORDER) {
    const list = entityList(part, kind);
    for (let i = 0; i < list.length; i++) {
      if (list[i].layerId !== id) continue;
      const ref = refAt(part, kind, i);
      if (ref) refs.push(ref);
    }
  }
  select(refs);
}

/**
 * Drops any selected entities belonging to `layerId` (used when a layer is locked).
 *
 * ONE filter over `$selection` — the v1 six-kind hand-expansion (and its "MUST cover every
 * kind" hazard: a kind left un-pruned kept the gizmo attached to an entity on a layer the
 * user had just locked) died with the index model.
 */
export function deselectLayer(layerId: string): void {
  const part = $part.get();
  setSelectionRefs($selection.get().filter((r) => refLayerId(part, r) !== layerId));
}

export function newPart(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  refreshHistoryFlags();
  $part.set(createEmptyPart());
  clearSelection();
  $activeLayerId.set(DEFAULT_LAYER_ID);
}

export function setToolMode(mode: ToolMode): void {
  $toolMode.set(mode);
}

export function setSnap(snap: SnapSettings): void {
  $snap.set(snap);
}

// ---------------------------------------------------------------------------
// Nudge plane / step actions (persisted global tool prefs — not in undo history).
// ---------------------------------------------------------------------------

const NUDGE_AXIS_ORDER: readonly NudgeAxis[] = ['x', 'y', 'z'];
/**
 * Floor on the nudge step — also the finest increment granularity (1 mm). The
 * step adapts its increment to its own magnitude (see below) but never goes finer
 * than this, which also bounds it to 3 decimals for clean display/rounding.
 */
export const MIN_NUDGE_STEP = 0.001;

export function setNudgeAxis(axis: NudgeAxis): void {
  $nudgeAxis.set(axis);
}

/**
 * Cycles the nudge axis through x → y → z (the ←/→ hotkeys and the status-bubble
 * click). `direction` 1 steps forward, -1 backward; wraps around either way.
 */
export function cycleNudgeAxis(direction: 1 | -1 = 1): void {
  const order = NUDGE_AXIS_ORDER;
  const i = order.indexOf($nudgeAxis.get());
  $nudgeAxis.set(order[(i + direction + order.length) % order.length]);
}

/** Largest power of ten ≤ v (v > 0) — the increment for v's current decade. */
function decade(v: number): number {
  let d = 1;
  if (v >= 1) {
    while (d * 10 <= v * (1 + 1e-9)) d *= 10;
  } else {
    while (d > v * (1 + 1e-9)) d /= 10;
  }
  return d;
}

/** Rounds to 3 decimals ({@link MIN_NUDGE_STEP} granularity) to kill float drift. */
function roundStep(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Increases the nudge step by one decade-sized increment (the M hotkey). The
 * increment tracks the value's magnitude — 0.1→0.2…0.9→1→2 — and below a decade
 * boundary it's correspondingly finer (0.09→0.1 via 0.01). Symmetric with
 * {@link decrementNudgeStep}.
 */
export function incrementNudgeStep(): void {
  const v = $nudgeStep.get();
  $nudgeStep.set(roundStep(v + decade(v)));
}

/**
 * Decreases the nudge step by one decade-sized increment (Shift+M). At the bottom
 * of a decade the increment refines to 1/10 (0.1→0.09, 0.01→0.009), clamped at
 * {@link MIN_NUDGE_STEP}.
 */
export function decrementNudgeStep(): void {
  const v = $nudgeStep.get();
  const d = decade(v);
  // When v sits at its decade floor (v ≈ d), step down by the finer 1/10 increment.
  const increment = Math.abs(v - d) < d * 1e-6 ? d / 10 : d;
  $nudgeStep.set(Math.max(MIN_NUDGE_STEP, roundStep(v - increment)));
}

// ---------------------------------------------------------------------------
// Rotate axes / step actions (persisted global tool prefs — not in undo history).
// ---------------------------------------------------------------------------

/** The three rotate key pairs (W/S, A/D, Q/E), in keyboard order. */
export const ROTATE_PAIRS = ['ws', 'ad', 'qe'] as const;
export type RotatePair = (typeof ROTATE_PAIRS)[number];

/** Each pair's axis at offset 0; R rotates the whole mapping forward (x→y→z). */
const ROTATE_BASE_AXIS: Record<RotatePair, NudgeAxis> = { ws: 'x', ad: 'y', qe: 'z' };

export const MIN_ROTATE_STEP = 15;
export const MAX_ROTATE_STEP = 180;
const ROTATE_STEP_INCREMENT = 15;

/**
 * The world axis a pair rotates about at an explicit offset — the PURE form.
 *
 * React render bodies must use this one with the offset they subscribed to. Calling the
 * store-reading {@link rotatePairAxis} during render is not idempotent for the same props
 * and state, so React Compiler is free to cache the result forever — which is exactly what
 * it did to the status bar's rotate chip (the arrows stopped re-tinting on `R`).
 */
export function rotatePairAxisAt(pair: RotatePair, offset: number): NudgeAxis {
  const order = NUDGE_AXIS_ORDER;
  const base = order.indexOf(ROTATE_BASE_AXIS[pair]);
  return order[(base + offset) % order.length];
}

/** The world axis a pair currently rotates about, given {@link $rotateAxisOffset}. */
export function rotatePairAxis(pair: RotatePair): NudgeAxis {
  return rotatePairAxisAt(pair, $rotateAxisOffset.get());
}

/**
 * Cycles every pair's axis assignment together (the R hotkey). `direction` 1 steps
 * the mapping forward (x→y→z), -1 backward; wraps around either way.
 */
export function cycleRotateAxes(direction: 1 | -1 = 1): void {
  const n = NUDGE_AXIS_ORDER.length;
  $rotateAxisOffset.set(($rotateAxisOffset.get() + direction + n) % n);
}

/** Increases the rotate step by 15°, clamped at {@link MAX_ROTATE_STEP} (`]`). */
export function increaseRotateStep(): void {
  $rotateStep.set(Math.min(MAX_ROTATE_STEP, $rotateStep.get() + ROTATE_STEP_INCREMENT));
}

/** Decreases the rotate step by 15°, clamped at {@link MIN_ROTATE_STEP} (`[`). */
export function decreaseRotateStep(): void {
  $rotateStep.set(Math.max(MIN_ROTATE_STEP, $rotateStep.get() - ROTATE_STEP_INCREMENT));
}
