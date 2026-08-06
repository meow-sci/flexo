import { persistentJSON } from '@nanostores/persistent';
import { atom } from 'nanostores';

/**
 * Global editor settings (nanostores, persisted to localStorage). No React /
 * three.js imports — the three.js layer subscribes ({@link $connectorSettings})
 * and React reads via `useStore`.
 *
 * Connector size is global (every connector renders at the same gizmo cube
 * width; the facing cone derives from it); per-connector scale multiplies on
 * top via its transform.
 *
 * One exception to "persisted": {@link $lightPreviewCount} is a plain atom — a
 * scene→UI REPORT about the current document rather than a user preference.
 */

export interface ConnectorSettings {
  /** Edge length of the connector cube, in meters. The facing cone derives from this. */
  size: number;
}

export const $connectorSettings = persistentJSON<ConnectorSettings>('flexo:connectorSettings', {
  size: 0.125,
});

export function setConnectorSettings(patch: Partial<ConnectorSettings>): void {
  $connectorSettings.set({ ...$connectorSettings.get(), ...patch });
}

/**
 * IVA seat marker appearance in the 3D workspace. Like the connector cube, the marker's
 * size is a GLOBAL view setting rather than document data — KSA has no seat size, so an
 * `IvaSeat`'s `scale` is unused and the marker never scales with the part.
 * {@link src/three/IvaSeatObject.ts} reads these; `EditorScene` rebuilds the markers when
 * they change.
 */
export interface IvaSeatSettings {
  /** Diameter of the seat's eye sphere, in meters. The forward cone and up stick derive from it. */
  markerSize: number;
  /**
   * Draw the translucent gaze cone ahead of each seat. INDICATIVE ONLY — it is a 45°
   * half-angle cone, while the game's actual clamp is a 90° hemisphere around the forward
   * axis (a half-space, which has no readable shape).
   */
  showGazeCone: boolean;
}

export const $ivaSeatSettings = persistentJSON<IvaSeatSettings>('flexo:ivaSeatSettings', {
  markerSize: 0.12,
  showGazeCone: false,
});

export function setIvaSeatSettings(patch: Partial<IvaSeatSettings>): void {
  $ivaSeatSettings.set({ ...$ivaSeatSettings.get(), ...patch });
}

/**
 * Light marker appearance in the 3D workspace. Like the seat marker, the size is a
 * GLOBAL view setting rather than document data — KSA ignores a light's scale (a
 * {@link import('../ksa/types').PartLight}'s `scale` is pinned) and its `Range` is
 * world meters regardless of owner scale, so the marker never scales with the part.
 * {@link src/three/LightObject.ts} reads this; `EditorScene` rebuilds the markers
 * when `markerSize` changes and re-shades/re-shows them for the rest (only the marker
 * has no in-place resize path — the coverage settings are live).
 */
export interface LightVizSettings {
  /**
   * Overall marker size in meters (the bulb sphere's radius is 0.4× this; the Spot
   * aim cone derives from it). Default matches the IVA seat marker.
   */
  markerSize: number;
  /**
   * Which lights draw their coverage — the falloff shell stack + the hard boundary
   * wireframe. `'selected'` (default) keeps the viewport calm: only the selected
   * light's context instance glows. `'all'` is the "where does this part actually
   * light up?" view; `'off'` leaves just the markers.
   */
  showVolumes: 'selected' | 'all' | 'off';
  /**
   * How the coverage shading maps illuminance to screen brightness (the Reinhard knee
   * `E₀` in `E / (E + E₀)`):
   *  - `'auto'` (default) — derived PER LIGHT from its own range/intensity
   *    ({@link import('../three/lightVolume').autoExposure}), so a dim interior point
   *    light and a bright spotlight both span the full gradient. Best for editing one
   *    light; useless for comparing two.
   *  - `'absolute'` — every light uses {@link vizExposure}, so relative brightness is
   *    honest across lights (and a genuinely dim light looks dim).
   */
  exposureMode: 'auto' | 'absolute';
  /** Absolute-mode `E₀`, in the same illuminance units as `Intensity / d²`. */
  vizExposure: number;
  /**
   * Hang a REAL three.js light off every light marker so the part meshes are actually
   * lit ({@link import('../three/LightObject').LightObject} `setPreview`). Default
   * **off**: it is an approximation of the game (three's distance window is squared and
   * its cone edge is a smoothstep — see docs/lights.md), and toggling it changes the
   * scene's light count, which makes three re-link every shader program. The coverage
   * shells stay the exact read.
   */
  livePreview: boolean;
}

export const DEFAULT_LIGHT_SETTINGS: LightVizSettings = {
  markerSize: 0.12,
  showVolumes: 'selected',
  exposureMode: 'auto',
  vizExposure: 1,
  livePreview: false,
};

export const $lightSettings = persistentJSON<LightVizSettings>(
  'flexo:lightSettings',
  DEFAULT_LIGHT_SETTINGS,
);

/**
 * The settings with every field guaranteed present. `persistentJSON` replays a
 * stored object VERBATIM — it does not merge the initial value — so a settings
 * object written before a field existed would read that field as `undefined` and
 * silently disable it (coverage would just never draw). Reading through here is the
 * same defaulting `layerViewState`/`DEFAULT_LAYER_STATE` does for layer view state.
 * This is field defaulting, NOT data migration: nothing reads an old key or converts
 * an old shape, and a stale field simply resolves to its default.
 */
export function lightSettings(): LightVizSettings {
  return { ...DEFAULT_LIGHT_SETTINGS, ...$lightSettings.get() };
}

export function setLightSettings(patch: Partial<LightVizSettings>): void {
  $lightSettings.set({ ...lightSettings(), ...patch });
}

/** How many light instances the live preview actually lights, and how many exist. */
export interface LightPreviewCount {
  /**
   * Preview lights currently in the scene. 0 when {@link LightVizSettings.livePreview}
   * is off or the Lights layer is hidden; otherwise `min(total, MAX_PREVIEW_LIGHTS)`.
   */
  enabled: number;
  /**
   * Light INSTANCES in the document — a SubPart-owned light counts once per placement of
   * its template, because that is how many lights KSA instantiates (and how many preview
   * lights the scene would need).
   */
  total: number;
}

/**
 * The live preview's cap report — **ephemeral, deliberately NOT persisted** (unlike every
 * other store in this module): it describes the CURRENT document, not a preference, so
 * replaying a stale count from localStorage would be a lie. `EditorScene` publishes it
 * from {@link import('../three/lightVolume').planPreviewBudget}; the Settings dialog's light-coverage section reads it to
 * say "previewing N of M" when the cap truncates.
 */
export const $lightPreviewCount = atom<LightPreviewCount>({ enabled: 0, total: 0 });

/** Publishes the preview cap report, no-oping when nothing changed (avoids idle re-renders). */
export function setLightPreviewCount(next: LightPreviewCount): void {
  const current = $lightPreviewCount.get();
  if (current.enabled === next.enabled && current.total === next.total) return;
  $lightPreviewCount.set(next);
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
  meshColor: string;
  /** Tint strength for SubPart meshes (0–1). */
  meshAlpha: number;
  /** CSS hex (`#rrggbb`) emissive tint for selected kittens. */
  kittenColor: string;
  /** Tint strength for kittens (0–1). */
  kittenAlpha: number;
}

const DEFAULT_HIGHLIGHT: SelectionHighlightSettings = {
  meshColor: '#fcff66',
  meshAlpha: 0.35,
  kittenColor: '#ff00f7',
  kittenAlpha: 0.35,
};

export const $selectionHighlight = persistentJSON<SelectionHighlightSettings>(
  'flexo:selectionHighlight',
  DEFAULT_HIGHLIGHT,
);

export function setSelectionHighlight(patch: Partial<SelectionHighlightSettings>): void {
  $selectionHighlight.set({ ...$selectionHighlight.get(), ...patch });
}

/**
 * How "Make Kitten Mesh" SubParts supply their KSA textures on export. The baked
 * geometry GLB is always bundled; only the .ktx2 textures vary:
 *  - 'reference' — emit an ABSOLUTE `<Diffuse Path="{contentCorePath}\…">` so KSA
 *    loads the game's own textures in place (zero texture files in the mod). Tied to
 *    that install location; not portable. (Relies on .NET Path.Combine returning a
 *    rooted path as-is — see plans + thirdparty/ksa Mod.cs.)
 *  - 'bundle' — copy the .ktx2 verbatim into the mod's Textures/ folder (portable).
 */
export interface KittenTextureExportSettings {
  mode: 'reference' | 'bundle';
  /** Game Content/Core folder, used to build absolute texture paths in 'reference' mode. */
  contentCorePath: string;
}

const DEFAULT_KITTEN_TEXTURE_EXPORT: KittenTextureExportSettings = {
  mode: 'reference',
  contentCorePath: 'C:\\Program Files\\Kitten Space Agency\\Content\\Core',
};

export const $kittenTextureExport = persistentJSON<KittenTextureExportSettings>(
  'flexo:kittenTextureExport',
  DEFAULT_KITTEN_TEXTURE_EXPORT,
);

export function setKittenTextureExport(patch: Partial<KittenTextureExportSettings>): void {
  $kittenTextureExport.set({ ...$kittenTextureExport.get(), ...patch });
}

/**
 * STICKY preferences for the model importer (Add ▸ Import model… / drag-drop onto the
 * viewport). These four are the ones a user sets once for how they work — a texture budget,
 * the axis convention their DCC exports with, and the two "do the sensible thing" bakes — so
 * they persist and pre-seed every future import.
 *
 * PER-IMPORT choices deliberately do NOT live here and are dialog state instead: the scale
 * factor, the name prefix, "make double-sided", "bake transforms to origin" and "merge into
 * one SubPart" all describe ONE model, not a working style. Persisting them would silently
 * apply the last model's fix-up to the next one — a 0.01 scale left over from a centimetre
 * export is the worst of these, because the result looks plausible and is 100× wrong.
 *
 * Consumers: Settings ▸ Import & Export (the single editable home) and the Import Review
 * dialog (all four), `planImportMaterials` +
 * `createImportMaterialAssets` ({@link ModelImportSettings.maxTextureSize} → `decodeImage`'s
 * `maxSize`, so the analysis estimate and the encoded .ktx2 agree), and
 * `modExport.buildCustomBundle` ({@link ModelImportSettings.decimateViewMeshes} → the `_VM`
 * triangle budget).
 */
export interface ModelImportSettings {
  /**
   * Longest-edge cap for imported images. flexo's KTX2 is uncompressed RGBA8 + Zstd, so
   * in-game VRAM is ~w·h·4·4/3 PER TEXTURE — 4096² costs ~85 MB. Hence a 2048 default.
   */
  maxTextureSize: 1024 | 2048 | 4096;
  /** Which axis the source file calls "up" ('z' applies the RotX(-90°) correction). */
  upAxis: 'y' | 'z';
  /** Bake the instance scale into the geometry (predictable texel density + gizmo behaviour). */
  bakeScale: boolean;
  /** Decimate the exported `<MeshView>` picking meshes (KSA hover-picks on the CPU). */
  decimateViewMeshes: boolean;
}

const DEFAULT_MODEL_IMPORT: ModelImportSettings = {
  maxTextureSize: 2048,
  upAxis: 'y',
  bakeScale: true,
  decimateViewMeshes: true,
};

export const $modelImportSettings = persistentJSON<ModelImportSettings>(
  'flexo:modelImport',
  DEFAULT_MODEL_IMPORT,
);

export function setModelImportSettings(patch: Partial<ModelImportSettings>): void {
  $modelImportSettings.set({ ...$modelImportSettings.get(), ...patch });
}

/**
 * Editor preview toggle: simulate KSA's muted in-game glass look for tinted visors. KSA's glass
 * shader (MeshGlassIndirect.frag) renders the tint darker/subtler — only ~10% of the diffuse —
 * and at a fixed ~0.75 opacity. ON ⇒ the editor mimics that (WYSIWYG); OFF ⇒ it shows the chosen
 * tint vividly (best for picking a color). Read by customAssetStore when building visor materials.
 */
export const $simulateGlass = persistentJSON<boolean>('flexo:simulateGlass', false);

export function setSimulateGlass(value: boolean): void {
  $simulateGlass.set(value);
}

/**
 * Show the stats.js FPS overlay in the 3D workspace. Defaults off; the three.js
 * {@link src/three/Viewport.ts} subscribes and mounts/unmounts the panel. Cleared
 * by the global data reset (it `localStorage.clear()`s every `flexo:` key).
 */
export const $showFpsCounter = persistentJSON<boolean>('flexo:showFpsCounter', false);

export function setShowFpsCounter(value: boolean): void {
  $showFpsCounter.set(value);
}
