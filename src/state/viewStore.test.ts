import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `$kindVisibility` is a per-browser VIEW preference (design-build-mode.md §5.4): all-true
 * by default, round-trips through localStorage, and is read DEFENSIVELY — a stored object
 * missing a kind gets that kind's default rather than `undefined` (which would read as
 * "hidden" and silently blank the viewport), and an unknown key is dropped instead of
 * migrated (constitution).
 *
 * Fresh module per test: `persistentJSON` snapshots localStorage at module evaluation.
 */
type ViewStore = typeof import('./viewStore');

async function loadStore(stored?: string): Promise<ViewStore> {
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem('flexo:kindVisibility', stored);
  vi.resetModules();
  return await import('./viewStore');
}

let view: ViewStore;

beforeEach(async () => {
  view = await loadStore();
});

describe('viewStore kind visibility', () => {
  it('defaults every kind to visible', () => {
    expect(view.kindVisibility()).toEqual({
      connector: true,
      collider: true,
      ivaSeat: true,
      light: true,
      kitten: true,
      aid: true,
    });
    expect(view.isKindVisible('light')).toBe(true);
  });

  it('toggles one kind and leaves the rest alone', () => {
    view.toggleKindVisible('collider');
    expect(view.isKindVisible('collider')).toBe(false);
    expect(view.isKindVisible('connector')).toBe(true);

    view.toggleKindVisible('collider');
    expect(view.isKindVisible('collider')).toBe(true);
  });

  it('fills missing keys from the defaults and drops unknown ones', async () => {
    const store = await loadStore(JSON.stringify({ light: false, gizmo: false }));
    expect(store.kindVisibility()).toEqual({
      connector: true,
      collider: true,
      ivaSeat: true,
      light: false,
      kitten: true,
      aid: true,
    });
    expect(Object.keys(store.kindVisibility())).not.toContain('gizmo');
  });

  it('survives a corrupt stored value', async () => {
    const store = await loadStore('"not an object"');
    expect(store.isKindVisible('kitten')).toBe(true);
  });
});

describe('viewStore camera intent (shipped in the camera phase — asserted, not re-created)', () => {
  it('frameCamera bumps the $cameraFrame nonce so a repeat press re-frames', () => {
    expect(view.$cameraFrame.get()).toBeNull();
    view.frameCamera();
    const first = view.$cameraFrame.get();
    view.frameCamera();
    expect(view.$cameraFrame.get()?.nonce).toBeGreaterThan(first!.nonce);
  });

  it('resetCamera drops the saved state and requests the default pose', () => {
    view.$cameraState.set({ position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] });
    view.resetCamera();
    expect(view.$cameraState.get()).toBeNull();
    expect(view.$cameraRestore.get()?.state.position).toEqual([3, 2, 4]);
  });
});
