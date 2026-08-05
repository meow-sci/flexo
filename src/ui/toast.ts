import { status } from '../state/statusStore';
import { notify } from '../state/notificationStore';

/**
 * `toast()` — the FACADE over flexo's two feedback channels (design:
 * `plans/flexo_v2/design/design-system-services.md` §2.2 routing table; foundation §5.1).
 *
 * v1 toasts were a stacking bottom-right region: four "Nudge axis: Y" cards could evict a
 * real export error, every error was truncated to one line, and every call site invented
 * its own timeout. All three are dead. A `toast()` call now lands in the status bar's
 * message channel (transient, single slot, overwriting) and — for anything a user could
 * need after looking away — ALSO in the notification center (persistent until read).
 *
 * **The signature is unchanged from v1 on purpose.** `toast()` must stay an imperative
 * module function callable from OUTSIDE React (foundation §13, LOCKED): the three-layer
 * `EditorScene`, boot code in `main.tsx` and the plain-TS `nudgeControls`/`rotateControls`
 * all report through it with no React context in reach. Migrating the ~44 v1 call sites was
 * therefore an import-path codemod, not a rewrite — the variant each site already passed is
 * what decides its route.
 *
 * Routing, one table, no per-call-site policy:
 *
 * | variant     | status channel | notification center      |
 * |-------------|----------------|--------------------------|
 * | `default`   | info, 4s       | never enters             |
 * | `success`   | success, 4s    | entry, PRE-READ          |
 * | `warning`   | warning, 8s    | entry, unread            |
 * | `danger`    | danger, 10s    | entry, unread + sticky   |
 *
 * The `rich` tier (a React body, center-only, no status flash) has no `toast()` spelling —
 * call {@link notify} directly with `severity: 'rich'`.
 *
 * Undo enrollment: NONE. Persistence: NONE.
 */

/** The v1 message shape, preserved verbatim so every call site compiles unmodified. */
export interface ToastMessage {
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}

export interface ToastOptions {
  /**
   * IGNORED. v1 let every call site pick its own duration (1500 / 1800 / 2000 / 2500 /
   * 10000ms were all in the tree); v2 has ONE severity → duration table
   * (`statusStore.STATUS_DURATION`). Kept in the type only so legacy calls still compile —
   * passing it logs a dev-only warning, which is how the remaining ones get found.
   */
  timeout?: number;
}

export function toast(message: ToastMessage, options?: ToastOptions): void {
  if (import.meta.env.DEV && options?.timeout !== undefined) {
    console.warn('flexo: toast timeout is ignored — one severity→duration table (see statusStore)');
  }

  // The center gets title and body as separate fields (its rows are multi-line and never
  // truncated); the one-line status channel gets them joined.
  const text = message.description ? `${message.title} — ${message.description}` : message.title;

  switch (message.variant ?? 'default') {
    case 'default':
      // Posture and immediate-result feedback: seen or missed, it does not matter, and
      // letting it into the center would bury the things that do (§2.1).
      status(text, { severity: 'info' });
      break;
    case 'success': {
      const id = notify({ severity: 'success', title: message.title, body: message.description });
      status(text, { severity: 'success', notificationId: id });
      break;
    }
    case 'warning': {
      const id = notify({ severity: 'warning', title: message.title, body: message.description });
      status(text, { severity: 'warning', notificationId: id });
      break;
    }
    case 'danger': {
      const id = notify({ severity: 'danger', title: message.title, body: message.description });
      status(text, { severity: 'danger', notificationId: id });
      break;
    }
  }
}

/** The rich / center-only path — re-exported so feature code has ONE feedback import. */
export { notify } from '../state/notificationStore';
