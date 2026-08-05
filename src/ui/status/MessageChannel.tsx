import { useStore } from '@nanostores/react';
import { Button, cn } from '../kit';
import { SEVERITY_DOT, SEVERITY_TEXT } from './statusTokens';
import { $lastStatusMessage, $statusMessage } from '../../state/statusStore';
import { openNotificationCenter } from '../../state/notificationStore';

/**
 * Status-bar segment 5 — **the message channel** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.2 #5; foundation §5).
 *
 * This is where every transient message lands, and it is a SINGLE SLOT, not a queue: a new
 * message overwrites the previous one unconditionally. That is the whole point of killing
 * v1's stacking toast region — "Nudge axis: Y" ×4 could evict a real export error. Anything
 * that must not be lost also gets a notification-center entry, which the `toast()` facade
 * guarantees for warning and danger.
 *
 * Undo enrollment: NONE (foundation §13).
 */

export function MessageChannel() {
  const message = useStore($statusMessage);
  // The expired message keeps RENDERING while it fades out, so the text comes from the
  // store's retained copy and only the OPACITY is keyed on `message` being live. Nothing
  // is scheduled here: one CSS transition, no component timers, no state mirror — an idle
  // bar costs zero renders (the on-demand render loop stays untouched, foundation §14.5).
  const shown = useStore($lastStatusMessage);

  const action = shown?.action;
  const actionDisabled = action?.disabled?.() === true;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 flex-1 items-center justify-center px-2"
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-1.5 transition-opacity duration-[120ms]',
          message ? 'opacity-100' : 'opacity-0',
        )}
      >
        {shown && (
          <>
            <span
              className={cn('size-[2px] shrink-0 rounded-full', SEVERITY_DOT[shown.severity])}
            />
            {shown.notificationId ? (
              // The mirrored center entry is one click away — the message is a receipt,
              // the entry is the record (design §1.2 #5).
              <Button
                size="xs"
                variant="ghost"
                className={cn('min-w-0 px-1 font-normal', SEVERITY_TEXT[shown.severity])}
                onPress={() => openNotificationCenter(shown.notificationId)}
              >
                <span className="truncate">{shown.text}</span>
              </Button>
            ) : (
              <span className={cn('truncate', SEVERITY_TEXT[shown.severity])}>{shown.text}</span>
            )}
            {action && (
              <Button
                size="xs"
                variant="ghost"
                className="shrink-0 px-1.5 text-accent"
                isDisabled={actionDisabled}
                onPress={() => action.run()}
              >
                {action.label}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
