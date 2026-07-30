import { persistentJSON } from '@nanostores/persistent'
import type { EnvironmentPreset } from './environmentPresets'

/**
 * Global lighting / rendering settings (nanostores, persisted to localStorage).
 * No React or three.js imports — each viewport's {@link SceneEnvironment}
 * subscribes ({@link $lighting}) and React reads via `useStore`. These apply to
 * every viewport (main editor + part/subpart previews) so a part looks the same
 * everywhere.
 */

export { ENVIRONMENT_PRESETS } from './environmentPresets'
export type { EnvironmentPreset, EnvironmentPresetInfo } from './environmentPresets'

export type ToneMappingMode = 'aces' | 'agx' | 'neutral' | 'linear'

export interface ToneMappingInfo {
  id: ToneMappingMode
  label: string
}

export const TONE_MAPPING_MODES: ToneMappingInfo[] = [
  { id: 'aces', label: 'ACES Filmic' },
  { id: 'agx', label: 'AgX' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'linear', label: 'Linear' },
]

export interface LightingSettings {
  /** Image-based-lighting environment used for reflections (and optionally the background). */
  environment: EnvironmentPreset
  /** Strength of environment reflections/illumination and the sky background (scene.environmentIntensity). */
  environmentIntensity: number
  /** Show the HDR environment as the visible background instead of a solid color. Ignored for 'room'. */
  showEnvironmentBackground: boolean
  /** Blur applied to the environment background, 0..1 (scene.backgroundBlurriness). */
  backgroundBlur: number
  /** Renderer tone-mapping exposure (overall brightness). */
  exposure: number
  /** Tone-mapping operator. */
  toneMapping: ToneMappingMode
}

export const DEFAULT_LIGHTING: LightingSettings = {
  environment: 'glasshouse_interior',
  environmentIntensity: 1,
  showEnvironmentBackground: false,
  backgroundBlur: 0,
  exposure: 0.85,
  toneMapping: 'neutral',
}

export const $lighting = persistentJSON<LightingSettings>('flexo:lighting', DEFAULT_LIGHTING)

export function setLighting(patch: Partial<LightingSettings>): void {
  $lighting.set({ ...$lighting.get(), ...patch })
}
