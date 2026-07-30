/**
 * Session-only, in-memory settings for the part-preview mini app.
 *
 * This app is served from the SAME ORIGIN as the main flexo editor, so it must
 * NEVER import or read the persistent stores `$lighting` (`src/state/lightingStore`)
 * or `$connectorSettings` (`src/state/settingsStore`): those are
 * `@nanostores/persistent` stores backed by shared localStorage keys, and touching
 * them would leak the user's editor settings into a wiki render (or, on write,
 * clobber them). Everything here is plain `atom`s that live and die with the page.
 *
 * Importing `lightingStore` purely for `DEFAULT_LIGHTING` is fine: nanostores atoms
 * are lazy, and nothing here ever subscribes to `$lighting`, so its localStorage is
 * never read.
 */
import { atom } from 'nanostores'
import { ENVIRONMENT_PRESETS, type EnvironmentPreset } from '../../../src/state/environmentPresets'
import { DEFAULT_LIGHTING, type LightingSettings } from '../../../src/state/lightingStore'

// Parsed ONCE at module scope — never during render (a component that read
// `location.search` in its body would be an impure render under React Compiler).
const params = new URLSearchParams(location.search)

/** The Part to preview, straight from `?part_id=`. Null when absent. */
export const PART_ID: string | null = params.get('part_id')

/**
 * The requested skybox, or null for "no skybox".
 *
 * Only counts when a preset with that exact id exists AND names an .hdr file;
 * `'room'` is the procedural studio with no sky, so it resolves to null just like
 * an absent or unknown id.
 */
export const SKYBOX_ID: EnvironmentPreset | null = (() => {
  const requested = params.get('skybox_id')
  if (!requested) return null
  const preset = ENVIRONMENT_PRESETS.find((p) => p.id === requested)
  return preset && preset.file !== null ? preset.id : null
})()

/** Connector markers are off unless `?connectors=1` (or `=true`) asks for them. */
export const INITIAL_CONNECTORS: boolean =
  params.get('connectors') === '1' || params.get('connectors') === 'true'

/**
 * Lighting derived from the URL.
 *
 * Deliberately keeps every other `DEFAULT_LIGHTING` value — `exposure: 0.85`,
 * `toneMapping: 'neutral'`, `environmentIntensity: 1`, `backgroundBlur: 0` — so a
 * wiki render matches the in-app part preview. `'room'` is the procedural studio
 * (zero download, no sky) which stands in for "no skybox"; the solid charcoal
 * background then shows instead.
 */
export const INITIAL_LIGHTING: LightingSettings = {
  ...DEFAULT_LIGHTING,
  environment: SKYBOX_ID ?? 'room',
  showEnvironmentBackground: SKYBOX_ID != null,
}

export const $previewLighting = atom<LightingSettings>(INITIAL_LIGHTING)

export const $connectors = atom<boolean>(INITIAL_CONNECTORS)

/** Patch the session lighting (never mutates the current value). */
export function setPreviewLighting(patch: Partial<LightingSettings>): void {
  $previewLighting.set({ ...$previewLighting.get(), ...patch })
}

/**
 * Restore the URL-derived state — NOT `DEFAULT_LIGHTING`: "reset" means "back to
 * what this embed was asked for", which is what the wiki iframe's src encodes.
 */
export function resetPreviewSettings(): void {
  $previewLighting.set(INITIAL_LIGHTING)
  $connectors.set(INITIAL_CONNECTORS)
}
