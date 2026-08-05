import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';
import {
  $grids,
  $hideInterior,
  setGrid,
  setHideInterior,
  snapCamera,
  type Axis,
  type CameraDir,
} from '../../state/viewStore';
import { $lighting, ENVIRONMENT_PRESETS, setLighting } from '../../state/lightingStore';
import {
  $showFpsCounter,
  lightSettings,
  setLightSettings,
  setShowFpsCounter,
  type LightVizSettings,
} from '../../state/settingsStore';
import {
  $measurementSettings,
  setMeasurementSettings,
  type BoundsMode,
  type MeasurementUnit,
} from '../../state/measurementStore';

/**
 * View menu commands (design: foundation §3 "View").
 *
 * Strictly "what you see", never the document — so nothing here enrolls in undo, and every
 * write lands in the same persisted view store the Settings dialog edits (Law 1: the menu
 * carries the toggles, Settings carries their numeric siblings).
 */

const CAMERA_DIRS: { dir: CameraDir; label: string }[] = [
  { dir: 'front', label: 'Front' },
  { dir: 'back', label: 'Back' },
  { dir: 'left', label: 'Left' },
  { dir: 'right', label: 'Right' },
  { dir: 'top', label: 'Top' },
  { dir: 'bottom', label: 'Bottom' },
];

/** Grid label ↔ plane, not normal: the `y`-normal grid is the FLOOR (the XZ plane). */
const GRID_PLANES: { axis: Axis; label: string }[] = [
  { axis: 'y', label: 'Floor (XZ)' },
  { axis: 'z', label: 'XY' },
  { axis: 'x', label: 'YZ' },
];

const COVERAGE_MODES: { id: LightVizSettings['showVolumes']; label: string }[] = [
  { id: 'selected', label: 'Selected' },
  { id: 'all', label: 'All' },
  { id: 'off', label: 'Off' },
];

const BOUNDS_MODES: { id: BoundsMode; label: string }[] = [
  { id: 'world', label: 'World' },
  { id: 'oriented', label: 'Oriented' },
];

const UNITS: MeasurementUnit[] = ['m', 'cm', 'mm'];

const cameraSnapCommands: Command[] = CAMERA_DIRS.map(({ dir, label }) => ({
  id: `view.cameraSnap:${dir}`,
  title: label,
  menuPath: 'View ▸ Camera Snap',
  keywords: `camera snap view ${dir}`,
  keepOpen: true,
  // INTERIM: orbits the ORIGIN, exactly as v1 did. Snapping around the selection centroid
  // (LOCKED) arrives with the camera work in the mode/Build phases.
  run: () => snapCamera(dir),
}));

const gridCommands: Command[] = GRID_PLANES.map(({ axis, label }) => ({
  id: `view.grid:${axis}`,
  title: label,
  menuPath: 'View ▸ Grids',
  keywords: `grid floor plane ${axis}`,
  checked: () => $grids.get()[axis].enabled,
  keepOpen: true,
  run: () => setGrid(axis, { enabled: !$grids.get()[axis].enabled }),
}));

const environmentCommands: Command[] = ENVIRONMENT_PRESETS.map((preset) => ({
  id: `view.environment:${preset.id}`,
  title: preset.label,
  menuPath: 'View ▸ Environment',
  keywords: `environment hdr lighting ibl ${preset.label.toLowerCase()}`,
  checked: () => $lighting.get().environment === preset.id,
  keepOpen: true,
  run: () => setLighting({ environment: preset.id }),
}));

const lightCoverageCommands: Command[] = COVERAGE_MODES.map(({ id, label }) => ({
  id: `view.lightCoverage:${id}`,
  title: label,
  menuPath: 'View ▸ Light Coverage',
  keywords: `light coverage volume falloff ${id}`,
  // Read through the merge helper, never the raw atom: a settings object persisted before
  // a field existed replays VERBATIM and would read as undefined (see lightSettings()).
  checked: () => lightSettings().showVolumes === id,
  keepOpen: true,
  run: () => setLightSettings({ showVolumes: id }),
}));

const boundsModeCommands: Command[] = BOUNDS_MODES.map(({ id, label }) => ({
  id: `view.boundsMode:${id}`,
  title: label,
  menuPath: 'View ▸ Measurement Overlays',
  keywords: `bounds ${id} axis aligned oriented`,
  checked: () => $measurementSettings.get().boundsMode === id,
  keepOpen: true,
  run: () => setMeasurementSettings({ boundsMode: id }),
}));

const unitCommands: Command[] = UNITS.map((unit) => ({
  id: `view.unit:${unit}`,
  title: unit,
  menuPath: 'View ▸ Units',
  keywords: `units meters centimeters millimeters ${unit}`,
  checked: () => $measurementSettings.get().unit === unit,
  keepOpen: true,
  run: () => setMeasurementSettings({ unit }),
}));

/** Whether the current environment preset even HAS a sky to show (Studio is procedural). */
function environmentHasSky(): boolean {
  return ENVIRONMENT_PRESETS.find((p) => p.id === $lighting.get().environment)?.file != null;
}

export const VIEW_COMMANDS: Command[] = [
  {
    id: 'view.frameSelection',
    title: 'Frame Selection',
    menuPath: 'View',
    keywords: 'frame focus zoom selection camera',
    enabled: () => false,
    disabledReason: 'Frame Selection arrives with the mode machine',
    run: () => {},
  },
  {
    id: 'view.resetCamera',
    title: 'Reset Camera',
    menuPath: 'View',
    keywords: 'reset camera default view',
    enabled: () => false,
    disabledReason: 'Reset Camera arrives with the mode machine',
    run: () => {},
  },
  ...cameraSnapCommands,
  ...gridCommands,
  {
    id: 'view.gridSettings',
    title: 'Grid Settings…',
    menuPath: 'View ▸ Grids',
    keywords: 'grid spacing settings',
    run: () => openDialog({ id: 'settings' }),
  },
  {
    id: 'view.hideInterior',
    title: 'Hide Interior',
    menuPath: 'View',
    keywords: 'interior iva hide internal',
    checked: () => $hideInterior.get(),
    keepOpen: true,
    run: () => setHideInterior(!$hideInterior.get()),
  },
  ...environmentCommands,
  {
    id: 'view.skyBackground',
    title: 'Show Sky Background',
    menuPath: 'View',
    keywords: 'sky background environment hdr',
    // The procedural Studio environment has no sky to show (v1 disabled the switch too).
    enabled: environmentHasSky,
    checked: () => environmentHasSky() && $lighting.get().showEnvironmentBackground,
    keepOpen: true,
    run: () =>
      setLighting({ showEnvironmentBackground: !$lighting.get().showEnvironmentBackground }),
  },
  {
    id: 'view.sceneLighting',
    title: 'Scene Lighting…',
    menuPath: 'View',
    keywords: 'tone map exposure reflections sky blur scene',
    // Deep-link params are accepted and ignored until Settings grows its tab routing.
    run: () => openDialog({ id: 'settings', params: { tab: 'scene' } }),
  },
  ...lightCoverageCommands,
  {
    id: 'view.livePreview',
    title: 'Live Light Preview',
    menuPath: 'View',
    keywords: 'light preview live illuminate',
    checked: () => lightSettings().livePreview,
    keepOpen: true,
    run: () => setLightSettings({ livePreview: !lightSettings().livePreview }),
  },
  {
    id: 'view.displayFilters',
    title: 'Display Filters',
    menuPath: 'View',
    keywords: 'display filter show hide entity kinds',
    enabled: () => false,
    disabledReason: 'Per-kind display filters arrive with the Build-mode rework',
    run: () => {},
  },
  {
    id: 'view.motionTrails',
    title: 'Motion Trails',
    menuPath: 'View',
    keywords: 'motion trail trajectory animation path',
    enabled: () => false,
    disabledReason: 'Motion trails arrive with the Animation-mode rework',
    run: () => {},
  },
  {
    id: 'view.bbox',
    title: 'Bounding Box',
    menuPath: 'View ▸ Measurement Overlays',
    keywords: 'bounding box bounds selection size',
    checked: () => $measurementSettings.get().showSelectionBounds,
    keepOpen: true,
    run: () =>
      setMeasurementSettings({
        showSelectionBounds: !$measurementSettings.get().showSelectionBounds,
      }),
  },
  ...boundsModeCommands,
  {
    id: 'view.perMesh',
    title: 'Per-mesh Dimensions',
    menuPath: 'View ▸ Measurement Overlays',
    keywords: 'per mesh dimensions size labels',
    checked: () => $measurementSettings.get().showPerMesh,
    keepOpen: true,
    run: () => setMeasurementSettings({ showPerMesh: !$measurementSettings.get().showPerMesh }),
  },
  {
    id: 'view.meshDistance',
    title: 'Distance Between Two',
    menuPath: 'View ▸ Measurement Overlays',
    keywords: 'distance gap between meshes',
    checked: () => $measurementSettings.get().showMeshDistance,
    keepOpen: true,
    run: () =>
      setMeasurementSettings({ showMeshDistance: !$measurementSettings.get().showMeshDistance }),
  },
  ...unitCommands,
  {
    id: 'view.fpsCounter',
    title: 'FPS Counter',
    menuPath: 'View',
    keywords: 'fps frame rate stats performance',
    checked: () => $showFpsCounter.get(),
    keepOpen: true,
    // Enabling this flips the on-demand render loop to continuous (the one sanctioned
    // exception — foundation §14.5).
    run: () => setShowFpsCounter(!$showFpsCounter.get()),
  },
];
