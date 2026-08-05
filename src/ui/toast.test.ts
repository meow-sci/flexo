import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from './toast';
import { $statusMessage, clearStatus, STATUS_DURATION } from '../state/statusStore';
import { $notifications } from '../state/notificationStore';

/**
 * The `toast()` facade's ROUTING contract (design:
 * `plans/flexo_v2/design/design-system-services.md` §2.2 table). One test per variant,
 * asserting both halves — what lands in the status channel and what lands (or deliberately
 * does NOT land) in the notification center.
 */

beforeEach(() => {
  vi.useFakeTimers();
  clearStatus();
  $notifications.set([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('toast() → status routing', () => {
  it('default: an info status flash and NOTHING in the center', () => {
    toast({ title: 'Nudge axis: Y' });

    const message = $statusMessage.get();
    expect(message?.text).toBe('Nudge axis: Y');
    expect(message?.severity).toBe('info');
    expect(message?.expiresAt).toBe(Date.now() + STATUS_DURATION.info);
    // High-frequency posture feedback must never reach the center (§2.1).
    expect($notifications.get()).toEqual([]);
    expect(message?.notificationId).toBeUndefined();
  });

  it('success: a 4s status flash mirrored by a PRE-READ center entry', () => {
    toast({ title: 'Exported to folder', description: 'part.xml', variant: 'success' });

    const message = $statusMessage.get();
    expect(message?.severity).toBe('success');
    expect(message?.expiresAt).toBe(Date.now() + STATUS_DURATION.success);

    const entries = $notifications.get();
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Exported to folder');
    expect(entries[0].body).toBe('part.xml');
    // Pre-read: auditable later, but no badge nag.
    expect(entries[0].read).toBe(true);
    expect(entries[0].sticky).toBe(false);
    // The flash links through to its entry.
    expect(message?.notificationId).toBe(entries[0].id);
  });

  it('warning: an 8s status flash mirrored by an UNREAD, non-sticky entry', () => {
    toast({ title: 'Removed 1 incompatible saved project', variant: 'warning' });

    const message = $statusMessage.get();
    expect(message?.severity).toBe('warning');
    expect(message?.expiresAt).toBe(Date.now() + STATUS_DURATION.warning);

    const entries = $notifications.get();
    expect(entries[0].read).toBe(false);
    expect(entries[0].sticky).toBe(false);
    expect(message?.notificationId).toBe(entries[0].id);
  });

  it('danger: a 10s status flash mirrored by an UNREAD + STICKY entry', () => {
    toast({ title: 'Export failed', description: 'NotAllowedError', variant: 'danger' });

    const message = $statusMessage.get();
    expect(message?.severity).toBe('danger');
    expect(message?.expiresAt).toBe(Date.now() + STATUS_DURATION.danger);

    const entries = $notifications.get();
    expect(entries[0].read).toBe(false);
    // Sticky: a failure survives "Clear all".
    expect(entries[0].sticky).toBe(true);
    expect(message?.notificationId).toBe(entries[0].id);
  });

  it('joins title and description for the one-line channel, keeping them split in the center', () => {
    toast({ title: 'Import failed', description: 'unexpected EOF', variant: 'danger' });

    expect($statusMessage.get()?.text).toBe('Import failed — unexpected EOF');
    expect($notifications.get()[0].title).toBe('Import failed');
    expect($notifications.get()[0].body).toBe('unexpected EOF');
  });

  it('overwrites the channel rather than stacking (the v1 toast-queue fix)', () => {
    toast({ title: 'Nudge axis: X' });
    toast({ title: 'Nudge axis: Y' });
    toast({ title: 'Nudge axis: Z' });

    expect($statusMessage.get()?.text).toBe('Nudge axis: Z');
    expect($notifications.get()).toEqual([]);
  });

  it('warns in dev about the ignored legacy timeout, and ignores it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    toast({ title: 'Autosaved ✓' }, { timeout: 1500 });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('toast timeout is ignored'));
    // The severity table wins: 4s, not the requested 1.5s.
    expect($statusMessage.get()?.expiresAt).toBe(Date.now() + STATUS_DURATION.info);
  });

  it('stays silent when no timeout is passed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    toast({ title: 'SubPart Added' });
    expect(warn).not.toHaveBeenCalled();
  });
});
