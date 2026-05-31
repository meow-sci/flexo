import { persistentJSON } from '@nanostores/persistent'

/**
 * Global editor settings (nanostores, persisted to localStorage). No React /
 * three.js imports — the three.js layer subscribes ({@link $connectorSettings})
 * and React reads via `useStore`.
 *
 * Connector size is global (every connector renders at the same gizmo cube
 * width; the facing cone derives from it); per-connector scale multiplies on
 * top via its transform.
 */

export interface ConnectorSettings {
  /** Edge length of the connector cube, in meters. The facing cone derives from this. */
  size: number
}

export const $connectorSettings = persistentJSON<ConnectorSettings>('flexo:connectorSettings', { size: 0.125 })

export function setConnectorSettings(patch: Partial<ConnectorSettings>): void {
  $connectorSettings.set({ ...$connectorSettings.get(), ...patch })
}

/**
 * Selection-highlight appearance, applied as an emissive tint when an entity is
 * selected. SubPart meshes and kitten visual aides each get their own color +
 * strength (`alpha`, 0–1 = the emissive intensity of the tint). Connectors keep
 * their fixed green and are not configurable. The three.js layer reads the parsed
 * values via {@link src/three/highlightSettings.ts}; React edits via `useStore`.
 */
export interface SelectionHighlightSettings {
  /** CSS hex (`#rrggbb`) emissive tint for selected SubPart meshes. */
  meshColor: string
  /** Tint strength for SubPart meshes (0–1). */
  meshAlpha: number
  /** CSS hex (`#rrggbb`) emissive tint for selected kittens. */
  kittenColor: string
  /** Tint strength for kittens (0–1). */
  kittenAlpha: number
}

const DEFAULT_HIGHLIGHT: SelectionHighlightSettings = {
  meshColor: '#fcff66',
  meshAlpha: 0.35,
  kittenColor: '#ff00f7',
  kittenAlpha: 0.35,
}

export const $selectionHighlight = persistentJSON<SelectionHighlightSettings>(
  'flexo:selectionHighlight',
  DEFAULT_HIGHLIGHT,
)

export function setSelectionHighlight(patch: Partial<SelectionHighlightSettings>): void {
  $selectionHighlight.set({ ...$selectionHighlight.get(), ...patch })
}
