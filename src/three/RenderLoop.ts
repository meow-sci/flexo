/**
 * On-demand render driver, shared by every flexo viewport.
 *
 * A 3D editor has no reason to redraw a scene that did not change, and redrawing
 * anyway is expensive in a way that never shows up in a JS profile: an idle,
 * EMPTY workspace driven by `renderer.setAnimationLoop` costs ~40% CPU across the
 * browser's renderer + GPU processes on a 120 Hz display (measured: 29% GPU
 * process + 9% renderer, ~0% of it in app JS) because every vsync re-renders,
 * re-resolves the MSAA buffer and re-composites an identical frame — and keeps
 * the GPU clocked up while it does. So frames here are REQUESTED, never
 * free-running: nothing is drawn until someone calls {@link invalidate}.
 *
 * THE CONTRACT FOR CALLERS: anything that can change a pixel must invalidate.
 * In practice that is the store subscriptions that reconcile the scene (see
 * `EditorScene.sub`, which does it for every subscription centrally), the
 * `change` event of every control/gizmo, resize, and the completion of any async
 * load that mutates the scene. A missed invalidate shows up as a stale viewport,
 * so keep the wiring next to the mutation rather than sprinkling speculative
 * calls at call sites.
 */
export class RenderLoop {
  private readonly draw: () => void
  /** In-flight rAF handle (0 = no frame scheduled). */
  private handle = 0
  private continuous = false
  private disposed = false

  constructor(draw: () => void) {
    this.draw = draw
  }

  /**
   * Requests exactly one frame. Coalescing is the point: a store update that
   * touches twenty objects can call this twenty times and still cost one render.
   */
  invalidate(): void {
    if (this.disposed || this.handle !== 0) return
    this.handle = requestAnimationFrame(this.tick)
  }

  /**
   * Holds the loop open at display refresh rate. Only for the cases that genuinely
   * need a frame per vsync regardless of change — today just the FPS overlay, whose
   * reading would be meaningless (and alarming) against an on-demand loop.
   */
  setContinuous(on: boolean): void {
    if (on === this.continuous) return
    this.continuous = on
    if (on) this.invalidate()
  }

  private readonly tick = (): void => {
    this.handle = 0
    if (this.disposed) return
    // Re-arm BEFORE drawing so an invalidate() raised during the draw (damping,
    // for one) coalesces into the frame already scheduled instead of being lost.
    if (this.continuous) this.invalidate()
    this.draw()
  }

  dispose(): void {
    this.disposed = true
    if (this.handle !== 0) cancelAnimationFrame(this.handle)
    this.handle = 0
  }
}
