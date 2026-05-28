import { persistentJSON } from '@nanostores/persistent'

/**
 * Global lighting / rendering settings (nanostores, persisted to localStorage).
 * No React or three.js imports — each viewport's {@link SceneEnvironment}
 * subscribes ({@link $lighting}) and React reads via `useStore`. These apply to
 * every viewport (main editor + part/subpart previews) so a part looks the same
 * everywhere.
 */

export type EnvironmentPreset =
  | 'room'
  | 'kloofendal'
  | 'evening_road'
  | 'autumn_field'
  | 'adams_bridge'
  | 'aristea_wreck'
  | 'pretoria_gardens'
  | 'glasshouse_interior'
  | 'blue_lagoon_night'

export interface EnvironmentPresetInfo {
  id: EnvironmentPreset
  label: string
  /**
   * Equirectangular .hdr filename under `${BASE_URL}hdr/`, or null for the
   * procedural studio (RoomEnvironment) which has no sky to use as a background.
   */
  file: string | null
}

/** Selectable environments: a neutral procedural studio plus the bundled outdoor HDRIs. */
export const ENVIRONMENT_PRESETS: EnvironmentPresetInfo[] = [
  { id: 'room', label: 'Studio', file: null },
  { id: 'kloofendal', label: 'Partly Cloudy', file: 'kloofendal_48d_partly_cloudy_puresky_4k.hdr' },
  { id: 'evening_road', label: 'Evening Road', file: 'evening_road_01_puresky_4k.hdr' },
  { id: 'autumn_field', label: 'Autumn Field', file: 'autumn_field_puresky_4k.hdr' },
  { id: 'adams_bridge', label: 'Adams Bridge', file: 'adams_place_bridge_4k.hdr' },
  { id: 'aristea_wreck', label: 'Aristea Wreck', file: 'aristea_wreck_puresky_4k.hdr' },
  { id: 'pretoria_gardens', label: 'Pretoria Gardens', file: 'pretoria_gardens_4k.hdr' },
  { id: 'glasshouse_interior', label: 'Glasshouse Interior', file: 'glasshouse_interior_4k.hdr' },
  { id: 'blue_lagoon_night', label: 'Blue Lagoon Night', file: 'blue_lagoon_night_4k.hdr' },
]

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
