import { describe, it, expect, beforeEach } from 'vitest';
import { $openDialog, closeDialog, isDialogOpen, openDialog } from './dialogStore';

beforeEach(() => {
  closeDialog();
});

describe('dialogStore', () => {
  it('opens a dialog with its params', () => {
    openDialog({ id: 'settings', params: { tab: 'scene' } });
    expect($openDialog.get()).toEqual({ id: 'settings', params: { tab: 'scene' } });
  });

  it('OVERWRITES rather than stacking — only one dialog is ever open (foundation §10.1)', () => {
    openDialog({ id: 'about' });
    openDialog({ id: 'projects' });
    expect($openDialog.get()).toEqual({ id: 'projects' });
  });

  it('closes to null, and closing twice is harmless', () => {
    openDialog({ id: 'help' });
    closeDialog();
    expect($openDialog.get()).toBeNull();
    closeDialog();
    expect($openDialog.get()).toBeNull();
  });

  it('isDialogOpen: id-specific with an argument, "any dialog" without one', () => {
    expect(isDialogOpen()).toBe(false);
    expect(isDialogOpen('help')).toBe(false);

    openDialog({ id: 'help' });
    expect(isDialogOpen()).toBe(true);
    expect(isDialogOpen('help')).toBe(true);
    expect(isDialogOpen('about')).toBe(false);

    closeDialog();
    expect(isDialogOpen()).toBe(false);
    expect(isDialogOpen('help')).toBe(false);
  });
});
