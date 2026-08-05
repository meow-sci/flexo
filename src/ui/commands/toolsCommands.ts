import type { Command } from '../../state/commandStore';
import { $part, selectIvaSeat } from '../../state/editorStore';
import { $seatView, enterSeatView, exitSeatView } from '../../state/ivaStore';
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
      selectIvaSeat(index);
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
