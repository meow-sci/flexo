/**
 * The selectable IBL environments, as plain data.
 *
 * Deliberately DEPENDENCY-FREE — no nanostores, no `import.meta.env`, no browser
 * globals — so it can be imported from **Node** (the `previewManifest` Vite
 * plugin) as well as from the browser. Everything stateful lives in
 * `./lightingStore`, which re-exports these for existing call sites.
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
