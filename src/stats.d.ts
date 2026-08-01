/**
 * Minimal ambient types for stats.js 0.17.x. The package ships no declarations
 * and we keep deps lean (no `@types/stats.js`), so declare just the surface the
 * {@link src/three/Viewport.ts} FPS overlay uses.
 */
declare module 'stats.js' {
  class Stats {
    /** Panel container element — append it to the DOM to show the overlay. */
    readonly dom: HTMLDivElement;
    /** Choose the visible panel — 0: FPS, 1: ms/frame, 2: MB (if available). */
    showPanel(id: number): void;
    /** Start sampling the current frame; pair with {@link end}. */
    begin(): void;
    /** Finish sampling the current frame and update the active panel. */
    end(): number;
  }
  export default Stats;
}
