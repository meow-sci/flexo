import { LAYER_COLORS, type LayerColor } from '../../ksa/types';

/**
 * How the twelve document-side {@link LayerColor} names render (design:
 * design-build-mode.md §2.3.1). The DOCUMENT stores only the name, so this table is pure
 * presentation and may be restyled without touching a single saved project.
 *
 * The values are Tailwind's `-400` hues of the same names — bright enough to read as a dot
 * on the dark-only panel background, muted enough that a 2px row tint never competes with
 * the selection accent. Layer color is editor chrome ONLY: it never reaches a 3D material
 * and never reaches KSA XML.
 */
export const LAYER_COLOR_HEX: Record<LayerColor, string> = {
  slate: '#94a3b8',
  red: '#f87171',
  orange: '#fb923c',
  amber: '#fbbf24',
  lime: '#a3e635',
  green: '#4ade80',
  teal: '#2dd4bf',
  cyan: '#22d3ee',
  blue: '#60a5fa',
  violet: '#a78bfa',
  fuchsia: '#e879f9',
  rose: '#fb7185',
};

/**
 * The swatch order the color popover renders in — the document's own list, re-exported so
 * every Outliner module imports its colors from one place.
 */
export { LAYER_COLORS, type LayerColor };
