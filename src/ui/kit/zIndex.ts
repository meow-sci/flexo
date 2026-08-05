/**
 * The app's ONLY z-index scale (foundation §1.3). Feature code must never use a
 * literal z-index / Tailwind z-* class — take a tier from here.
 * popovers/menus/tooltips are react-aria portals: above everything, portal order.
 */
export const z = {
  canvasOverlay: 10, // in-viewport: drop zone, marquee div, FPS panel, CSS2D host
  dock: 20, // sidebar/timeline internals: resize handles, sticky headers
  float: 30, // FloatingWindows (above sidebars; intra-tier order from floatOrder)
  overlay: 50, // kit Modal overlays
} as const;
