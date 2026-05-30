import { computed } from 'nanostores'
import { $activeLayerId, $part, $selectedConnectorIndex, $selectedConnectorIndices, $selectedIndices, $selectedKittenIndices } from './editorStore'
import type { Connector, Layer, SubPartPlacement } from '../ksa/types'

/** The currently selected placement when exactly one SubPart is selected, else null. */
export const $selectedPlacement = computed(
  [$part, $selectedIndices],
  (part, indices): SubPartPlacement | null =>
    indices.length === 1 ? part.placements[indices[0]] ?? null : null,
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

/** True when anything (SubParts, connectors, or kittens) is selected. */
export const $hasSelection = computed(
  [$selectedIndices, $selectedConnectorIndices, $selectedKittenIndices],
  (indices, conIndices, kitIndices): boolean =>
    indices.length > 0 || conIndices.length > 0 || kitIndices.length > 0,
)

/**
 * True when more than one entity is selected — the trigger for the multi-select
 * toolbar. Only SubParts support multi-selection (connector selection is single),
 * so this keys solely on the SubPart indices.
 */
export const $hasMultiSelection = computed(
  $selectedIndices,
  (indices): boolean => indices.length > 1,
)

/**
 * The single selected entity (SubPart or connector) as a discriminated union, or
 * null. The SubPart branch is non-null ONLY when exactly one SubPart is selected;
 * multi-selection is represented by {@link $selectedPlacements} instead and drives
 * the bulk transform UI. SubPart and connector selection are mutually exclusive.
 */
export type SelectedEntity =
  | { kind: 'subpart'; index: number; placement: SubPartPlacement }
  | { kind: 'connector'; index: number; connector: Connector }

export const $selectedEntity = computed(
  [$part, $selectedIndices, $selectedConnectorIndex],
  (part, subIndices, conIndex): SelectedEntity | null => {
    if (subIndices.length === 1) {
      const placement = part.placements[subIndices[0]]
      if (placement) return { kind: 'subpart', index: subIndices[0], placement }
    }
    const connector = part.connectors[conIndex]
    if (conIndex >= 0 && connector) return { kind: 'connector', index: conIndex, connector }
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
}

/** Every layer (in display order) with its SubPart/connector/kitten counts. */
export const $layerSummaries = computed(
  [$part],
  (part): LayerSummary[] => {
    const subCounts = new Map<string, number>()
    const conCounts = new Map<string, number>()
    const kitCounts = new Map<string, number>()
    for (const p of part.placements) subCounts.set(p.layerId, (subCounts.get(p.layerId) ?? 0) + 1)
    for (const c of part.connectors) conCounts.set(c.layerId, (conCounts.get(c.layerId) ?? 0) + 1)
    for (const k of part.kittens) kitCounts.set(k.layerId, (kitCounts.get(k.layerId) ?? 0) + 1)
    return part.layers.map((layer) => ({
      id: layer.id,
      layer,
      subParts: subCounts.get(layer.id) ?? 0,
      connectors: conCounts.get(layer.id) ?? 0,
      kittens: kitCounts.get(layer.id) ?? 0,
    }))
  },
)

/** The active layer object (where new items land), or null if none resolves. */
export const $activeLayer = computed(
  [$part, $activeLayerId],
  (part, activeId): Layer | null => part.layers.find((l) => l.id === activeId) ?? null,
)
