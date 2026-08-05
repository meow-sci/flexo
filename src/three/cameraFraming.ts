import type { Vec3 } from '../ksa/types';
import type { ComputedBounds } from '../measure/bounds';

/**
 * The pure fit math behind **Frame Selection** (design: `design-build-mode.md` §5.3, LOCKED
 * #7). Kept out of `Viewport.ts` so it is unit-testable without a WebGL context — nothing
 * here touches three.js or the DOM.
 */

/** Fallback distance for a selection with no extent (a single point, an empty part). */
const POINT_DISTANCE = 5;

/** Breathing room around the fitted bounds, so the selection never touches the frame edge. */
const MARGIN = 1.1;

/**
 * The camera distance that fits a bounds box inside a perspective frustum.
 *
 * The box is treated as its bounding SPHERE (half the diagonal), which is what makes the
 * result orientation-independent: framing must not change as the user orbits. Both frustum
 * half-angles are considered and the TIGHTER one wins — on a tall, narrow viewport the
 * horizontal field is the binding constraint, and fitting only the vertical one would crop
 * a wide part off the sides.
 *
 * @param size   box dimensions in meters (`ComputedBounds.size`)
 * @param fovDeg the camera's VERTICAL field of view, in degrees (three's `camera.fov`)
 * @param aspect viewport width / height
 */
export function frameDistance(size: Vec3, fovDeg: number, aspect: number): number {
  const radius = 0.5 * Math.hypot(size.x, size.y, size.z);
  if (radius < 1e-6) return POINT_DISTANCE;
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  return (radius / Math.sin(Math.min(vHalf, hHalf))) * MARGIN;
}

/** The midpoint of a bounds box — the orbit target Frame Selection re-centers on. */
export function boundsCenter(bounds: Pick<ComputedBounds, 'min' | 'max'>): Vec3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
}
