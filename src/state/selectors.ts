import { computed } from 'nanostores';
import {
  $activeLayerId,
  $part,
  $selection,
  entityIndexOf,
  KIND_ORDER,
  selectedTransformRefs,
  type EntityKind,
  type SelectedTransformRef,
  type SelectionRef,
} from './editorStore';
import type {
  Connector,
  IvaSeat,
  Layer,
  PartCollider,
  PartLight,
  SubPartPlacement,
} from '../ksa/types';

/**
 * Derived views over the ONE stable-id selection atom (design:
 * `plans/flexo_v2/design/design-build-mode.md` §1.1 "Derived compatibility views").
 *
 * Every consumer reads the selection THROUGH this module rather than partitioning
 * `$selection` itself — that is what let the six per-kind index atoms disappear without
 * touching the panels that consume them.
 */

/** The currently selected placement when exactly one SubPart is selected, else null. */
export const $selectedPlacement = computed(
  [$part, $selection],
  (part, sel): SubPartPlacement | null => {
    const subs = sel.filter((r) => r.kind === 'subpart');
    if (subs.length !== 1) return null;
    return part.placements.find((p) => p.instanceId === subs[0].id) ?? null;
  },
);

/** A selected SubPart paired with its index. */
export interface SelectedPlacement {
  index: number;
  placement: SubPartPlacement;
}

/** All currently selected SubParts (index + placement), in selection order. */
export const $selectedPlacements = computed([$part, $selection], (part, sel): SelectedPlacement[] =>
  sel.flatMap((ref) => {
    if (ref.kind !== 'subpart') return [];
    const index = entityIndexOf(part, 'subpart', ref.id);
    return index < 0 ? [] : [{ index, placement: part.placements[index] }];
  }),
);

/** True when anything (SubParts, connectors, colliders, IVA seats, lights, kittens) is selected. */
export const $hasSelection = computed($selection, (sel): boolean => sel.length > 0);

/**
 * True when more than one entity is selected (across any kinds) — the trigger for
 * the multi-select toolbar and the bulk transform panel.
 */
export const $hasMultiSelection = computed($selection, (sel): boolean => sel.length > 1);

/** Total number of selected entities across all kinds. */
export const $selectionCount = computed($selection, (sel): number => sel.length);

/**
 * The selection partitioned by kind, in selection order. All six keys are always present
 * (an unselected kind is an empty array), so consumers can index it without a guard —
 * this is the design's `$selectedByKind(kind)`.
 */
export const $selectionByKind = computed(
  $selection,
  (sel): Record<EntityKind, readonly SelectionRef[]> => {
    const out = {} as Record<EntityKind, SelectionRef[]>;
    for (const kind of KIND_ORDER) out[kind] = [];
    for (const ref of sel) out[ref.kind].push(ref);
    return out;
  },
);

/**
 * The PRIMARY ref of one kind — the last of that kind added to the selection, or null.
 * The design's `$primaryOf(kind)`; replaces the six `$selected*Index` atoms.
 */
export function primaryOf(kind: EntityKind): SelectionRef | null {
  const sel = $selection.get();
  for (let i = sel.length - 1; i >= 0; i--) if (sel[i].kind === kind) return sel[i];
  return null;
}

/**
 * Every selected entity with its current transform, in {@link KIND_ORDER}. Drives the
 * bulk transform panel for a unified multi-selection.
 */
export const $selectedRefs = computed([$part, $selection], (): SelectedTransformRef[] =>
  selectedTransformRefs(),
);

/**
 * The single selected entity as a discriminated union, non-null ONLY when EXACTLY ONE
 * entity is selected (the v1 per-kind mutual-exclusion assumption is gone with the index
 * atoms). Carries the stable `id` on every branch; `index` is transitional (TransformInspector
 * still indexes into `$part` until 5B dissolves it).
 */
export type SelectedEntity =
  | { kind: 'subpart'; id: string; index: number; placement: SubPartPlacement }
  | { kind: 'connector'; id: string; index: number; connector: Connector }
  | { kind: 'collider'; id: string; index: number; collider: PartCollider }
  | { kind: 'ivaSeat'; id: string; index: number; seat: IvaSeat }
  | { kind: 'light'; id: string; index: number; light: PartLight };
// TODO(P5B.13): add the 'kitten' branch when KittenInspector lands (v1 parity — the v1
// union has none, so a lone selected kitten shows no per-entity panel today).

export const $selectedEntity = computed([$part, $selection], (part, sel): SelectedEntity | null => {
  if (sel.length !== 1) return null;
  const ref = sel[0];
  const index = entityIndexOf(part, ref.kind, ref.id);
  if (index < 0) return null;
  switch (ref.kind) {
    case 'subpart':
      return { kind: 'subpart', id: ref.id, index, placement: part.placements[index] };
    case 'connector':
      return { kind: 'connector', id: ref.id, index, connector: part.connectors[index] };
    case 'collider':
      return { kind: 'collider', id: ref.id, index, collider: part.colliders[index] };
    case 'ivaSeat':
      return { kind: 'ivaSeat', id: ref.id, index, seat: part.ivaSeats[index] };
    case 'light':
      return { kind: 'light', id: ref.id, index, light: part.lights[index] };
    case 'kitten':
      return null;
  }
});

/**
 * A layer paired with how many entities of each kind belong to it. `id` mirrors
 * `layer.id` so the object can be used directly as a react-aria collection item
 * (the collection builder reads `item.id`/`item.key` to determine the row key).
 */
export interface LayerSummary {
  id: string;
  layer: Layer;
  subParts: number;
  connectors: number;
  kittens: number;
  ivaSeats: number;
  colliders: number;
  lights: number;
}

/** Every layer (in display order) with its per-kind entity counts. */
export const $layerSummaries = computed([$part], (part): LayerSummary[] => {
  const subCounts = new Map<string, number>();
  const conCounts = new Map<string, number>();
  const kitCounts = new Map<string, number>();
  const seatCounts = new Map<string, number>();
  const colCounts = new Map<string, number>();
  const ligCounts = new Map<string, number>();
  for (const p of part.placements) subCounts.set(p.layerId, (subCounts.get(p.layerId) ?? 0) + 1);
  for (const c of part.connectors) conCounts.set(c.layerId, (conCounts.get(c.layerId) ?? 0) + 1);
  for (const k of part.kittens) kitCounts.set(k.layerId, (kitCounts.get(k.layerId) ?? 0) + 1);
  for (const s of part.ivaSeats) seatCounts.set(s.layerId, (seatCounts.get(s.layerId) ?? 0) + 1);
  for (const c of part.colliders) colCounts.set(c.layerId, (colCounts.get(c.layerId) ?? 0) + 1);
  for (const l of part.lights) ligCounts.set(l.layerId, (ligCounts.get(l.layerId) ?? 0) + 1);
  return part.layers.map((layer) => ({
    id: layer.id,
    layer,
    subParts: subCounts.get(layer.id) ?? 0,
    connectors: conCounts.get(layer.id) ?? 0,
    kittens: kitCounts.get(layer.id) ?? 0,
    ivaSeats: seatCounts.get(layer.id) ?? 0,
    colliders: colCounts.get(layer.id) ?? 0,
    lights: ligCounts.get(layer.id) ?? 0,
  }));
});

/** The active layer object (where new items land), or null if none resolves. */
export const $activeLayer = computed(
  [$part, $activeLayerId],
  (part, activeId): Layer | null => part.layers.find((l) => l.id === activeId) ?? null,
);
