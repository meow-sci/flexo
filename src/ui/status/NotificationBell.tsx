import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Bell } from 'lucide-react';
import { cn, Dialog, DialogTrigger, Popover, PopoverDialog, Sheet, useIsPhone } from '../kit';
import { StatusChipButton } from './StatusChip';
import { NotificationCenter } from './NotificationCenter';
import {
  $notificationCenterOpen,
  $notifications,
  $unreadCount,
  closeNotificationCenter,
  openNotificationCenter,
} from '../../state/notificationStore';

/**
 * Status-bar segment 11 — the **bell** and the notification center's frame (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.2 #11, §2.3; foundation §5.2).
 *
 * Permanent: with mode and layer, the bell is what keeps the bar from ever fully emptying
 * (§1.7). Desktop hosts the center in a popover anchored here; the phone hosts the same
 * component in a 92%-detent Sheet.
 *
 * The open state lives in `notificationStore`, not in this component, because three
 * different things open the same surface: this button, the Window ▸ Notifications… command
 * and a click on a status message that mirrors a center entry.
 */
export function NotificationBell() {
  const unread = useStore($unreadCount);
  const open = useStore($notificationCenterOpen);
  const isPhone = useIsPhone();
  const [pulse, setPulse] = useState(false);

  // A `danger` or `rich` entry is the "you will want to look at this" tier — one 300ms
  // scale tick, and nothing else moves (§1.2 #11). Compares the newest id rather than the
  // count, so a pre-read success never pulses.
  useEffect(() => {
    let lastId = $notifications.get()[0]?.id ?? null;
    return $notifications.listen((entries) => {
      const newest = entries[0];
      const previousId = lastId;
      lastId = newest?.id ?? null;
      if (!newest || newest.id === previousId) return;
      if (newest.severity === 'danger' || newest.severity === 'rich') setPulse(true);
    });
  }, []);

  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(false), 300);
    return () => clearTimeout(timer);
  }, [pulse]);

  const label = unread > 0 ? `Notifications (${unread} unread)` : 'Notifications';

  const trigger = (
    <StatusChipButton
      aria-label={label}
      className={cn('relative transition-transform duration-150', pulse && 'scale-125')}
      onPress={() => (open ? closeNotificationCenter() : openNotificationCenter())}
    >
      <Bell size={13} />
      {unread > 0 && (
        <span className="min-w-3.5 rounded-full bg-accent px-1 text-[10px] font-medium leading-[14px] tabular-nums text-accent-fg">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </StatusChipButton>
  );

  if (isPhone) {
    return (
      <>
        {trigger}
        <Sheet
          isOpen={open}
          onOpenChange={(next) => (next ? openNotificationCenter() : closeNotificationCenter())}
          detent="92"
          ariaLabel="Notifications"
        >
          <Dialog className="min-h-0 flex-1">
            <NotificationCenter onClose={closeNotificationCenter} />
          </Dialog>
        </Sheet>
      </>
    );
  }

  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={(next) => (next ? openNotificationCenter() : closeNotificationCenter())}
    >
      {trigger}
      {/* react-aria renders the popover's children only while it is OPEN, so the center
          mounts fresh on every open — which is what re-runs its `markAllRead()`, its
          unread snapshot and every action's `enabled()` predicate. Building the rows
          outside the popover would freeze them under React Compiler memoization (the same
          trap MenuSpecMenu documents). */}
      <Popover placement="top end" className="w-96">
        <PopoverDialog
          aria-label="Notifications"
          className="flex max-h-[70vh] flex-col overflow-hidden"
        >
          <NotificationCenter onClose={closeNotificationCenter} />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  );
}
