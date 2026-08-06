import { atom } from 'nanostores';
import { notify } from './state/notificationStore';

const STORAGE_KEY = 'flexo_build_id';

/** True when a prod build ID mismatch is detected on startup. */
export const $buildMismatch = atom(false);

/**
 * On prod builds: compare the embedded VITE_BUILD_ID against the last-seen
 * value in localStorage. If they differ, sets $buildMismatch so the UI can
 * prompt the user to reset their data.
 *
 * Skipped entirely in dev (import.meta.env.DEV).
 */
export function checkBuildId(): void {
  if (import.meta.env.DEV) return;

  const current = import.meta.env.VITE_BUILD_ID;
  if (!current) return;

  const previous = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(STORAGE_KEY, current);

  if (previous !== null && previous !== current) {
    $buildMismatch.set(true);
  }
}

/**
 * Demotes the build-mismatch signal to a STICKY NOTIFICATION (design:
 * `plans/flexo_v2/design/design-projects-export.md` §9.1, decision D14; foundation §5.1 last
 * row, S26).
 *
 * v1 met the user with a full-screen modal offering to wipe every project, on a signal that
 * means nothing worse than "the app was redeployed". Nothing about a new build endangers saved
 * work — `PROJECT_SCHEMA_VERSION` is the real compatibility guard, and it purges precisely the
 * projects it must with its own boot notice. So this blocks nothing: it posts one unread,
 * sticky bell entry with [Reload] and [Reset everything…], and boot carries on.
 *
 * Subscribing here rather than in a component keeps the routing out of the React tree; the
 * actions are COMMAND IDS, which is what lets `notificationStore` stay react-free.
 *
 * Idempotent, like every other `init*` in boot: a second call would post the notice twice.
 */
let noticeWired = false;

export function initBuildMismatchNotice(): void {
  if (noticeWired) return;
  noticeWired = true;
  $buildMismatch.subscribe((mismatch) => {
    if (!mismatch) return;
    notify({
      severity: 'warning',
      sticky: true,
      title: 'flexo was updated',
      body: 'A new build was deployed since your last visit. Your projects are unaffected (incompatible ones are removed automatically with a notice).',
      actions: [
        { label: 'Reload', commandId: 'app.reload' },
        { label: 'Reset everything…', commandId: 'app.resetEverything' },
      ],
    });
  });
}
