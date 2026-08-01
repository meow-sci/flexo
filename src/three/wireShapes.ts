import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/**
 * Reusable **unit** wireframe outlines for the editor's non-mesh volumes — reference
 * containers ({@link import('./ContainerLayer').ContainerLayer}) and collision primitives
 * ({@link import('./ColliderObject').ColliderObject}).
 *
 * Every builder returns flat `[x,y,z, x,y,z, …]` segment PAIRS normalised into the unit
 * box `[-0.5, 0.5]³`, so the owning node's `scale` IS the volume's size in meters. That is
 * what lets the scale gizmo edit dimensions directly.
 *
 * Curved shapes take a user-controlled line count (`segments`); the *smoothness* of each
 * drawn circle is fixed at {@link CIRCLE_SMOOTH} so curves never get chunky when the line
 * count is low.
 */

/** Unit half-extent / unit radius — every builder works in the `[-0.5, 0.5]` box. */
const R = 0.5;

/** Chords per drawn circle — fixed so curves stay smooth regardless of line count. */
const CIRCLE_SMOOTH = 64;

/** Clamp for the user-controlled wireframe line count on curved surfaces. */
const MIN_SEGMENTS = 2;
const MAX_SEGMENTS = 64;

export function clampSegments(n: number): number {
  return Number.isFinite(n) ? Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, Math.round(n))) : 16;
}

/** Unit-cube (±0.5) edge segments as flat xyz pairs. */
export const RECT_EDGES: readonly number[] = ((): number[] => {
  const h = R;
  const c: Record<string, [number, number, number]> = {
    a: [-h, -h, -h],
    b: [h, -h, -h],
    cc: [h, -h, h],
    d: [-h, -h, h],
    e: [-h, h, -h],
    f: [h, h, -h],
    g: [h, h, h],
    k: [-h, h, h],
  };
  const edges: [string, string][] = [
    ['a', 'b'],
    ['b', 'cc'],
    ['cc', 'd'],
    ['d', 'a'],
    ['e', 'f'],
    ['f', 'g'],
    ['g', 'k'],
    ['k', 'e'],
    ['a', 'e'],
    ['b', 'f'],
    ['cc', 'g'],
    ['d', 'k'],
  ];
  return edges.flatMap(([p, q]) => [...c[p], ...c[q]]);
})();

/** Builds segment pairs for a ring of `n` chords; `at(cos, sin)` maps to a point. */
export function ring(
  n: number,
  at: (cos: number, sin: number) => [number, number, number],
): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n;
    const a1 = (2 * Math.PI * (i + 1)) / n;
    out.push(...at(Math.cos(a0), Math.sin(a0)), ...at(Math.cos(a1), Math.sin(a1)));
  }
  return out;
}

/**
 * Unit cylinder (r=0.5, h=1, axis Y): smooth top + bottom rings plus `struts`
 * evenly-spaced vertical lines on the side (the user-controlled count).
 */
export function cylinderEdges(struts: number): number[] {
  const bottom = ring(CIRCLE_SMOOTH, (c, s) => [c * R, -R, s * R]);
  const top = ring(CIRCLE_SMOOTH, (c, s) => [c * R, R, s * R]);
  const verticals: number[] = [];
  for (let i = 0; i < struts; i++) {
    const a = (2 * Math.PI * i) / struts;
    const c = Math.cos(a) * R;
    const s = Math.sin(a) * R;
    verticals.push(c, -R, s, c, R, s);
  }
  return [...bottom, ...top, ...verticals];
}

/**
 * Unit sphere (r=0.5): `rings` meridian great-circles (around Y) plus `rings - 1`
 * latitude rings — a globe whose line density the caller controls.
 */
export function sphereEdges(rings: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < rings; i++) {
    const ang = (Math.PI * i) / rings; // meridian plane angle
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    out.push(...ring(CIRCLE_SMOOTH, (c, s) => [c * ca * R, s * R, c * sa * R]));
  }
  for (let j = 1; j < rings; j++) {
    const y = -R + (2 * R * j) / rings;
    const rad = Math.sqrt(Math.max(0, R * R - y * y));
    out.push(...ring(CIRCLE_SMOOTH, (c, s) => [c * rad, y, s * rad]));
  }
  return out;
}

/** Chords per quarter-circle cap arc — enough to read as round at any line count. */
const CAP_ARC_CHORDS = 8;

/**
 * Capsule normalised into the unit box (axis Y): a cylindrical waist capped by two
 * hemispheres.
 *
 * Unlike the other builders this one is **ratio-dependent**. The owning node's scale is
 * non-uniform (`x = z = diameter`, `y = outer height`), so a hemispherical cap of world
 * radius `d/2` occupies `0.5` in normalised X/Z but only `aspect / 2` in normalised Y,
 * where `aspect = diameter / height`. Drawing the caps as normalised ELLIPSES is exactly
 * what makes them render as true hemispheres once the scale is applied — which is why the
 * geometry must be rebuilt whenever that ratio changes.
 *
 * @param aspect diameter ÷ outer height, in `(0, 1]`. 1 ⇒ the capsule IS a sphere.
 */
export function capsuleEdges(aspect: number, struts: number): number[] {
  const a = Math.max(1e-4, Math.min(1, aspect));
  const capY = a / 2; // normalised Y half-height of one hemispherical cap
  const waist = R - capY; // normalised Y of the cylinder/cap junction
  const out: number[] = [];

  // Junction rings + the two "equator" circles are what read as the capsule's silhouette.
  out.push(...ring(CIRCLE_SMOOTH, (c, s) => [c * R, waist, s * R]));
  out.push(...ring(CIRCLE_SMOOTH, (c, s) => [c * R, -waist, s * R]));

  for (let i = 0; i < struts; i++) {
    const ang = (2 * Math.PI * i) / struts;
    const cx = Math.cos(ang);
    const cz = Math.sin(ang);
    // Straight run along the waist.
    out.push(cx * R, -waist, cz * R, cx * R, waist, cz * R);
    // Quarter-arc over each cap, from the junction ring to the pole.
    for (let j = 0; j < CAP_ARC_CHORDS; j++) {
      const t0 = (Math.PI / 2) * (j / CAP_ARC_CHORDS);
      const t1 = (Math.PI / 2) * ((j + 1) / CAP_ARC_CHORDS);
      const p = (t: number, sign: number): [number, number, number] => [
        cx * R * Math.cos(t),
        sign * (waist + capY * Math.sin(t)),
        cz * R * Math.cos(t),
      ];
      out.push(...p(t0, 1), ...p(t1, 1));
      out.push(...p(t0, -1), ...p(t1, -1));
    }
  }
  return out;
}

/** Wraps flat segment-pair positions in a fat-line geometry. */
export function edgesGeometry(positions: readonly number[]): LineSegmentsGeometry {
  const geom = new LineSegmentsGeometry();
  geom.setPositions(positions as number[]);
  return geom;
}
