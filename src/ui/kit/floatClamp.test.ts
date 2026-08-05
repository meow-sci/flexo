import { describe, it, expect } from 'vitest';
import { clampFloatPos, resolveAnchor, type Rect } from './floatClamp';

// A 1280×800 window whose menubar is 22px tall and status bar 22px tall: the workspace
// band is the full-width strip between them.
const BAND: Rect = { left: 0, top: 22, width: 1280, height: 756 };
const VW = 1280;
// The viewport cell sits between a 300px left sidebar and a 340px right sidebar.
const CELL: Rect = { left: 300, top: 22, width: 640, height: 756 };

const SIZE = { w: 320, h: 200 };

describe('clampFloatPos', () => {
  it('leaves a position that is fully inside the band untouched', () => {
    expect(clampFloatPos({ x: 400, y: 100 }, SIZE, BAND, VW)).toEqual({ x: 400, y: 100 });
  });

  it('clamps x up when fewer than 120px would remain on screen at the left', () => {
    // 120 - 320 = -200
    expect(clampFloatPos({ x: -900, y: 100 }, SIZE, BAND, VW).x).toBe(-200);
    expect(clampFloatPos({ x: -200, y: 100 }, SIZE, BAND, VW).x).toBe(-200);
  });

  it('clamps x down when fewer than 120px would remain on screen at the right', () => {
    // 1280 - 120 = 1160
    expect(clampFloatPos({ x: 5000, y: 100 }, SIZE, BAND, VW).x).toBe(1160);
  });

  it('clamps y to the band top', () => {
    expect(clampFloatPos({ x: 400, y: -50 }, SIZE, BAND, VW).y).toBe(0);
  });

  it('clamps y so the 28px strip never leaves the band bottom', () => {
    // 756 - 28 = 728
    expect(clampFloatPos({ x: 400, y: 900 }, SIZE, BAND, VW).y).toBe(728);
  });

  it('offsets the horizontal bounds by a band that does not start at x=0', () => {
    const inset: Rect = { left: 100, top: 22, width: 1180, height: 756 };
    expect(clampFloatPos({ x: -5000, y: 0 }, SIZE, inset, VW).x).toBe(120 - 320 - 100);
    expect(clampFloatPos({ x: 5000, y: 0 }, SIZE, inset, VW).x).toBe(1280 - 120 - 100);
  });
});

describe('resolveAnchor', () => {
  it('resolves top-center against the viewport cell (the tool bar anchor)', () => {
    // cell centre 300 + (640 - 320)/2 = 460; y = cell.top + 8 - band.top = 8
    expect(resolveAnchor({ h: 'center', v: 'top', dx: 0, dy: 8 }, SIZE, CELL, BAND)).toEqual({
      x: 460,
      y: 8,
    });
  });

  it('resolves top-left against the viewport cell (the chain palette anchor)', () => {
    expect(resolveAnchor({ h: 'left', v: 'top', dx: 8, dy: 8 }, SIZE, CELL, BAND)).toEqual({
      x: 308,
      y: 8,
    });
  });

  it('resolves right and bottom edges as insets', () => {
    // x = 300 + 640 - 320 - 8 = 612 ; y = 22 + 756 - 200 - 8 - 22 = 548
    expect(resolveAnchor({ h: 'right', v: 'bottom', dx: 8, dy: 8 }, SIZE, CELL, BAND)).toEqual({
      x: 612,
      y: 548,
    });
  });
});
