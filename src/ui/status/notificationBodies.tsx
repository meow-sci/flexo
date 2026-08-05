import type { ReactNode } from 'react';
import { ImportReportBody } from './ImportReportBody';
import type { ImportReport } from '../../state/customAssetStore';

/**
 * The rich-notification body registry (design:
 * `plans/flexo_v2/design/design-system-services.md` §2.3).
 *
 * `notificationStore` holds DATA only — an entry's `rich` field is `{kind, payload}` and
 * nothing else — because `src/state/` may not import react (constitution). This UI-side
 * map is where a `kind` becomes a React body, rendered inline in the notification row.
 *
 * **To add a rich body**: pick a stable `kind` string, add it here, and post the entry with
 * `notify({severity: 'rich', title, rich: {kind, payload}})`. An unknown kind is not an
 * error — the row falls back to its plain `body` text, so a stale entry from an earlier
 * session can never blank a row.
 *
 * The payload arrives as `unknown`: each body owns the cast, right next to the `notify()`
 * call site that produced it.
 *
 * Registered kinds: `'import-report'`.
 */
export const notificationBodies: Record<string, (props: { payload: unknown }) => ReactNode> = {
  'import-report': ({ payload }) => <ImportReportBody report={payload as ImportReport} />,
};
