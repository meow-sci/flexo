import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';
import type { JointSegmentEasing } from '../../ksa/types';
import { registerModifierHints } from '../../state/modifierStore';
import { status, undoStatusAction } from '../../state/statusStore';
import {
  $activeAnimation,
  $animClipboard,
  $animPlaying,
  $playheadSec,
  pausePreview,
  playAnimationPreview,
  returnToRest,
  $timelineSelection,
  $timelineView,
  addKeyframe,
  copyKeyframes,
  parkPlayhead,
  pasteKeyframesAtPlayhead,
  removeKeyframes,
  selectKeyframeForEditing,
} from '../../state/animationStore';

/**
 * The timeline surface's shared UI-level actions and ephemeral view atoms — the ONE
 * implementation behind the TransportBar buttons, the `surface:timeline` / `mode:animation`
 * hotkeys, the dopesheet's pointer gestures and (from 11E) the palette commands. Nothing
 * here is document state: every mutation delegates to `animationStore`, which owns undo.
 *
 * It lives in `src/ui/` rather than `src/state/` because it composes STATUS feedback (the
 * flashes and their `[Undo]` actions) with store calls, and because the zoom/fit helpers
 * need the tracks viewport's pixel width — both view concerns.
 */

// ── dopesheet geometry (shared by the canvas and the header column) ──────────

/** Ruler strip height, px — also the header column's clip-select cell height. */
export const RULER_H = 22;
/** The sticky `∑` summary row height, px. */
export const SUMMARY_H = 18;
/** One joint track's height, px (header rows match exactly, or the two would drift). */
export const ROW_H = 18;
/** Diamond hit half-size, px: ≥ 12×12 px targets regardless of zoom (design §5.3). */
export const DIAMOND_HIT = 6;
/** Diamonds closer than this render as one `◆N` cluster pill (design §5.3). */
export const CLUSTER_PX = 12;

export const PX_PER_SEC_MIN = 20;
export const PX_PER_SEC_MAX = 2000;

// ── ephemeral view atoms ─────────────────────────────────────────────────────

/**
 * Vertical scroll of the TRACK rows, px. Owned here rather than by DOM overflow so the
 * canvas and the header column can never desync (the ruler + `∑` row stay pinned above it).
 */
export const $timelineScrollTop = atom(0);

/** The tracks viewport width in CSS px, published by `DopeSheetCanvas`'s ResizeObserver. */
export const $timelineTracksWidth = atom(0);

/** A pending >5-column delete, rendered as the dock's `InlineConfirmStrip` (design §5.7). */
export const $timelineDeleteConfirm = atom<{ ids: string[] } | null>(null);

/** The segment context menu's Copy easing / Paste easing buffer. Module-local by design. */
export const $easingClipboard = atom<JointSegmentEasing | null>(null);

/** TrackHeaderColumn width, px (clamp 100–280, default 140 — design §5.1). Persisted. */
export const $trackHeaderWidth = persistentJSON<number>('flexo:animTrackHeaderW', 140);

export const TRACK_HEADER_MIN = 100;
export const TRACK_HEADER_MAX = 280;

/**
 * The timeline's modifier hints (design §13). Registered HERE, beside the gestures they
 * describe, per the roster rule in `src/ui/status/modifierHintProviders.ts` — a hint may
 * only advertise a gesture that actually exists, and both of these ship in this sub-phase.
 */
registerModifierHints('timeline', (ctx) =>
  ctx.hover === 'timeline-track' || ctx.hover === 'timeline-key'
    ? [
        { mod: 'ctrl', label: 'Snap to keys', priority: 15 },
        { mod: 'shift', label: 'Drag marquee-select columns', priority: 25 },
      ]
    : [],
);

// ── transport ────────────────────────────────────────────────────────────────

/** `Space` / the ▶⏸ button: pause in place while playing, otherwise play (design §5.5). */
export function togglePlayback(): void {
  if ($animPlaying.get()) pausePreview();
  else playAnimationPreview();
}

/**
 * `K` / ＋Key / double-click a track: insert a column at the playhead, motion-neutrally
 * (design §5.4). A column already within 1 ms is a no-op that SELECTS and pins it instead —
 * detected here by the keyframe count, which is what lets the two cases flash differently.
 */
export function insertKeyframeAtPlayhead(): void {
  const anim = $activeAnimation.get();
  if (!anim) return;
  const t = $playheadSec.get();
  const before = anim.keyframes.length;
  const kfId = addKeyframe(anim.id, t);
  const after = $activeAnimation.get()?.keyframes.length ?? before;
  selectKeyframeForEditing(anim.id, kfId);
  $timelineSelection.set([kfId]);
  const at = ($activeAnimation.get()?.keyframes.find((k) => k.id === kfId)?.timeSec ?? t).toFixed(
    2,
  );
  if (after > before) {
    status(`Keyframe added @${at}s`, { severity: 'success', action: undoStatusAction() });
  } else {
    status(`Keyframe already at ${at}s — selected`);
  }
}

/**
 * `⇧←` / `⇧→` — park the playhead on the previous/next column WITHOUT pinning it. That is
 * the deliberate difference from `,`/`.` (design §12.2): this is navigation, those are
 * "go edit that keyframe". Never wraps.
 */
export function snapPlayheadToKeyframe(dir: 1 | -1): void {
  const anim = $activeAnimation.get();
  if (!anim) return;
  const now = $playheadSec.get();
  const sorted = [...anim.keyframes].sort((a, b) => a.timeSec - b.timeSec);
  const next =
    dir === 1
      ? sorted.find((k) => k.timeSec > now + 1e-6)
      : [...sorted].reverse().find((k) => k.timeSec < now - 1e-6);
  if (next) parkPlayhead(next.timeSec);
}

// ── column selection + clipboard (design §5.7) ───────────────────────────────

export function selectAllColumns(): void {
  const anim = $activeAnimation.get();
  if (anim) $timelineSelection.set(anim.keyframes.map((k) => k.id));
}

export function clearColumnSelection(): void {
  if ($timelineSelection.get().length > 0) $timelineSelection.set([]);
}

export function copySelectedColumns(): void {
  const n = copyKeyframes($timelineSelection.get());
  if (n > 0) status(`Copied ${n} keyframe${n === 1 ? '' : 's'}`);
}

/** ⌘X — copy, then delete whatever the §5.6 protections allow. */
export function cutSelectedColumns(): void {
  const anim = $activeAnimation.get();
  const ids = $timelineSelection.get();
  if (!anim || ids.length === 0) return;
  const copied = copyKeyframes(ids);
  if (copied === 0) return;
  const { removed, skipped } = removeKeyframes(anim.id, ids);
  status(
    `Cut ${removed} keyframe${removed === 1 ? '' : 's'}` +
      (skipped > 0 ? ` — ${skipped} protected (rest anchor / clip start)` : ''),
    { severity: skipped > 0 ? 'warning' : 'success', action: undoStatusAction() },
  );
}

export function pasteColumnsAtPlayhead(): void {
  if (!$animClipboard.get()) {
    status('Nothing on the keyframe clipboard');
    return;
  }
  const { pasted, clamped } = pasteKeyframesAtPlayhead();
  if (pasted === 0) return;
  status(
    `Pasted ${pasted} keyframe${pasted === 1 ? '' : 's'}` +
      (clamped ? ' — some clamped to the clip end' : ''),
    { severity: clamped ? 'warning' : 'success', action: undoStatusAction() },
  );
}

/** The ⌫ policy (foundation §14.3): ≤5 columns go straight through, >5 raise the strip. */
export function deleteSelectedColumns(): void {
  const ids = $timelineSelection.get();
  if (ids.length === 0) return;
  if (ids.length > 5) {
    $timelineDeleteConfirm.set({ ids: [...ids] });
    return;
  }
  commitColumnDelete(ids);
}

/** Performs the delete and reports it — the confirm strip's [Delete] lands here too. */
export function commitColumnDelete(ids: readonly string[]): void {
  const anim = $activeAnimation.get();
  $timelineDeleteConfirm.set(null);
  if (!anim || ids.length === 0) return;
  const { removed, skipped } = removeKeyframes(anim.id, ids);
  if (removed === 0) {
    status(
      skipped === 1
        ? 'This keyframe is the rest anchor — re-anchor another keyframe first'
        : 'Those keyframes are protected — the clip start and the rest anchor stay',
      { severity: 'warning' },
    );
    return;
  }
  status(
    `Deleted ${removed} keyframe${removed === 1 ? '' : 's'}` +
      (skipped > 0 ? ` — ${skipped} protected` : ''),
    { severity: skipped > 0 ? 'warning' : 'success', action: undoStatusAction() },
  );
}

// ── zoom / pan / fit (design §5.9) ───────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Keeps a view inside `[-10% clip, +110% clip]` at the current zoom. */
function clampView(
  startSec: number,
  pxPerSec: number,
  durationSec: number,
): {
  startSec: number;
  pxPerSec: number;
} {
  const px = clamp(pxPerSec, PX_PER_SEC_MIN, PX_PER_SEC_MAX);
  const visible = ($timelineTracksWidth.get() || 600) / px;
  const lo = -0.1 * durationSec;
  const hi = Math.max(lo, 1.1 * durationSec - visible);
  return { startSec: clamp(startSec, lo, hi), pxPerSec: px };
}

/** Zooms by `factor`, keeping `aboutSec` under the same pixel (cursor- or playhead-anchored). */
export function zoomTimeline(factor: number, aboutSec: number): void {
  const anim = $activeAnimation.get();
  if (!anim) return;
  const { startSec, pxPerSec } = $timelineView.get();
  const next = clamp(pxPerSec * factor, PX_PER_SEC_MIN, PX_PER_SEC_MAX);
  const anchorPx = (aboutSec - startSec) * pxPerSec;
  $timelineView.set(clampView(aboutSec - anchorPx / next, next, anim.durationSec));
}

/** Zoom in/out about the PLAYHEAD (the `=` / `-` bindings). */
export function zoomTimelineAboutPlayhead(factor: number): void {
  zoomTimeline(factor, $playheadSec.get());
}

/**
 * Sets the view ABSOLUTELY, clamped exactly like every other writer — the phone's pinch-zoom
 * and two-finger pan, which move zoom and offset together in one gesture and so cannot be
 * expressed as a `zoomTimeline` + `panTimeline` pair without fighting each other's clamps.
 */
export function setTimelineView(startSec: number, pxPerSec: number): void {
  const anim = $activeAnimation.get();
  if (!anim) return;
  $timelineView.set(clampView(startSec, pxPerSec, anim.durationSec));
}

export function panTimeline(deltaSec: number): void {
  const anim = $activeAnimation.get();
  if (!anim) return;
  const view = $timelineView.get();
  $timelineView.set(clampView(view.startSec + deltaSec, view.pxPerSec, anim.durationSec));
}

/** `F` — the whole clip with 5% margins on each side. */
export function fitClip(): void {
  const anim = $activeAnimation.get();
  const width = $timelineTracksWidth.get();
  if (!anim || width <= 0 || anim.durationSec <= 0) return;
  const span = anim.durationSec * 1.1;
  $timelineView.set(clampView(-0.05 * anim.durationSec, width / span, anim.durationSec));
}

/** `⇧F` — the selected columns (a single column gets a ±0.5 s window). */
export function fitSelection(): void {
  const anim = $activeAnimation.get();
  const width = $timelineTracksWidth.get();
  const ids = new Set($timelineSelection.get());
  if (!anim || width <= 0 || ids.size === 0) return fitClip();
  const times = anim.keyframes.filter((k) => ids.has(k.id)).map((k) => k.timeSec);
  if (times.length === 0) return fitClip();
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  const span = Math.max(hi - lo, 1) * 1.2;
  $timelineView.set(clampView((lo + hi) / 2 - span / 2, width / span, anim.durationSec));
}

/**
 * Clip switch (design §5.9 auto-fit, §6.1 "playhead → its anchor"): re-fit the view, scroll
 * the tracks back to the top and spring the playhead to the new clip's rest anchor.
 */
export function refitForClip(): void {
  fitClip();
  $timelineScrollTop.set(0);
  returnToRest();
}
