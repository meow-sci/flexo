import { atom, computed } from 'nanostores';
import { randomId } from './ids';

/**
 * The notification center's data model — the PERSISTENT-UNTIL-READ half of flexo's
 * feedback system (design: `plans/flexo_v2/design/design-system-services.md` §2.3/§2.4;
 * foundation §5.2, §13 notificationStore row). The transient half is `statusStore`; the
 * `toast()` facade (`src/ui/toast.ts`) routes between them by severity.
 *
 * Law 1 restated: **transient feedback → status channel; persistent-until-read feedback →
 * the center.** A notification is anything a user could reasonably need after looking away
 * — results of long operations, warnings about data, ALL failures, and rich reports.
 * High-frequency posture feedback (axis cycles, step changes) must NEVER enter the center.
 *
 * **Persistence: NONE — a session-only ring buffer of 100** (foundation-locked).
 * Notifications are news, not data: anything that must survive a reload is document or
 * asset state and lives elsewhere. **Undo enrollment: NONE.**
 *
 * **Layering (constitution)**: zero react / three imports. {@link notify} is an imperative
 * module function callable from anywhere (LOCKED, foundation §13), and row `actions` hold
 * command IDS rather than callbacks — the UI resolves them through `commandStore` at
 * render time, which is what keeps this module react-free AND lets a stale action's
 * `enabled()` predicate re-evaluate on every render.
 */

export type NotificationSeverity = 'success' | 'warning' | 'danger' | 'rich';

export interface NotificationAction {
  label: string;
  commandId: string;
  params?: unknown;
}

export interface NotificationEntry {
  id: string;
  severity: NotificationSeverity;
  title: string;
  /** Multi-line, rendered untruncated and user-selectable (fixes v1's cut-off toasts). */
  body?: string;
  /** Data only — a UI-side registry (`notificationBodies.tsx`) renders it by `kind`. */
  rich?: { kind: string; payload: unknown };
  actions?: NotificationAction[];
  createdAt: number;
  read: boolean;
  /** Survives "Clear all"; only a per-row ✕ removes it. */
  sticky: boolean;
}

export type NotificationInput = Omit<NotificationEntry, 'id' | 'createdAt' | 'read' | 'sticky'> & {
  read?: boolean;
  sticky?: boolean;
};

/** The session ring buffer, newest first. */
export const $notifications = atom<NotificationEntry[]>([]);

/** Ring capacity. Overflow drops the OLDEST entry, sticky included — it is a ring. */
export const NOTIFICATION_RING_MAX = 100;

export const $unreadCount = computed(
  $notifications,
  (entries) => entries.filter((entry) => !entry.read).length,
);

/**
 * Per-severity lifecycle defaults (design §2.2's one routing table):
 * - `success` — pre-read, non-sticky: auditable later without nagging the badge.
 * - `warning` — unread, non-sticky.
 * - `danger` / `rich` — unread AND sticky: a failure or a report survives "Clear all".
 *
 * An explicit `read` / `sticky` on the input overrides its row.
 */
const DEFAULTS: Record<NotificationSeverity, { read: boolean; sticky: boolean }> = {
  success: { read: true, sticky: false },
  warning: { read: false, sticky: false },
  danger: { read: false, sticky: true },
  rich: { read: false, sticky: true },
};

/** Posts a notification and returns its id (the status message's `notificationId`). */
export function notify(input: NotificationInput): string {
  const defaults = DEFAULTS[input.severity];
  const entry: NotificationEntry = {
    ...input,
    id: randomId(),
    createdAt: Date.now(),
    read: input.read ?? defaults.read,
    sticky: input.sticky ?? defaults.sticky,
  };
  $notifications.set([entry, ...$notifications.get()].slice(0, NOTIFICATION_RING_MAX));
  return entry.id;
}

/** Removes one entry — the per-row ✕, and the only way a sticky entry leaves. */
export function dismiss(id: string): void {
  const current = $notifications.get();
  const next = current.filter((entry) => entry.id !== id);
  if (next.length !== current.length) $notifications.set(next);
}

/** Zeroes the badge. Called when the center opens (design §2.3). */
export function markAllRead(): void {
  const current = $notifications.get();
  if (current.every((entry) => entry.read)) return;
  $notifications.set(current.map((entry) => (entry.read ? entry : { ...entry, read: true })));
}

/** "Clear all": removes READ **and** NON-STICKY entries only (design §2.3). */
export function clearRead(): void {
  const current = $notifications.get();
  const next = current.filter((entry) => !entry.read || entry.sticky);
  if (next.length !== current.length) $notifications.set(next);
}

/**
 * Whether the notification center is showing. Ephemeral, and deliberately a STORE rather
 * than component state: the bell, the `window.notifications` command and the status
 * message channel's click-through all open the same surface.
 */
export const $notificationCenterOpen = atom(false);

/**
 * The entry the center should scroll to when it opens (set by the message channel's
 * click-through), cleared once consumed by the center.
 */
export const $notificationFocusId = atom<string | null>(null);

export function openNotificationCenter(focusId?: string): void {
  $notificationFocusId.set(focusId ?? null);
  $notificationCenterOpen.set(true);
}

export function closeNotificationCenter(): void {
  $notificationCenterOpen.set(false);
  $notificationFocusId.set(null);
}
