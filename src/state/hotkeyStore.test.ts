import { describe, it, expect, beforeEach } from 'vitest';
import {
  $activeScopes,
  $dialogOpen,
  $focusedSurface,
  initHotkeyStore,
  SURFACE_IDS,
} from './hotkeyStore';
import { $activeTool, $mode } from './modeStore';
import { $chainSession } from './chainStore';
import { $openDialog } from './dialogStore';
import { $paletteOpen } from './commandStore';

/**
 * Scope activation (design: `plans/flexo_v2/design/design-system-services.md` §4.2).
 *
 * `$activeScopes` is a lazy `computed`, so every test reads it through `.get()` after
 * writing its inputs; the atoms are written directly (they are all ephemeral view state, and
 * `setMode` choreography is `modeStore`'s own test's business).
 */

beforeEach(() => {
  $mode.set('build');
  $activeTool.set(null);
  $chainSession.set(null);
  $openDialog.set(null);
  $paletteOpen.set(false);
  $focusedSurface.set(null);
  document.body.innerHTML = '';
});

function scopes(): string[] {
  return [...$activeScopes.get()].sort();
}

describe('$activeScopes', () => {
  it('is global + viewport + the mode with nothing else going on', () => {
    expect(scopes()).toEqual(['global', 'mode:build', 'viewport']);
  });

  it('drops viewport while a dialog is open, but never global', () => {
    $openDialog.set({ id: 'projects' });
    expect($dialogOpen.get()).toBe(true);
    expect(scopes()).toEqual(['global', 'mode:build']);
  });

  it('drops viewport while the command palette is open', () => {
    $paletteOpen.set(true);
    expect($dialogOpen.get()).toBe(true);
    expect(scopes()).toEqual(['global', 'mode:build']);
  });

  it('tracks the mode and the armed tool', () => {
    $mode.set('animation');
    $activeTool.set('measure');
    expect(scopes()).toEqual(['global', 'mode:animation', 'tool:measure', 'viewport']);
  });

  it('activates surface:chain from the SESSION, with no focus involved', () => {
    $chainSession.set({ seedIds: ['a'], ops: [] });
    expect($focusedSurface.get()).toBe(null);
    expect(scopes()).toContain('surface:chain');
  });

  it('adds the focused surface, and tolerates it duplicating the chain scope', () => {
    $chainSession.set({ seedIds: ['a'], ops: [] });
    $focusedSurface.set('chain');
    expect(scopes()).toEqual(['global', 'mode:build', 'surface:chain', 'viewport']);
  });
});

describe('$focusedSurface (focusin resolution)', () => {
  it('resolves the nearest [data-surface] ancestor of the focus target', () => {
    initHotkeyStore();
    document.body.innerHTML = `
      <div data-surface="chain"><button id="inner">x</button></div>
      <button id="outside">y</button>`;

    document.getElementById('inner')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect($focusedSurface.get()).toBe('chain');

    document.getElementById('outside')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect($focusedSurface.get()).toBe(null);
  });

  it('ignores an unknown data-surface value rather than minting a scope', () => {
    initHotkeyStore();
    document.body.innerHTML = `<div data-surface="nope"><button id="inner">x</button></div>`;
    document.getElementById('inner')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect($focusedSurface.get()).toBe(null);
  });
});

describe('SURFACE_IDS', () => {
  it('are unique (they are scope-name fragments)', () => {
    expect(new Set(SURFACE_IDS).size).toBe(SURFACE_IDS.length);
  });
});
