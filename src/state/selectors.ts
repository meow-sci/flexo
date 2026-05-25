import { computed } from 'nanostores'
import { $part, $selectedConnectorIndex, $selectedIndex } from './editorStore'
import type { Connector, SubPartPlacement } from '../ksa/types'

/** The currently selected placement, or null when no SubPart is selected. */
export const $selectedPlacement = computed(
  [$part, $selectedIndex],
  (part, index): SubPartPlacement | null => part.placements[index] ?? null,
)

/**
 * The currently selected entity (SubPart or connector) as a discriminated union,
 * or null. SubPart and connector selection are mutually exclusive in the store,
 * so at most one branch is non-null.
 */
export type SelectedEntity =
  | { kind: 'subpart'; index: number; placement: SubPartPlacement }
  | { kind: 'connector'; index: number; connector: Connector }

export const $selectedEntity = computed(
  [$part, $selectedIndex, $selectedConnectorIndex],
  (part, subIndex, conIndex): SelectedEntity | null => {
    const placement = part.placements[subIndex]
    if (subIndex >= 0 && placement) return { kind: 'subpart', index: subIndex, placement }
    const connector = part.connectors[conIndex]
    if (conIndex >= 0 && connector) return { kind: 'connector', index: conIndex, connector }
    return null
  },
)
