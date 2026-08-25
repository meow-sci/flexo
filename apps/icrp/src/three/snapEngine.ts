/**
 * Magnetic drag-snapping (the lego/tank-farm journey): pure KSA-frame math the
 * body drag runs each move. Two mechanisms, connector wins:
 *
 *  1. **Connector docking** — imported-part connectors (KSA vehicle-editor
 *     attach nodes, faces local +X) dock to OPPOSING connectors on stationary
 *     placements. The snap delta is full 3D — dragging a tank over another
 *     tank's top node lifts it into place, exactly the vehicle-editor feel.
 *  2. **Box alignment** — per ground axis (east/north) independently, the
 *     dragged group's AABB snaps flush against (touching) or center-aligned
 *     with a stationary placement's AABB. This is what lines tank ROWS up when
 *     no side connectors exist.
 *
 * All positions/boxes here are KSA-frame ({x: up, y: east, z: north}); the
 * caller converts three-space boxes via `ksaBoxFromThree`. Radius comes from
 * the camera (screen-space feel) — the caller computes it.
 */
import * as THREE from 'three';
import type { SnapConnector, Transform, Vec3 } from '../ksa/types';

export interface WorldConnector {
  /** KSA-frame world position. */
  position: Vec3;
  /** KSA-frame world facing (unit vector, the connector's +X arrow). */
  facing: Vec3;
}

/** KSA-frame axis-aligned box: per-axis [min, max] on up/east/north. */
export interface KsaBox {
  up: [number, number];
  east: [number, number];
  north: [number, number];
}

/** Composes a placement-local connector into KSA world space (scale composed). */
export function connectorWorld(conn: SnapConnector, placement: Transform): WorldConnector {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(placement.rotation.x, placement.rotation.y, placement.rotation.z, 'ZYX'),
  );
  const p = new THREE.Vector3(
    conn.position.x * placement.scale.x,
    conn.position.y * placement.scale.y,
    conn.position.z * placement.scale.z,
  )
    .applyQuaternion(q)
    .add(new THREE.Vector3(placement.position.x, placement.position.y, placement.position.z));
  const cq = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(conn.rotation.x, conn.rotation.y, conn.rotation.z, 'ZYX'),
  );
  const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(cq).applyQuaternion(q).normalize();
  return {
    position: { x: p.x, y: p.y, z: p.z },
    facing: { x: dir.x, y: dir.y, z: dir.z },
  };
}

export interface ConnectorSnap {
  /** KSA-frame delta to ADD to the dragged group (docks the pair exactly). */
  delta: Vec3;
  /** The stationary connector's world position (for the docking indicator). */
  at: Vec3;
}

/**
 * The nearest OPPOSING connector pair within `radius`, or null. Opposing =
 * facings at > ~120° to each other (a top node accepts a bottom node, never a
 * sibling top pointing the same way — that would overlap the parts).
 */
export function bestConnectorSnap(
  moving: readonly WorldConnector[],
  stationary: readonly WorldConnector[],
  radius: number,
): ConnectorSnap | null {
  let best: ConnectorSnap | null = null;
  let bestD = radius;
  for (const m of moving) {
    for (const s of stationary) {
      const dot = m.facing.x * s.facing.x + m.facing.y * s.facing.y + m.facing.z * s.facing.z;
      if (dot > -0.5) continue;
      const dx = s.position.x - m.position.x;
      const dy = s.position.y - m.position.y;
      const dz = s.position.z - m.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d <= bestD) {
        bestD = d;
        best = { delta: { x: dx, y: dy, z: dz }, at: s.position };
      }
    }
  }
  return best;
}

export type AxisSnapKind = 'flush-min' | 'flush-max' | 'center';

export interface AxisSnap {
  /** Delta to ADD on this axis. */
  delta: number;
  kind: AxisSnapKind;
  /** The coordinate the guide line sits at (the shared edge / center). */
  at: number;
}

/**
 * The best snap for one axis: the moving range's min against a stationary max
 * (flush), max against min, or centers aligned — smallest correction within
 * `radius` wins. `flushGap` leaves a fixed clearance (0 = touching).
 */
export function bestAxisSnap(
  moving: [number, number],
  stationary: readonly [number, number][],
  radius: number,
  flushGap = 0,
): AxisSnap | null {
  const movingCenter = (moving[0] + moving[1]) / 2;
  let best: AxisSnap | null = null;
  const consider = (delta: number, kind: AxisSnapKind, at: number) => {
    if (Math.abs(delta) <= radius && (!best || Math.abs(delta) < Math.abs(best.delta))) {
      best = { delta, kind, at };
    }
  };
  for (const s of stationary) {
    consider(s[1] + flushGap - moving[0], 'flush-min', s[1]);
    consider(s[0] - flushGap - moving[1], 'flush-max', s[0]);
    consider((s[0] + s[1]) / 2 - movingCenter, 'center', (s[0] + s[1]) / 2);
  }
  return best;
}

/** Ranges overlap (or nearly, within `slack`) — gates cross-axis candidates. */
export function rangesNear(a: [number, number], b: [number, number], slack: number): boolean {
  return a[0] <= b[1] + slack && b[0] <= a[1] + slack;
}

export interface BoxSnapResult {
  east: AxisSnap | null;
  north: AxisSnap | null;
}

/**
 * Ground-axis box snapping: east and north resolve independently, and a
 * stationary box only proposes on one axis when the boxes are near each other
 * on the OTHER axis (so a far-away shed can't yank the row sideways).
 */
export function bestBoxSnap(
  moving: KsaBox,
  stationary: readonly KsaBox[],
  radius: number,
): BoxSnapResult {
  const NEAR = Math.max(radius * 4, 6);
  const eastRanges: [number, number][] = [];
  const northRanges: [number, number][] = [];
  for (const s of stationary) {
    if (rangesNear(moving.north, s.north, NEAR)) eastRanges.push(s.east);
    if (rangesNear(moving.east, s.east, NEAR)) northRanges.push(s.north);
  }
  return {
    east: bestAxisSnap(moving.east, eastRanges, radius),
    north: bestAxisSnap(moving.north, northRanges, radius),
  };
}

/** Converts a three-space Box3 to KSA ranges (three x=east, y=up, z=-north). */
export function ksaBoxFromThree(box: {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}): KsaBox {
  return {
    up: [box.min.y, box.max.y],
    east: [box.min.x, box.max.x],
    north: [-box.max.z, -box.min.z],
  };
}

/** Shifts a KSA box by ground-plane deltas (the drag candidate position). */
export function shiftKsaBox(box: KsaBox, dEast: number, dNorth: number, dUp = 0): KsaBox {
  return {
    up: [box.up[0] + dUp, box.up[1] + dUp],
    east: [box.east[0] + dEast, box.east[1] + dEast],
    north: [box.north[0] + dNorth, box.north[1] + dNorth],
  };
}
