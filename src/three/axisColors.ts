/**
 * The X/Y/Z identity colors, shared by the 3D {@link AxisGizmo} and any HTML
 * readout that labels a per-axis number — so a red arrow in the DOM always means
 * the same axis as the red arrow in the viewport corner.
 *
 * CSS hex strings are the single source of truth: three's `Color` parses them
 * directly, and an unlit, non-tone-mapped material round-trips the exact same hex
 * back out through the renderer's sRGB output conversion. Keep it that way — a
 * second numeric copy would be free to drift.
 *
 * Deliberately dependency-free (no three, no react): both sides import it.
 */

export type AxisKey = 'x' | 'y' | 'z';

/** Red / green / blue, brightened for legibility on flexo's charcoal canvas. */
export const AXIS_COLOR_CSS: Record<AxisKey, string> = {
  x: '#ff5468',
  y: '#7fd94b',
  z: '#4d9dff',
};
