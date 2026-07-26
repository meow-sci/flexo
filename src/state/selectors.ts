import { computed } from 'nanostores'
import {
  $activeLayerId,
  $part,
  $selectedColliderIndex,
  $selectedColliderIndices,
  $selectedConnectorIndex,
  $selectedConnectorIndices,
  $selectedIndices,
  $selectedIvaSeatIndex,
  $selectedIvaSeatIndices,
  $selectedKittenIndices,
  selectedTransformRefs,
  type SelectedTransformRef,
} from './editorStore'
import type { Connector, IvaSeat, Layer, PartCollider, SubPartPlacement } from '../ksa/types'

/** The currently selected placement when exactly one SubPart is selected, else null. */
export const $selectedPlacement = computed(
  [$part, $selectedIndices],
  (part, indices): SubPartPlacement | null =>
    indices.length === 1 ? (part.placements[indices[0]] ?? null) : null,
)

/** A selected SubPart paired with its index. */
export interface SelectedPlacement {
  index: number
  placement: SubPartPlacement
}

/** All currently selected SubParts (index + placement), in selection order. */
export const $selectedPlacements = computed(
  [$part, $selectedIndices],
  (part, indices): SelectedPlacement[] =>
    indices.flatMap((index) => {
      const placement = part.placements[index]
      return placement ? [{ index, placement }] : []
    }),
)

/** True when anything (SubParts, connectors, IVA seats, or kittens) is selected. */
export const $hasSelection = computed(
  [$selectedIndices, $selectedConnectorIndices, $selectedKittenIndices, $selectedIvaSeatIndices],
  (indices, conIndices, kitIndices, seatIndices): boolean =>
    indices.length > 0 || conIndices.length > 0 || kitIndices.length > 0 || seatIndices.length > 0,
)

/**
 * True when more than one entity is selected (across any kinds) — the trigger for
 * the multi-select toolbar and the bulk transform panel.
 */
export const $hasMultiSelection = computed(
  [$selectedIndices, $selectedConnectorIndices, $selectedKittenIndices, $selectedIvaSeatIndices],
  (sub, con, kit, seat): boolean => sub.length + con.length + kit.length + seat.length > 1,
)

/** Total number of selected entities across all kinds. */
export const $selectionCount = computed(
  [
    $selectedIndices,
    $selectedConnectorIndices,
    $selectedKittenIndices,
    $selectedColliderIndices,
    $selectedIvaSeatIndices,
  ],
  (sub, con, kit, col, seat): number =>
    sub.length + con.length + kit.length + col.length + seat.length,
)

/**
 * Every selected entity with its current transform (SubParts, then connectors,
 * then colliders, then IVA seats, then kittens). Drives the bulk transform panel
 * for a unified multi-selection.
 */
export const $selectedRefs = computed(
  [
    $part,
    $selectedIndices,
    $selectedConnectorIndices,
    $selectedKittenIndices,
    $selectedColliderIndices,
    $selectedIvaSeatIndices,
  ],
  (): SelectedTransformRef[] => selectedTransformRefs(),
)

/**
 * The single selected entity (SubPart, connector, collider or IVA seat) as a
 * discriminated union, or null. The SubPart branch is non-null ONLY when exactly one
 * SubPart is selected; multi-selection is represented by {@link $selectedPlacements}
 * instead and drives the bulk transform UI. The kinds are mutually exclusive.
 */
export type SelectedEntity =
  | { kind: 'subpart'; index: number; placement: SubPartPlacement }
  | { kind: 'connector'; index: number; connector: Connector }
  | { kind: 'collider'; index: number; collider: PartCollider }
  | { kind: 'ivaSeat'; index: number; seat: IvaSeat }

export const $selectedEntity = computed(
  [$part, $selectedIndices, $selectedConnectorIndex, $selectedColliderIndex, $selectedIvaSeatIndex],
  (part, subIndices, conIndex, colIndex, seatIndex): SelectedEntity | null => {
    if (subIndices.length === 1) {
      const placement = part.placements[subIndices[0]]
      if (placement) return { kind: 'subpart', index: subIndices[0], placement }
    }
    const connector = part.connectors[conIndex]
    if (conIndex >= 0 && connector) return { kind: 'connector', index: conIndex, connector }
    const collider = part.colliders[colIndex]
    if (colIndex >= 0 && collider) return { kind: 'collider', index: colIndex, collider }
    const seat = part.ivaSeats[seatIndex]
    if (seatIndex >= 0 && seat) return { kind: 'ivaSeat', index: seatIndex, seat }
    return null
  },
)

/**
 * A layer paired with how many SubParts + connectors belong to it. `id` mirrors
 * `layer.id` so the object can be used directly as a react-aria collection item
 * (the collection builder reads `item.id`/`item.key` to determine the row key).
 */
export interface LayerSummary {
  id: string
  layer: Layer
  subParts: number
  connectors: number
  kittens: number
  ivaSeats: number
}

/** Every layer (in display order) with its SubPart/connector/kitten/seat counts. */
export const $layerSummaries = computed([$part], (part): LayerSummary[] => {
  const subCounts = new Map<string, number>()
  const conCounts = new Map<string, number>()
  const kitCounts = new Map<string, number>()
  const seatCounts = new Map<string, number>()
  for (const p of part.placements) subCounts.set(p.layerId, (subCounts.get(p.layerId) ?? 0) + 1)
  for (const c of part.connectors) conCounts.set(c.layerId, (conCounts.get(c.layerId) ?? 0) + 1)
  for (const k of part.kittens) kitCounts.set(k.layerId, (kitCounts.get(k.layerId) ?? 0) + 1)
  for (const s of part.ivaSeats) seatCounts.set(s.layerId, (seatCounts.get(s.layerId) ?? 0) + 1)
  return part.layers.map((layer) => ({
    id: layer.id,
    layer,
    subParts: subCounts.get(layer.id) ?? 0,
    connectors: conCounts.get(layer.id) ?? 0,
    kittens: kitCounts.get(layer.id) ?? 0,
    ivaSeats: seatCounts.get(layer.id) ?? 0,
  }))
})

/** The active layer object (where new items land), or null if none resolves. */
export const $activeLayer = computed(
  [$part, $activeLayerId],
  (part, activeId): Layer | null => part.layers.find((l) => l.id === activeId) ?? null,
)
