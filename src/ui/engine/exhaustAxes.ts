import type { Vec3 } from '../../ksa/types';

/**
 * The six cardinal unit vectors the nozzle editor's axis choosers offer, in one order, with
 * the labels both choosers and the rotated-placement hint render.
 */
export const AXIS_DIRECTIONS = [
  { id: '-x', label: '−X', direction: { x: -1, y: 0, z: 0 } },
  { id: '+x', label: '+X', direction: { x: 1, y: 0, z: 0 } },
  { id: '-y', label: '−Y', direction: { x: 0, y: -1, z: 0 } },
  { id: '+y', label: '+Y', direction: { x: 0, y: 1, z: 0 } },
  { id: '-z', label: '−Z', direction: { x: 0, y: 0, z: -1 } },
  { id: '+z', label: '+Z', direction: { x: 0, y: 0, z: 1 } },
] as const;

export type AxisDirection = (typeof AXIS_DIRECTIONS)[number];

/**
 * How far (per component) a vector may sit from a cardinal axis and still count as it.
 *
 * A placement's Euler angles are stored to six decimals (`1.570796` for a right angle), so
 * rotating an exact Part-space axis back into that placement's frame leaves ~3e-7 residue on
 * the other two components. Snapping under this tolerance turns that residue back into the
 * exact `(0, 0, -1)` the user asked for — an angular error of well under 0.01°, invisible to
 * the game and far below what the six-decimal XML can express anyway.
 */
export const AXIS_SNAP_TOLERANCE = 1e-4;

/** The cardinal axis `v` is within {@link AXIS_SNAP_TOLERANCE} of, or null for anything else. */
export function nearestAxis(v: Vec3): AxisDirection | null {
  return (
    AXIS_DIRECTIONS.find(
      ({ direction }) =>
        Math.abs(direction.x - v.x) <= AXIS_SNAP_TOLERANCE &&
        Math.abs(direction.y - v.y) <= AXIS_SNAP_TOLERANCE &&
        Math.abs(direction.z - v.z) <= AXIS_SNAP_TOLERANCE,
    ) ?? null
  );
}

/** `v` replaced by the exact cardinal axis it is within tolerance of; otherwise `v` itself. */
export function snapToAxis(v: Vec3): Vec3 {
  const axis = nearestAxis(v);
  return axis ? { ...axis.direction } : { ...v };
}

/** `+X` / `−Z` for a cardinal vector, else the vector to two decimals — for the hint line. */
export function axisLabel(v: Vec3): string {
  const axis = nearestAxis(v);
  if (axis) return axis.label;
  const c = (n: number) => (Math.abs(n) < 0.005 ? '0' : n.toFixed(2));
  return `(${c(v.x)}, ${c(v.y)}, ${c(v.z)})`;
}
