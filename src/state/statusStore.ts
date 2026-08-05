import { atom, computed } from 'nanostores';
import { $loadProgress } from './loadProgressStore';
import { $historyList, undo } from './editorStore';

/**
 * The status bar's data model — the TRANSIENT half of flexo's feedback system (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.3; foundation §5, §13 statusStore
 * row). The persistent-until-read half is `notificationStore`; the `toast()` facade
 * (`src/ui/toast.ts`) is what routes between the two per the one severity table below.
 *
 * **Layering (constitution)**: zero react / three imports. Every function here is an
 * imperative module function callable from ANYWHERE — the three-layer `EditorScene`, boot
 * code in `main.tsx` and the plain-TS `nudgeControls`/`rotateControls` all report through
 * it without a React context (foundation §13 "toast()/notify() stay imperative module
 * functions callable outside React" — LOCKED).
 *
 * **Undo enrollment: NONE. Persistence: NONE.** Status is ephemeral view feedback
 * (foundation §13: "mode/layout/status/notifications/windows never create undo steps").
 * The status bar *edits* persisted state elsewhere (bounds mode, snap, nudge/rotate prefs)
 * — those keys stay owned by their own stores.
 */

export type Severity = 'info' | 'success' | 'warning' | 'danger';

/** An inline button rendered at the end of a status message, e.g. `[Undo]`. */
export interface StatusAction {
  label: string;
  run(): void;
  /**
   * Evaluated at RENDER time so an action can go stale without the store knowing why —
   * see {@link undoStatusAction}, whose staleness rule is "someone pushed a newer undo
   * step" (design §1.2 #5).
   */
  disabled?: () => boolean;
}

export interface StatusMessage {
  text: string;
  severity: Severity;
  /** `Date.now()` + {@link STATUS_DURATION}; the UI may fade against it. */
  expiresAt: number;
  action?: StatusAction;
  /** Set when a notification-center entry mirrors this message (click-through target). */
  notificationId?: string;
}

/**
 * The tool segment's model (design §1.2 segment 3). Each transient tool (and the chain
 * session) writes one on arm and clears it on disarm — foundation §2.6 gives every tool a
 * status segment rather than its own floating bar.
 */
export interface ToolStatus {
  toolId: 'measure' | 'seat-view' | 'exhaust' | 'marquee' | 'chain';
  /** A lucide icon NAME — resolved UI-side, so this module imports no react. */
  icon: string;
  /** The live instruction, e.g. `'Measure — click first point'`. */
  text: string;
  /** Chord rows rendered as `Kbd` chips, e.g. `[['Esc']]`. */
  kbdHints?: string[][];
  /** Clicking the segment focuses this surface. */
  focusSurface?: string;
}

/**
 * The ONE severity → duration table (design §2.2). Per-call-site timeouts are dead: the
 * `toast()` facade ignores its legacy `timeout` option in favor of this.
 */
export const STATUS_DURATION: Record<Severity, number> = {
  info: 4000,
  success: 4000,
  warning: 8000,
  danger: 10000,
};

/** The message channel's single slot — a NEW message overwrites, never queues (§1.2 #5). */
export const $statusMessage = atom<StatusMessage | null>(null);

/**
 * The last message posted, KEPT after {@link $statusMessage} expires to null.
 *
 * The channel fades out over 120ms on expiry (design §1.2 #5), which means the expired
 * text has to keep rendering while it fades. Holding it here rather than in the component
 * is what keeps `MessageChannel` a pure function of stores: no `useState` mirror, no
 * `setState` inside an effect, no timer of its own — the fade is one CSS transition keyed
 * on whether `$statusMessage` is live.
 */
export const $lastStatusMessage = atom<StatusMessage | null>(null);

/** The armed tool's segment model, or null when no tool/chain session is live. */
export const $toolStatus = atom<ToolStatus | null>(null);

/**
 * A confirm-before-destroy question awaiting an answer, rendered by the status bar's
 * message channel as a kit `InlineConfirmStrip` (foundation §14.3: "confirm (inline strip
 * or stacked view), stating counts").
 *
 * This is the host for confirms raised by a COMMAND rather than by a row — ⌫ on a large
 * selection has no row to swap, and §10.1 bans stacking a modal over whatever is open. The
 * strip is in flow at the bottom of the shell, so nothing is overlaid and nothing portals.
 * A row-level confirm (Outliner, multi panel, Asset Manager) keeps using the strip in place.
 */
export interface StatusConfirm {
  /** The question, counts included — e.g. `Delete 8 selected items?`. */
  label: string;
  confirmLabel: string;
  onConfirm(): void;
}

export const $statusConfirm = atom<StatusConfirm | null>(null);

/** Raises the confirm question, replacing any unanswered one and clearing the message. */
export function requestStatusConfirm(confirm: StatusConfirm): void {
  clearStatus();
  $statusConfirm.set(confirm);
}

/** Drops the question unanswered (Cancel, the strip's own 8s timeout, or a superseding one). */
export function dismissStatusConfirm(): void {
  if ($statusConfirm.get() !== null) $statusConfirm.set(null);
}

/** Frames per second, throttled to ~2Hz by the viewport while the FPS counter is on. */
export const $fpsReport = atom<number | null>(null);

/**
 * A CONDITION (true until fixed), as opposed to an event — rendered as a chip between
 * progress and the modifier hints (design §1.8). Owning stores write these; the slot is
 * deliberately small (max 2 rendered) and new advisories need design review.
 */
export interface Advisory {
  id: string;
  text: string;
  severity: 'warning';
  /** Ascending — lower sorts (and therefore renders) first. */
  priority: number;
  /** Clicking the chip runs this command. */
  commandId?: string;
}

/** Live advisories, sorted by ascending priority. */
export const $advisories = atom<Advisory[]>([]);

/** Adds an advisory, or replaces the one already holding that id. */
export function setAdvisory(advisory: Advisory): void {
  const next = $advisories.get().filter((a) => a.id !== advisory.id);
  next.push(advisory);
  next.sort((a, b) => a.priority - b.priority);
  $advisories.set(next);
}

/** Removes an advisory by id. A no-op when the condition was never raised. */
export function clearAdvisory(id: string): void {
  const current = $advisories.get();
  const next = current.filter((a) => a.id !== id);
  if (next.length !== current.length) $advisories.set(next);
}

/**
 * The module's ONE expiry timer. A new message clears and re-arms it, which is what makes
 * an overwritten message's old timer incapable of blanking the new one.
 */
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Posts a transient message, OVERWRITING whatever was showing (single slot, not a queue —
 * the brief's rule). Anything that must not be lost also goes to the notification center;
 * the `toast()` facade guarantees that for warning/danger.
 */
export function status(
  text: string,
  opts: { severity?: Severity; action?: StatusAction; notificationId?: string } = {},
): void {
  const severity = opts.severity ?? 'info';
  const duration = STATUS_DURATION[severity];
  if (expiryTimer !== null) clearTimeout(expiryTimer);
  const message: StatusMessage = {
    text,
    severity,
    expiresAt: Date.now() + duration,
    action: opts.action,
    notificationId: opts.notificationId,
  };
  $statusMessage.set(message);
  $lastStatusMessage.set(message);
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    // Identity check, not a blanket clear: nothing else should be able to blank a message
    // this timer does not own (belt-and-braces beside the clear-on-overwrite above).
    if ($statusMessage.get() === message) $statusMessage.set(null);
  }, duration);
}

/**
 * Clears the message channel immediately and disarms the expiry timer. Unlike expiry this
 * also drops the fade-out copy: "clear" means gone, not gone-after-a-fade.
 */
export function clearStatus(): void {
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  $statusMessage.set(null);
  $lastStatusMessage.set(null);
}

/** Arms (or with `null`, clears) the tool segment. */
export function setToolStatus(model: ToolStatus | null): void {
  $toolStatus.set(model);
}

/** How many undo steps are currently on the stack. */
function undoDepth(): number {
  return $historyList.get().filter((item) => item.stepsFromCurrent < 0).length;
}

/**
 * The `[Undo]` inline action for a "did it, tell them, offer the takeback" flash — the
 * no-confirm small-delete policy (foundation §14.3).
 *
 * `status()` deliberately knows nothing about undo; the CALLER builds the action. This
 * helper captures the undo depth AT FLASH TIME and reports itself disabled once that depth
 * changes, so a message lingering after two more edits can never undo the WRONG step
 * (design §1.2 #5 "inline-action staleness").
 */
export function undoStatusAction(): StatusAction {
  const captured = undoDepth();
  return {
    label: 'Undo',
    run: () => {
      undo();
    },
    disabled: () => undoDepth() !== captured,
  };
}

/**
 * One unit of work in the progress segment — a streaming download (from
 * {@link $loadProgress}) or a non-download job registered via {@link trackJob}. `total`
 * is `null` while the size is unknown (indeterminate).
 */
export interface Job {
  id: string;
  label: string;
  loaded: number;
  total: number | null;
}

export interface JobHandle {
  setProgress(done: number, total?: number): void;
  end(): void;
}

/**
 * Non-download work that should share the progress segment — project archive tar.gz
 * builds, mod zip builds (the projects/export phase consumes this). Downloads funnel
 * through `loadProgressStore.trackDownload` instead and are merged in by {@link $progress}.
 */
const $jobs = atom<Job[]>([]);

let jobSeq = 0;

/** Registers a job and returns its handles. `end()` removes the row (success or failure). */
export function trackJob(label: string): JobHandle {
  const id = `job:${++jobSeq}`;
  $jobs.set([...$jobs.get(), { id, label, loaded: 0, total: null }]);
  return {
    setProgress(done, total) {
      $jobs.set(
        $jobs
          .get()
          .map((job) =>
            job.id === id ? { ...job, loaded: done, total: total ?? job.total } : job,
          ),
      );
    },
    end() {
      $jobs.set($jobs.get().filter((job) => job.id !== id));
    },
  };
}

export interface ProgressState {
  /** True while anything is in flight. */
  active: boolean;
  /** 0–100, or `null` for indeterminate (barber-pole). */
  percent: number | null;
  /** Downloads first, then tracked jobs — one row per popover line (design §1.2 #6). */
  jobs: Job[];
}

/**
 * The aggregate behind the progress segment: byte-weighted mean over every DETERMINATE
 * item. Indeterminate items with no determinate sibling render as a barber-pole
 * (`percent: null`); with a determinate sibling they simply don't contribute.
 *
 * Raw on purpose — the 500ms min-display anti-flicker is a UI concern (design §1.2 #6).
 */
export const $progress = computed([$loadProgress, $jobs], (downloads, jobs): ProgressState => {
  const rows: Job[] = downloads.downloads.map((download) => ({
    id: `download:${download.id}`,
    label: download.label,
    loaded: download.loaded,
    // `trackDownload` uses 0 for "no Content-Length"; the unified row spells that null.
    total: download.determinate ? download.total : null,
  }));
  rows.push(...jobs);

  let loadedBytes = 0;
  let totalBytes = 0;
  for (const row of rows) {
    if (row.total === null || row.total <= 0) continue;
    loadedBytes += Math.min(row.loaded, row.total);
    totalBytes += row.total;
  }

  return {
    active: rows.length > 0,
    percent: totalBytes > 0 ? (loadedBytes / totalBytes) * 100 : null,
    jobs: rows,
  };
});
