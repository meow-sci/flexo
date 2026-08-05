import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDialog, openDialog } from './dialogStore';
import {
  $heldModifiers,
  $modifierHints,
  initModifierListeners,
  registerModifierHints,
  setHoverContext,
} from './modifierStore';

// Idempotent by contract — calling it in every test must not double-install.
beforeEach(() => {
  initModifierListeners();
  initModifierListeners();
  window.dispatchEvent(new Event('blur'));
  setHoverContext('none');
  closeDialog();
});

describe('held modifiers', () => {
  it('reads flags off a keydown and writes the atom exactly once', () => {
    const changes = vi.fn();
    const unlisten = $heldModifiers.listen(changes);

    window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }));

    expect($heldModifiers.get()).toEqual({ alt: false, shift: true, ctrl: false, meta: false });
    expect(changes).toHaveBeenCalledTimes(1);
    unlisten();
  });

  it('diff-before-set: a repeat with the same flags does not touch the atom', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }));

    const changes = vi.fn();
    const unlisten = $heldModifiers.listen(changes);
    window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { shiftKey: true }));
    expect(changes).not.toHaveBeenCalled();
    unlisten();
  });

  it('re-syncs from a mouse event — the macOS ⌘-keyup-suppression correction channel', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true }));
    expect($heldModifiers.get().meta).toBe(true);

    // No keyup ever arrives; the next pointerdown carries the truth.
    window.dispatchEvent(new MouseEvent('pointerdown', { metaKey: false }));
    expect($heldModifiers.get().meta).toBe(false);
  });

  it('resets everything on window blur', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, ctrlKey: true }));
    expect($heldModifiers.get()).toEqual({ alt: true, shift: false, ctrl: true, meta: false });

    window.dispatchEvent(new Event('blur'));
    expect($heldModifiers.get()).toEqual({ alt: false, shift: false, ctrl: false, meta: false });
  });
});

describe('hint pipeline', () => {
  registerModifierHints('test-viewport', (ctx) =>
    ctx.hover === 'viewport' && ctx.hasSelection === false
      ? [
          { mod: 'shift', label: 'Box select drag', priority: 20 },
          { mod: 'alt', label: 'Duplicate drag', priority: 10 },
        ]
      : [],
  );

  it("surfaces a provider's hints for its context, sorted by priority", () => {
    expect($modifierHints.get()).toEqual([]);

    setHoverContext('viewport');
    expect($modifierHints.get().map((h) => h.label)).toEqual(['Duplicate drag', 'Box select drag']);

    setHoverContext('list');
    expect($modifierHints.get()).toEqual([]);
  });

  it('surfaces a provider registered AFTER the computed was first read (registry nonce)', () => {
    setHoverContext('gizmo');
    expect($modifierHints.get()).toEqual([]);

    registerModifierHints('test-gizmo', (ctx) =>
      ctx.hover === 'gizmo' ? [{ mod: 'ctrl', label: 'Snap invert', priority: 5 }] : [],
    );

    expect($modifierHints.get().map((h) => h.label)).toEqual(['Snap invert']);
  });

  it('shows no hints while a dialog is open', () => {
    setHoverContext('viewport');
    expect($modifierHints.get()).not.toEqual([]);

    openDialog({ id: 'settings' });
    expect($modifierHints.get()).toEqual([]);

    closeDialog();
    expect($modifierHints.get()).not.toEqual([]);
  });
});
