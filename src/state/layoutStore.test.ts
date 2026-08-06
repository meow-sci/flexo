import { describe, it, expect, beforeEach } from 'vitest';
import {
  $layout,
  LAYOUT_DEFAULTS,
  raiseFloat,
  resetLayout,
  sanitizeLayout,
  setSidebarWidth,
  setTimelineHeight,
  setTimelineHidden,
  toggleSidebar,
  toggleTimeline,
} from './layoutStore';

beforeEach(() => {
  localStorage.clear();
  $layout.set(LAYOUT_DEFAULTS);
});

describe('$layout', () => {
  it('defaults to LAYOUT_DEFAULTS on a fresh store', () => {
    expect($layout.get()).toEqual(LAYOUT_DEFAULTS);
  });
});

describe('setSidebarWidth', () => {
  it('clamps the left sidebar into [220, 480]', () => {
    setSidebarWidth('left', 100);
    expect($layout.get().left.width).toBe(220);

    setSidebarWidth('left', 9999);
    expect($layout.get().left.width).toBe(480);
  });

  it('clamps the right sidebar into [260, 640]', () => {
    setSidebarWidth('right', 100);
    expect($layout.get().right.width).toBe(260);
  });
});

describe('toggleSidebar', () => {
  it('flips only collapsed, leaving width untouched', () => {
    setSidebarWidth('right', 400);
    toggleSidebar('right');
    expect($layout.get().right).toEqual({ width: 400, collapsed: true });

    toggleSidebar('right');
    expect($layout.get().right).toEqual({ width: 400, collapsed: false });
  });
});

describe('the timeline dock', () => {
  it('defaults to 220px, expanded and shown', () => {
    expect($layout.get().timeline).toEqual({ height: 220, collapsed: false, hidden: false });
  });

  it('clamps the height into [120, 50vh]', () => {
    setTimelineHeight(10);
    expect($layout.get().timeline.height).toBe(120);

    setTimelineHeight(99999);
    expect($layout.get().timeline.height).toBe(Math.round(window.innerHeight / 2));
  });

  it('collapse and hide are INDEPENDENT (the ⌄ control vs Window ▸ Timeline)', () => {
    setTimelineHeight(300);
    toggleTimeline();
    expect($layout.get().timeline).toEqual({ height: 300, collapsed: true, hidden: false });

    setTimelineHidden(true);
    expect($layout.get().timeline).toEqual({ height: 300, collapsed: true, hidden: true });

    toggleTimeline();
    setTimelineHidden(false);
    expect($layout.get().timeline).toEqual({ height: 300, collapsed: false, hidden: false });
  });

  it('reads a stored value that predates `hidden` as "shown" — defaulted, never migrated', () => {
    expect(sanitizeLayout({ timeline: { height: 200, collapsed: true } }).timeline).toEqual({
      height: 200,
      collapsed: true,
      hidden: false,
    });
    expect(
      sanitizeLayout({ timeline: { height: 200, collapsed: true, hidden: 'yes' } }).timeline,
    ).toEqual({ height: 200, collapsed: true, hidden: false });
  });
});

describe('sanitizeLayout', () => {
  it('drops garbage entirely: a non-object input yields the defaults', () => {
    expect(sanitizeLayout('garbage')).toEqual(LAYOUT_DEFAULTS);
    expect(sanitizeLayout(null)).toEqual(LAYOUT_DEFAULTS);
    expect(sanitizeLayout(42)).toEqual(LAYOUT_DEFAULTS);
  });

  it('falls back per-slice: a malformed left slice defaults, valid slices are preserved', () => {
    const result = sanitizeLayout({
      left: { width: 'x' },
      right: { width: 500, collapsed: true },
    });
    expect(result.left).toEqual(LAYOUT_DEFAULTS.left);
    expect(result.right).toEqual({ width: 500, collapsed: true });
    expect(result.timeline).toEqual(LAYOUT_DEFAULTS.timeline);
    expect(result.float).toEqual({});
    expect(result.floatOrder).toEqual([]);
    expect(result.floatHidden).toEqual([]);
  });

  it('re-clamps otherwise-valid widths/heights into range', () => {
    const result = sanitizeLayout({ left: { width: 9999, collapsed: false } });
    expect(result.left.width).toBe(480);
  });

  it('keeps only well-formed float entries and drops the rest', () => {
    const result = sanitizeLayout({
      float: { toolbar: { x: 10, y: 20 }, chain: null, bogus: { x: 'nope' }, weird: 5 },
    });
    expect(result.float).toEqual({ toolbar: { x: 10, y: 20 }, chain: null });
  });

  it('requires floatOrder/floatHidden to be string arrays, else defaults to []', () => {
    expect(sanitizeLayout({ floatOrder: ['a', 'b'] }).floatOrder).toEqual(['a', 'b']);
    expect(sanitizeLayout({ floatOrder: ['a', 2] }).floatOrder).toEqual([]);
    expect(sanitizeLayout({ floatOrder: 'nope' }).floatOrder).toEqual([]);
  });
});

describe('raiseFloat', () => {
  it('appends an id absent from floatOrder', () => {
    raiseFloat('toolbar');
    expect($layout.get().floatOrder).toEqual(['toolbar']);
  });

  it('moves an already-present id to the end, keeping the others in place', () => {
    raiseFloat('toolbar');
    raiseFloat('chain');
    raiseFloat('toolbar');
    expect($layout.get().floatOrder).toEqual(['chain', 'toolbar']);
  });
});

describe('resetLayout', () => {
  it('restores LAYOUT_DEFAULTS after arbitrary mutation', () => {
    setSidebarWidth('left', 250);
    toggleSidebar('right');
    toggleTimeline();
    raiseFloat('toolbar');

    resetLayout();

    expect($layout.get()).toEqual(LAYOUT_DEFAULTS);
  });
});

describe('persistence', () => {
  it('writes through to localStorage under flexo:layout', () => {
    setSidebarWidth('left', 260);
    const stored = JSON.parse(localStorage.getItem('flexo:layout') ?? 'null');
    expect(stored).toEqual($layout.get());
    expect(stored.left.width).toBe(260);
  });
});
