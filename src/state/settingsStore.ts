import { atom } from 'nanostores'

/**
 * Global editor settings (nanostores). No React / three.js imports — the three.js
 * layer subscribes ({@link $connectorSettings}) and React reads via `useStore`.
 *
 * Connector size is global (every connector renders at the same gizmo cube
 * width; the facing cone derives from it); per-connector scale multiplies on
 * top via its transform.
 */

export interface ConnectorSettings {
  /** Edge length of the connector cube, in meters. The facing cone derives from this. */
  size: number
}

export const $connectorSettings = atom<ConnectorSettings>({ size: 0.25 })

export function setConnectorSettings(patch: Partial<ConnectorSettings>): void {
  $connectorSettings.set({ ...$connectorSettings.get(), ...patch })
}
