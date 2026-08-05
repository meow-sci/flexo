import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { type PointerDragOptions, usePointerDrag } from './usePointerDrag';

// Minimal mounted-hook harness (no component-test infra in this repo): a probe
// component captures the hook's return so the test can drive pointerdown, and
// the move/up listeners are the real ones the hook put on `window`.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Drag = ReturnType<typeof usePointerDrag>;

async function mountProbe(opts: PointerDragOptions) {
  let api: Drag | null = null;
  function Probe() {
    api = usePointerDrag(opts);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(Probe)));
  return {
    api: () => api as unknown as Drag,
    unmount: () => act(async () => root.unmount()),
  };
}

const handle = document.createElement('div');

function downEvent(clientX: number, clientY: number, button = 0) {
  return {
    button,
    pointerId: 1,
    clientX,
    clientY,
    currentTarget: handle,
    preventDefault: () => {},
  } as unknown as React.PointerEvent<Element>;
}

function fire(
  type: 'pointermove' | 'pointerup' | 'pointercancel',
  clientX: number,
  clientY: number,
) {
  window.dispatchEvent(new PointerEvent(type, { clientX, clientY }));
}

describe('usePointerDrag', () => {
  beforeEach(() => {
    // Default: frames run synchronously, so one pointermove == one onMove.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.cursor = '';
  });

  it('reports deltas measured from the drag origin, then ends once', async () => {
    const moves: Array<[number, number]> = [];
    const ends: number[] = [];
    const probe = await mountProbe({
      onMove: (dx, dy) => moves.push([dx, dy]),
      onEnd: () => ends.push(1),
    });

    await act(async () => probe.api().onPointerDown(downEvent(10, 20)));
    expect(probe.api().dragging).toBe(true);

    await act(async () => fire('pointermove', 20, 30));
    await act(async () => fire('pointermove', 30, 50));
    expect(moves).toEqual([
      [10, 10],
      [20, 30],
    ]);

    await act(async () => fire('pointerup', 30, 50));
    expect(ends).toEqual([1]);
    expect(probe.api().dragging).toBe(false);

    // Listeners are gone: a stray move after the drag reports nothing.
    await act(async () => fire('pointermove', 99, 99));
    expect(moves).toHaveLength(2);
    await probe.unmount();
  });

  it('does not start when onStart refuses', async () => {
    const moves: Array<[number, number]> = [];
    const ends: number[] = [];
    const probe = await mountProbe({
      onStart: () => false,
      onMove: (dx, dy) => moves.push([dx, dy]),
      onEnd: () => ends.push(1),
    });

    await act(async () => probe.api().onPointerDown(downEvent(10, 20)));
    expect(probe.api().dragging).toBe(false);
    await act(async () => fire('pointermove', 40, 40));
    await act(async () => fire('pointerup', 40, 40));
    expect(moves).toEqual([]);
    expect(ends).toEqual([]);
    await probe.unmount();
  });

  it('ignores non-primary buttons', async () => {
    const starts: number[] = [];
    const moves: Array<[number, number]> = [];
    const probe = await mountProbe({
      onStart: () => {
        starts.push(1);
      },
      onMove: (dx, dy) => moves.push([dx, dy]),
    });

    await act(async () => probe.api().onPointerDown(downEvent(10, 20, 2)));
    expect(starts).toEqual([]);
    expect(probe.api().dragging).toBe(false);
    await act(async () => fire('pointermove', 40, 40));
    expect(moves).toEqual([]);
    await probe.unmount();
  });

  it('applies the cursor for the drag and restores it afterwards', async () => {
    const probe = await mountProbe({ onMove: () => {}, cursor: 'col-resize' });

    await act(async () => probe.api().onPointerDown(downEvent(0, 0)));
    expect(document.documentElement.style.cursor).toBe('col-resize');

    await act(async () => fire('pointerup', 5, 5));
    expect(document.documentElement.style.cursor).toBe('');
    await probe.unmount();
  });

  it('batches moves into one frame and still delivers the last one on end', async () => {
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      nextId += 1;
      pending.set(nextId, cb);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      pending.delete(id);
    });

    const moves: Array<[number, number]> = [];
    const probe = await mountProbe({ onMove: (dx, dy) => moves.push([dx, dy]) });

    await act(async () => probe.api().onPointerDown(downEvent(0, 0)));
    await act(async () => fire('pointermove', 5, 5));
    await act(async () => fire('pointermove', 8, 9));
    expect(moves).toEqual([]); // nothing until the frame runs
    expect(pending.size).toBe(1); // ...and only ONE frame was scheduled

    await act(async () => fire('pointerup', 8, 9));
    expect(moves).toEqual([[8, 9]]); // the batched move, delivered before onEnd
    expect(pending.size).toBe(0); // the scheduled frame was cancelled
    await probe.unmount();
  });

  it('tears down when the component unmounts mid-drag', async () => {
    const moves: Array<[number, number]> = [];
    const probe = await mountProbe({
      onMove: (dx, dy) => moves.push([dx, dy]),
      cursor: 'row-resize',
    });

    await act(async () => probe.api().onPointerDown(downEvent(0, 0)));
    expect(document.documentElement.style.cursor).toBe('row-resize');

    await probe.unmount();
    expect(document.documentElement.style.cursor).toBe('');
    await act(async () => fire('pointermove', 20, 20));
    expect(moves).toEqual([]);
  });
});
