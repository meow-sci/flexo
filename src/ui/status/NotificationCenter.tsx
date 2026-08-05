import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { AlertTriangle, Bell, CheckCircle2, FileText, X, XCircle } from 'lucide-react';
import { Button, cn } from '../kit';
import { notificationBodies } from './notificationBodies';
import {
  $notificationFocusId,
  $notifications,
  clearRead,
  dismiss,
  markAllRead,
  type NotificationEntry,
  type NotificationSeverity,
} from '../../state/notificationStore';
import { getCommand, runCommand } from '../../state/commandStore';

/**
 * The notification center's CONTENT (design:
 * `plans/flexo_v2/design/design-system-services.md` §2.3; foundation §5.2). Hosted by
 * {@link NotificationBell} in a popover on desktop and in a 92%-detent Sheet on the phone
 * — one component, two frames.
 *
 * This is the persistent-until-read tier: export results, warnings, every failure, and
 * rich reports. Two v1 defects it fixes outright:
 *
 * 1. **Bodies are never truncated** and are `select-text` — v1's single-line toasts cut
 *    error text off with no way to expand or copy it (census: ui-kit-hotkeys §1.4).
 * 2. **Actions are commands, not callbacks** — `{label, commandId, params}` resolved
 *    through `commandStore` AT RENDER, so a stale action (a deleted project's "Open
 *    Export…") simply renders disabled instead of throwing.
 */

const ICONS: Record<NotificationSeverity, typeof Bell> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  rich: FileText,
};

const ICON_TINT: Record<NotificationSeverity, string> = {
  success: 'text-accent',
  warning: 'text-warning',
  danger: 'text-danger',
  rich: 'text-fg-muted',
};

/** `now` · `2m` · `3h` · `4d` — the compact age shown at the end of a row. */
function relativeTime(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 45) return 'now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export interface NotificationCenterProps {
  /** Closes the hosting popover/sheet — an action button closes it after running. */
  onClose(): void;
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const entries = useStore($notifications);
  const focusId = useStore($notificationFocusId);

  // Snapshot of what was unread WHEN THE CENTER OPENED. Opening marks everything read
  // (the badge zeroes — §2.3), so without this snapshot the "unread above" divider would
  // vanish in the same frame it became useful. The component only exists while the
  // popover is open, so mounting IS opening.
  const [unreadAtOpen] = useState(
    () =>
      new Set(
        $notifications
          .get()
          .filter((entry) => !entry.read)
          .map((entry) => entry.id),
      ),
  );
  // `Date.now()` is banned in a render body (Rules of React) — stamp it once on mount.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    markAllRead();
  }, []);

  // The message channel's click-through asks for one entry by id; bring it into view.
  useEffect(() => {
    if (!focusId) return;
    document
      .querySelector(`[data-notification-id="${CSS.escape(focusId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    $notificationFocusId.set(null);
  }, [focusId]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <Bell size={20} className="text-fg-subtle" />
        <p className="text-xs text-fg-muted">
          No notifications — export results, warnings and reports land here.
        </p>
      </div>
    );
  }

  // Rows are newest-first and unread entries are the newest, so the "unread above" rule is
  // simply: rule the line at the first entry that was already read — and only when some
  // unread row precedes it.
  const firstReadIndex = entries.findIndex((entry) => !unreadAtOpen.has(entry.id));
  const dividerIndex = firstReadIndex > 0 ? firstReadIndex : -1;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-none items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold text-fg">Notifications</span>
        <Button size="xs" variant="ghost" className="px-1.5 font-normal" onPress={clearRead}>
          Clear all
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {entries.map((entry, index) => {
          return (
            <div key={entry.id}>
              {index === dividerIndex && (
                <div className="flex items-center gap-2 px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle">
                  <span className="h-px flex-1 bg-border" />
                  unread above
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <NotificationRow entry={entry} openedAt={openedAt} onClose={onClose} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotificationRow({
  entry,
  openedAt,
  onClose,
}: {
  entry: NotificationEntry;
  openedAt: number;
  onClose(): void;
}) {
  const Icon = ICONS[entry.severity];
  const RichBody = entry.rich ? notificationBodies[entry.rich.kind] : undefined;

  return (
    <div
      data-notification-id={entry.id}
      className="group flex gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
    >
      <Icon size={14} className={cn('mt-0.5 shrink-0', ICON_TINT[entry.severity])} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-xs font-medium text-fg">{entry.title}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-fg-subtle">
            {relativeTime(entry.createdAt, openedAt)}
          </span>
          <Button
            size="xs"
            iconOnly
            variant="ghost"
            aria-label="Dismiss notification"
            // Hover-revealed, but never keyboard-invisible: focus brings it back.
            className="-my-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onPress={() => dismiss(entry.id)}
          >
            <X size={12} />
          </Button>
        </div>

        {/* Multi-line, never truncated, selectable — the v1 truncation fix. */}
        {entry.body && (
          <p className="mt-0.5 select-text whitespace-pre-wrap break-words text-xs text-fg-muted">
            {entry.body}
          </p>
        )}

        {RichBody && (
          <div className="mt-1 select-text text-xs text-fg-muted">
            <RichBody payload={entry.rich?.payload} />
          </div>
        )}

        {entry.actions && entry.actions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {entry.actions.map((action) => {
              const command = getCommand(action.commandId);
              return (
                <Button
                  key={`${action.commandId}:${action.label}`}
                  size="xs"
                  variant="secondary"
                  isDisabled={!command || command.enabled?.() === false}
                  onPress={() => {
                    runCommand(action.commandId, action.params);
                    onClose();
                  }}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
