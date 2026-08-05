import { beforeEach, describe, expect, it } from 'vitest';
import {
  $notificationCenterOpen,
  $notificationFocusId,
  $notifications,
  $unreadCount,
  clearRead,
  closeNotificationCenter,
  dismiss,
  markAllRead,
  NOTIFICATION_RING_MAX,
  notify,
  openNotificationCenter,
} from './notificationStore';

beforeEach(() => {
  $notifications.set([]);
  closeNotificationCenter();
});

describe('severity defaults (design §2.2 routing table)', () => {
  it.each([
    ['success', true, false],
    ['warning', false, false],
    ['danger', false, true],
    ['rich', false, true],
  ] as const)('%s → read=%s sticky=%s', (severity, read, sticky) => {
    notify({ severity, title: 't' });
    const entry = $notifications.get()[0];
    expect(entry.read).toBe(read);
    expect(entry.sticky).toBe(sticky);
  });

  it('lets the caller override read/sticky explicitly', () => {
    notify({ severity: 'success', title: 't', read: false, sticky: true });
    const entry = $notifications.get()[0];
    expect(entry.read).toBe(false);
    expect(entry.sticky).toBe(true);
  });
});

describe('ring buffer', () => {
  it('is newest-first and returns the id it stored', () => {
    const first = notify({ severity: 'warning', title: 'first' });
    const second = notify({ severity: 'warning', title: 'second' });
    expect($notifications.get().map((n) => n.id)).toEqual([second, first]);
    expect($notifications.get()[0].title).toBe('second');
  });

  it(`caps at ${NOTIFICATION_RING_MAX}, dropping the oldest (sticky included)`, () => {
    notify({ severity: 'danger', title: 'oldest sticky' });
    for (let i = 0; i < NOTIFICATION_RING_MAX; i++) notify({ severity: 'warning', title: `n${i}` });
    expect($notifications.get()).toHaveLength(NOTIFICATION_RING_MAX);
    expect($notifications.get().some((n) => n.title === 'oldest sticky')).toBe(false);
  });
});

describe('read / dismiss lifecycle', () => {
  it('counts unread, and markAllRead zeroes it', () => {
    notify({ severity: 'success', title: 'pre-read' });
    notify({ severity: 'warning', title: 'unread' });
    notify({ severity: 'danger', title: 'unread too' });
    expect($unreadCount.get()).toBe(2);
    markAllRead();
    expect($unreadCount.get()).toBe(0);
    expect($notifications.get()).toHaveLength(3);
  });

  it('clearRead removes read non-sticky entries only', () => {
    notify({ severity: 'success', title: 'read + non-sticky' });
    notify({ severity: 'warning', title: 'unread' });
    notify({ severity: 'danger', title: 'read + sticky', read: true });
    clearRead();
    expect($notifications.get().map((n) => n.title)).toEqual(['read + sticky', 'unread']);
  });

  it('dismiss removes by id — the only exit for a sticky entry', () => {
    const id = notify({ severity: 'danger', title: 'export failed' });
    clearRead();
    markAllRead();
    clearRead();
    expect($notifications.get()).toHaveLength(1);
    dismiss(id);
    expect($notifications.get()).toHaveLength(0);
    dismiss(id); // harmless
  });
});

describe('center open state', () => {
  it('opens with an optional focus id and clears it on close', () => {
    openNotificationCenter();
    expect($notificationCenterOpen.get()).toBe(true);
    expect($notificationFocusId.get()).toBeNull();

    openNotificationCenter('abc');
    expect($notificationFocusId.get()).toBe('abc');

    closeNotificationCenter();
    expect($notificationCenterOpen.get()).toBe(false);
    expect($notificationFocusId.get()).toBeNull();
  });
});
