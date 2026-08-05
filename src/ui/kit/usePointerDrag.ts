import { useEffect, useRef, useState } from 'react';

/**
 * Options for {@link usePointerDrag}. The callbacks are read from the latest
 * render at event time, so a handler may close over fresh props/state.
 */
export interface PointerDragOptions {
  /** Return false to refuse the drag (e.g. locked). Called on primary-button pointerdown. */
  onStart?(e: React.PointerEvent<Element>): void | false;
  /** rAF-batched deltas from the drag ORIGIN (not the previous frame). */
  onMove(dx: number, dy: number, e: PointerEvent): void;
  onEnd?(e: PointerEvent): void;
  /** Applied to document.documentElement.style.cursor for the drag's duration. */
  cursor?: string;
}

/**
 * THE pointer-drag primitive: pointer capture on the handle, window-level
 * move/up/cancel listeners, rAF-batched deltas measured from the pointerdown
 * origin, an optional document-wide cursor, and teardown that survives an
 * unmount in the middle of a drag.
 *
 * Every drag surface (sidebar + timeline resize, floating windows, split
 * dividers, list reorder grips) builds on this — do not hand-roll another one.
 * The handle element should carry `touch-none` so touch drags don't scroll.
 */
export function usePointerDrag(opts: PointerDragOptions): {
  /** Spread onto the drag handle element. The element should carry `touch-none`. */
  onPointerDown(e: React.PointerEvent<Element>): void;
  dragging: boolean;
} {
  const [dragging, setDragging] = useState(false);
  // Latest-callbacks ref: the window listeners outlive the render that created
  // them, so they must not close over stale callbacks.
  const optsRef = useRef(opts);
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    optsRef.current = opts;
  });

  // Unmount mid-drag: drop the listeners, cancel the frame, restore the cursor.
  useEffect(() => () => teardownRef.current?.(), []);

  const onPointerDown = (e: React.PointerEvent<Element>) => {
    if (e.button !== 0) return;
    if (teardownRef.current) return; // a drag is already in flight
    if (optsRef.current.onStart?.(e) === false) return;
    e.preventDefault();

    const handle = e.currentTarget;
    const { pointerId } = e;
    const startX = e.clientX;
    const startY = e.clientY;
    handle.setPointerCapture(pointerId);

    const { cursor } = optsRef.current;
    const restoreCursor = document.documentElement.style.cursor;
    if (cursor) document.documentElement.style.cursor = cursor;

    let latest: PointerEvent | null = null;
    let pending = false;
    let frame = 0;

    const flush = () => {
      pending = false;
      const ev = latest;
      latest = null;
      if (ev) optsRef.current.onMove(ev.clientX - startX, ev.clientY - startY, ev);
    };

    const onPointerMove = (ev: PointerEvent) => {
      latest = ev;
      // `pending` (not `frame`) guards scheduling: a synchronous rAF runs
      // `flush` before the id is even assigned.
      if (pending) return;
      pending = true;
      frame = requestAnimationFrame(flush);
    };

    const teardown = () => {
      teardownRef.current = null;
      if (pending) {
        cancelAnimationFrame(frame);
        pending = false;
        latest = null;
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (cursor) document.documentElement.style.cursor = restoreCursor;
    };

    const onPointerUp = (ev: PointerEvent) => {
      // Deliver the last batched move before ending, so the drag never settles
      // a frame behind the pointer.
      const trailing = pending ? latest : null;
      teardown();
      if (trailing)
        optsRef.current.onMove(trailing.clientX - startX, trailing.clientY - startY, trailing);
      setDragging(false);
      optsRef.current.onEnd?.(ev);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    teardownRef.current = teardown;
    setDragging(true);
  };

  return { onPointerDown, dragging };
}
