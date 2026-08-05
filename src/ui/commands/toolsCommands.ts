import type { Command } from '../../state/commandStore';
import {
  $gizmoSpace,
  $part,
  $toolMode,
  select,
  setToolMode,
  toggleGizmoSpace,
  type ToolMode,
} from '../../state/editorStore';
import { $seatView, enterSeatView, exitSeatView } from '../../state/ivaStore';
import { $mode } from '../../state/modeStore';
import { $engineExhaustGizmo, setEngineExhaustGizmo } from '../../state/engineStore';
import { toast } from '../toast';
import {
  $measurements,
  $measureTool,
  addReferenceLine,
  setActiveMeasurement,
  setMeasureTool,
} from '../../state/measurementStore';
import {
  $containers,
  $containerSettings,
  addContainer,
  setActiveContainer,
  setContainerSettings,
  type ReferenceShape,
} from '../../state/containerStore';
import { requestCoverageCheck } from '../../state/colliderStore';

/**
 * Tools menu commands (design: foundation §3 "Tools").
 *
 * Undo enrollment: `addReferenceLine` / `addContainer` push their own undo step via the
 * editor-aid store registration (`registerEditorAidStores`); the rest is view state.
 */

const CONTAINER_SHAPES: { id: ReferenceShape; label: string }[] = [
  { id: 'rect', label: 'Box' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'sphere', label: 'Sphere' },
];

/**
 * Gizmo tool cycle order (T forward · ⇧T backward) and the label each step flashes.
 * Move/Rotate/Scale are the same three the v1 toolbar buttons wrote.
 */
const GIZMO_CYCLE: { mode: ToolMode; label: string }[] = [
  { mode: 'translate', label: 'Move' },
  { mode: 'rotate', label: 'Rotate' },
  { mode: 'scale', label: 'Scale' },
];

/**
 * Cycles `$toolMode` one step (design: foundation §11.2 "T / ⇧T"; S5).
 *
 * It writes `$toolMode`, never `$effectiveToolMode` — exhaust placement clamps Scale away
 * on the READ side (`engineStore.$effectiveToolMode`), exactly as it does for the toolbar
 * buttons, so cycling past Scale while placing simply displays Move.
 */
function cycleGizmoTool(step: number): void {
  const current = GIZMO_CYCLE.findIndex((entry) => entry.mode === $toolMode.get());
  const next = GIZMO_CYCLE[(current + step + GIZMO_CYCLE.length) % GIZMO_CYCLE.length];
  setToolMode(next.mode);
  toast({ title: `Tool: ${next.label}` });
}

const containerCommands: Command[] = CONTAINER_SHAPES.map(({ id, label }) => ({
  id: `tools.addContainer:${id}`,
  title: label,
  menuPath: 'Tools ▸ Add Reference Container',
  keywords: `reference container volume envelope ${label.toLowerCase()}`,
  // addContainer makes the new container active, which opens its editor (v1 parity).
  run: () => addContainer(id),
}));

export const TOOLS_COMMANDS: Command[] = [
  {
    id: 'tool.measure',
    title: 'Measure Point-to-Point',
    menuPath: 'Tools',
    keywords: 'measure distance ruler point',
    // INTERIM: v1's plain toggle. The single `$activeTool` slot (which cancels whatever
    // else is armed) and the status-bar guidance arrive with the mode/Build phases.
    checked: () => $measureTool.get() === 'point',
    run: () => setMeasureTool($measureTool.get() === 'point' ? 'none' : 'point'),
  },
  {
    // Palette-only, deliberately: the authoritative menubar tree (FINAL_DESIGN_INDEX) has no
    // "cycle tool" item — the gizmo tool is picked from the toolbar. `T`/`⇧T` is the chord
    // (foundation §11.2) and ⌘K is its discoverable home.
    id: 'tool.cycleGizmo',
    title: 'Cycle gizmo tool',
    keywords: 'gizmo tool move rotate scale cycle translate',
    keepOpen: true,
    // `params === -1` cycles backward — the ⇧T half of the one binding. The palette and the
    // menus pass nothing and get the forward step.
    run: (params) => cycleGizmoTool(params === -1 ? -1 : 1),
  },
  {
    // Palette-only as well: the toggle's home is the Tool bar's W/L segmented control (it
    // changes EDITS, not display, so it is a tool parameter and never a View item —
    // design-build-mode.md §4.2). No chord: the authoritative table assigns none.
    id: 'tool.toggleGizmoSpace',
    title: 'Toggle gizmo space',
    keywords: 'gizmo space world local axes orientation handles',
    keepOpen: true,
    checked: () => $gizmoSpace.get() === 'local',
    run: () => {
      toggleGizmoSpace();
      toast({ title: `Gizmo space: ${$gizmoSpace.get() === 'local' ? 'Local' : 'World'}` });
    },
  },
  {
    // Palette-only for the same reason (design: design-data-engine-modes §B10 — Engine mode
    // has no menubar surface of its own; the designer's own button is the pointer route).
    id: 'engine.toggleExhaust',
    title: 'Toggle Exhaust Placement',
    keywords: 'exhaust nozzle plume placement gizmo engine',
    enabled: () => $mode.get() === 'engine',
    checked: () => $engineExhaustGizmo.get(),
    run: () => setEngineExhaustGizmo(!$engineExhaustGizmo.get()),
  },
  {
    id: 'tools.addRefLine',
    title: 'Add Reference Line',
    menuPath: 'Tools',
    keywords: 'reference line measure guide',
    // addReferenceLine activates the new line, which opens its editor (v1 parity).
    run: () => addReferenceLine(),
  },
  ...containerCommands,
  {
    id: 'tools.coverageCheck',
    title: 'Collider Coverage Check',
    menuPath: 'Tools',
    keywords: 'collider coverage check gaps physics',
    enabled: () => $part.get().colliders.length > 0,
    run: () => requestCoverageCheck(),
  },
  {
    id: 'seat.exit',
    title: 'Exit Seat View',
    menuPath: 'Tools ▸ Sit in Seat',
    keywords: 'seat iva exit leave view',
    enabled: () => $seatView.get() !== null,
    run: () => exitSeatView(),
  },
  {
    // INTERIM until the Outliner's Aids section: the container warn-precision toggle used
    // to live in the Measure popover, which dies with the v1 toolbar.
    id: 'tools.warnPrecision',
    title: 'Accurate Warn Check',
    menuPath: 'Tools ▸ Containers',
    keywords: 'container warn precision accurate vertex bbox',
    checked: () => $containerSettings.get().warnPrecision === 'vertex',
    keepOpen: true,
    run: () =>
      setContainerSettings({
        warnPrecision: $containerSettings.get().warnPrecision === 'vertex' ? 'bbox' : 'vertex',
      }),
  },
];

/**
 * `Tools ▸ Sit in Seat` — one row per `<IVASeat>`. KSA seats have no names, so document
 * order IS the identity (it is also the game's `C`-cycle order).
 */
export function seatCommands(): Command[] {
  return $part.get().ivaSeats.map((seat, index) => ({
    id: `seat:sit:${seat.id}`,
    title: `Seat ${index + 1}`,
    menuPath: 'Tools ▸ Sit in Seat',
    keywords: 'seat iva sit view interior camera',
    run: () => {
      // v1 pairing: entering the preview also selects the seat, so the inspector is
      // editing the seat you are looking through.
      enterSeatView(seat.id);
      select([{ kind: 'ivaSeat', id: seat.id }]);
    },
  }));
}

/**
 * INTERIM until the Outliner's Aids section: `Tools ▸ Measurements` — the list that used to
 * live in the Measure popover. Selecting a row makes it active, which opens its floating
 * editor (unchanged v1 surface).
 */
export function measurementAidCommands(): Command[] {
  return $measurements.get().map((measurement, index) => ({
    id: `aid:measurement:${measurement.id}`,
    title: `Measurement ${index + 1}`,
    menuPath: 'Tools ▸ Measurements',
    keywords: 'measurement line aid edit',
    run: () => setActiveMeasurement(measurement.id),
  }));
}

/** INTERIM until the Outliner's Aids section — see {@link measurementAidCommands}. */
export function containerAidCommands(): Command[] {
  const labels: Record<ReferenceShape, string> = {
    rect: 'Box',
    cylinder: 'Cylinder',
    sphere: 'Sphere',
  };
  return $containers.get().map((container, index) => ({
    id: `aid:container:${container.id}`,
    title: `${labels[container.shape]} ${index + 1}`,
    menuPath: 'Tools ▸ Containers',
    keywords: 'container reference volume aid edit',
    run: () => setActiveContainer(container.id),
  }));
}
