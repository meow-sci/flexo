import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * What these pin: the effective-snap rule (`enabled XOR invert`), the step clamps, and the
 * fact that EVERY mutator re-applies — the gizmo's `$snap` must never lag the store the UI
 * shows, because the Tool bar magnet, the status chip and the ⌃ hold-invert all read one
 * source (design-build-mode.md §4.1).
 *
 * Each test gets a FRESH module instance: `persistentJSON` snapshots localStorage when the
 * module is first evaluated, so seeding storage after import would be silently ignored.
 */
type SnapStore = typeof import('./snapStore');
type EditorStore = typeof import('./editorStore');

let snap: SnapStore;
let editor: EditorStore;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  snap = await import('./snapStore');
  editor = await import('./editorStore');
});

describe('snapStore', () => {
  it('starts disabled, with the gizmo un-snapped', () => {
    expect(snap.$snapEnabled.get()).toBe(false);
    snap.applySnapToGizmo(false);
    expect(editor.$snap.get()).toEqual({});
  });

  it('toggleSnap flips $snap between empty and the current steps', () => {
    snap.toggleSnap();
    expect(snap.$snapEnabled.get()).toBe(true);
    expect(editor.$snap.get()).toEqual({ translate: 0.1, rotateDeg: 15 });

    snap.toggleSnap();
    expect(snap.$snapEnabled.get()).toBe(false);
    expect(editor.$snap.get()).toEqual({});
  });

  it('invert enables snapping while disabled (the ⌃ hold)', () => {
    snap.applySnapToGizmo(true);
    expect(editor.$snap.get()).toEqual({ translate: 0.1, rotateDeg: 15 });
  });

  it('invert frees the drag while snapping is on', () => {
    snap.toggleSnap();
    snap.applySnapToGizmo(true);
    expect(editor.$snap.get()).toEqual({});
    // Releasing ⌃ mid-drag restores it.
    snap.applySnapToGizmo(false);
    expect(editor.$snap.get()).toEqual({ translate: 0.1, rotateDeg: 15 });
  });

  it('clamps the translate step and re-applies', () => {
    snap.toggleSnap();
    snap.setSnapTranslateStep(0);
    expect(snap.$snapTranslateStep.get()).toBe(0.001);
    expect(editor.$snap.get()).toEqual({ translate: 0.001, rotateDeg: 15 });

    snap.setSnapTranslateStep(0.25);
    expect(editor.$snap.get()).toEqual({ translate: 0.25, rotateDeg: 15 });
  });

  it('clamps the rotate step to 1–180 and re-applies', () => {
    snap.toggleSnap();
    snap.setSnapRotateStep(0);
    expect(snap.$snapRotateStep.get()).toBe(1);
    snap.setSnapRotateStep(999);
    expect(snap.$snapRotateStep.get()).toBe(180);
    expect(editor.$snap.get()).toEqual({ translate: 0.1, rotateDeg: 180 });
  });

  it('never writes a scale snap — $snap carries translate/rotate only', () => {
    snap.toggleSnap();
    expect(Object.keys(editor.$snap.get()).sort()).toEqual(['rotateDeg', 'translate']);
  });
});
