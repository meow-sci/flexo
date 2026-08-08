import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Button,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  SubmenuTrigger,
} from '../kit';
import { EASING_PRESETS } from '../../ksa/easing';
import type { EasingPreset, PartAnimation } from '../../ksa/types';
import { $part, pushUndo } from '../../state/editorStore';
import { $heldModifiers, setHoverContext } from '../../state/modifierStore';
import { status, undoStatusAction } from '../../state/statusStore';
import {
  $activeJointId,
  $animPlaying,
  $animScrubbing,
  $easingFocusChannel,
  $editKeyframeId,
  $jointTreeCollapsed,
  $playheadSec,
  $timelineSelection,
  $timelineView,
  beginScrub,
  copyJointPose,
  endScrub,
  moveKeyframes,
  parkPlayhead,
  pasteJointPose,
  removeKeyframes,
  resetJointPoseToCurve,
  scrubTo,
  selectKeyframeForEditing,
  setJointChannelEasing,
  setRestAnchor,
} from '../../state/animationStore';
import { buildDopeSheetModel, summaryMarks, type DopeSheetModel } from './dopeSheetModel';
import {
  DRAG_THRESHOLD_PX,
  growOnlyColumnRange,
  marqueeColumns,
  resolveGesture,
  resolveRetimeDt,
  rulerSteps,
  snapCandidates,
  toggleColumn,
  type TimelineHit,
} from './dopeSheetInteractions';
import {
  $easingClipboard,
  $timelineScrollTop,
  $timelineTracksWidth,
  CLUSTER_PX,
  DIAMOND_HIT,
  ROW_H,
  RULER_H,
  SUMMARY_H,
  fitClip,
  insertKeyframeAtPlayhead,
  setTimelineView,
  zoomTimeline,
  PX_PER_SEC_MAX,
  PX_PER_SEC_MIN,
} from './timelineActions';

/**
 * The dopesheet surface (design-animation-mode.md §5.1–§5.9): an adaptive ruler, the sticky
 * `∑` summary row, one track per visible joint with ◆/◇ diamonds and easing spans, ⚓ anchor
 * badges, the playhead, and the complete §5.3 pointer table.
 *
 * **Two stacked canvases, by design (§5.8, guardrail 10).** The STATIC layer redraws from
 * React — once per document / view / selection change. The DYNAMIC layer draws ONLY the
 * playhead + the marquee rectangle and is repainted from a DIRECT `$playheadSec`
 * subscription, so a 60 Hz playhead never touches React at all. That is the
 * `PreviewProgressLabel` lesson, applied structurally.
 *
 * Neither canvas participates in the three.js render loop: scene invalidation still happens
 * exactly where it did — `EditorScene.sub($playheadSec)` — so nothing here can force the
 * on-demand loop continuous.
 *
 * The canvas is never the ONLY path to a column (§5.8 a11y): `,`/`.` step columns, the
 * transport inserts and the 11C keyframe card lists them.
 */

/** Top of the scrolling track rows, px from the canvas top. */
const ROWS_TOP = RULER_H + SUMMARY_H;
/** Half-height of a segment span's clickable band, px (see the deviation note below). */
const SEGMENT_BAND = 4;
/**
 * Touch retime arming delay, ms (design §14 row 1: "long-press 250 ms + drag diamond =
 * retime"). Without it a finger that lands on a diamond and slides while scrolling would
 * silently retime a column — the one gesture on this surface that edits the document.
 */
const LONG_PRESS_MS = 250;

interface Palette {
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  border: string;
  accent: string;
  warning: string;
  panel: string;
  panelSunken: string;
}

function readPalette(el: HTMLElement): Palette {
  const s = getComputedStyle(el);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    fg: v('--color-fg'),
    fgMuted: v('--color-fg-muted'),
    fgSubtle: v('--color-fg-subtle'),
    border: v('--color-border'),
    accent: v('--color-accent'),
    warning: v('--color-warning'),
    panel: v('--color-panel'),
    panelSunken: v('--color-panel-sunken'),
  };
}

/** One drawn diamond group: a single column, or an overlap cluster rendered as `◆N`. */
interface ColumnGroup {
  x: number;
  /** Indices into `model.columns`. */
  indices: number[];
}

interface Geometry {
  width: number;
  height: number;
  startSec: number;
  pxPerSec: number;
  groups: ColumnGroup[];
  /** Column x by column index (ungrouped) — segment spans and the anchor badge use it. */
  xs: number[];
  rowCount: number;
  scrollTop: number;
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, solid: boolean) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  if (solid) ctx.fill();
  else ctx.stroke();
}

export function DopeSheetCanvas({
  anim,
  selectMode = false,
}: {
  anim: PartAnimation;
  /**
   * The phone sheet's `[☑ select]` header toggle (design §14 row 1) — the touch stand-in for
   * the ⇧-marquee, which needs a modifier key. While on, a tap on a diamond TOGGLES its
   * column in `$timelineSelection` instead of replacing the selection and pinning it. Desktop
   * leaves it off and keeps ⌘-click / ⇧-drag.
   */
  selectMode?: boolean;
}) {
  const view = useStore($timelineView);
  const selection = useStore($timelineSelection);
  const activeJointId = useStore($activeJointId);
  const collapsedMap = useStore($jointTreeCollapsed);
  const editKfId = useStore($editKeyframeId);
  const scrollTop = useStore($timelineScrollTop);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    hit: TimelineHit;
    nonce: number;
  } | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const dynamicRef = useRef<HTMLCanvasElement>(null);
  const geomRef = useRef<Geometry | null>(null);
  const marqueeRef = useRef<{ fromSec: number; toSec: number } | null>(null);
  const dragRef = useRef<{
    hit: TimelineHit;
    startX: number;
    startTime: number;
    dragged: boolean;
    mode: 'none' | 'scrub' | 'marquee' | 'retime';
    ids: string[];
    anchorTime: number;
    originalAnchorTime: number;
    /** Touch gestures follow §14's table, not §5.3's pointer table (see `onPointerDown`). */
    touch: boolean;
  } | null>(null);
  /** Live touch points, for the two-finger pinch/pan gesture. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  /** The in-flight pinch: the view at gesture start plus the time under the finger midpoint. */
  const pinchRef = useRef<{
    dist: number;
    pxPerSec: number;
    anchorSec: number;
    midY: number;
    scrollTop: number;
  } | null>(null);
  /** The long-press that ARMS a touch retime. `armed` survives until the pointer lifts. */
  const longPressRef = useRef<{ timer: number; armed: boolean }>({ timer: 0, armed: false });

  const model = buildDopeSheetModel(anim, collapsedMap);

  // ── size ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      const firstMeasure = $timelineTracksWidth.get() === 0 && w > 0;
      $timelineTracksWidth.set(w);
      // The very first measurement: the dock's clip-switch auto-fit may have run before
      // there was a width to fit INTO, so fit once here. Later resizes deliberately keep
      // the user's zoom.
      if (firstMeasure) fitClip();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  // ── the STATIC layer ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = staticRef.current;
    const host = hostRef.current;
    if (!canvas || !host || size.w <= 0 || size.h <= 0) return;
    const geom = drawStatic(canvas, host, {
      model,
      anim,
      view,
      selection,
      activeJointId,
      editKfId,
      scrollTop,
      size,
    });
    geomRef.current = geom;
    drawDynamic(dynamicRef.current, host, geom, marqueeRef.current);
  });

  // ── the DYNAMIC layer: a DIRECT subscription, never React state ────────────
  useEffect(() => {
    const repaint = () => {
      const geom = geomRef.current;
      const host = hostRef.current;
      if (geom && host) drawDynamic(dynamicRef.current, host, geom, marqueeRef.current);
    };
    const stops = [
      $playheadSec.subscribe(repaint),
      $animScrubbing.subscribe(repaint),
      $animPlaying.subscribe(repaint),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }, []);

  // ── hit testing ────────────────────────────────────────────────────────────
  const hitAt = (clientX: number, clientY: number): TimelineHit | null => {
    const geom = geomRef.current;
    const host = hostRef.current;
    if (!geom || !host) return null;
    const rect = host.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const timeSec = geom.startSec + x / geom.pxPerSec;
    if (y < RULER_H) return { kind: 'ruler', timeSec };
    const rowIndex: number | 'summary' =
      y < ROWS_TOP ? 'summary' : Math.floor((y - ROWS_TOP + geom.scrollTop) / ROW_H);
    if (typeof rowIndex === 'number' && rowIndex >= geom.rowCount)
      return { kind: 'ruler', timeSec };

    for (const group of geom.groups) {
      if (Math.abs(x - group.x) > DIAMOND_HIT) continue;
      if (group.indices.length > 1) {
        return {
          kind: 'cluster',
          timeSec,
          rowIndex,
          kfIds: group.indices.map((i) => model.columns[i].kfId),
        };
      }
      return { kind: 'diamond', timeSec, rowIndex, kfId: model.columns[group.indices[0]].kfId };
    }

    // DEVIATION (documented): §5.3 lists BOTH "click empty track → park" and "click segment
    // span → select the left column". Since the baseline connects every column, a whole-row
    // span target would make parking unreachable on a joint row. The span target is therefore
    // the ±4px band ON the drawn line; above/below it the row is empty track.
    if (typeof rowIndex === 'number') {
      const rowY = ROWS_TOP + rowIndex * ROW_H - geom.scrollTop + ROW_H / 2;
      if (Math.abs(y - rowY) <= SEGMENT_BAND) {
        for (let i = 0; i < geom.xs.length - 1; i++) {
          if (x > geom.xs[i] && x < geom.xs[i + 1]) {
            return { kind: 'segment', timeSec, rowIndex, kfId: model.columns[i].kfId };
          }
        }
      }
    }
    return { kind: 'track', timeSec, rowIndex };
  };

  const jointOfRow = (rowIndex: number | 'summary'): string | null =>
    typeof rowIndex === 'number' ? (model.rows[rowIndex]?.jointId ?? null) : null;

  const mods = () => {
    const held = $heldModifiers.get();
    return { shift: held.shift, meta: held.meta || held.ctrl, ctrl: held.ctrl, alt: held.alt };
  };

  // ── pointer gestures ───────────────────────────────────────────────────────

  /** Starts (or restarts) the two-finger pinch/pan from the current pointer pair. */
  const beginPinch = () => {
    const geom = geomRef.current;
    const points = [...pointersRef.current.values()];
    if (!geom || points.length < 2) return;
    const rect = hostRef.current?.getBoundingClientRect();
    const midX = (points[0].x + points[1].x) / 2 - (rect?.left ?? 0);
    pinchRef.current = {
      dist: Math.max(1, Math.abs(points[0].x - points[1].x)),
      pxPerSec: geom.pxPerSec,
      anchorSec: geom.startSec + midX / geom.pxPerSec,
      // The VERTICAL half of the same gesture (see the scroll note in `onPointerMove`).
      // Captured at gesture start so the scroll tracks the fingers absolutely instead of
      // integrating per-move deltas, which drifts.
      midY: (points[0].y + points[1].y) / 2,
      scrollTop: $timelineScrollTop.get(),
    };
  };

  const clearLongPress = () => {
    if (longPressRef.current.timer) window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = { timer: 0, armed: false };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    hostRef.current?.focus();
    if (e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // A second finger ALWAYS wins: whatever single-pointer gesture was in flight is finished
    // (a scrub releases cleanly) and the pair becomes pinch-zoom / two-finger pan (§14).
    if (pointersRef.current.size >= 2) {
      finishDrag();
      clearLongPress();
      beginPinch();
      return;
    }
    const hit = hitAt(e.clientX, e.clientY);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const touch = e.pointerType === 'touch';
    const m = { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey, ctrl: e.ctrlKey, alt: e.altKey };
    dragRef.current = {
      hit,
      startX: e.clientX,
      startTime: hit.timeSec,
      dragged: false,
      mode: 'none',
      ids: [],
      anchorTime: 0,
      originalAnchorTime: 0,
      touch,
    };
    // Touch: a diamond only becomes draggable after the long press (§14). Ruler and track
    // taps/drags keep the desktop meaning — tap parks, drag scrubs.
    clearLongPress();
    if (touch && (hit.kind === 'diamond' || hit.kind === 'cluster')) {
      longPressRef.current.timer = window.setTimeout(() => {
        longPressRef.current.armed = true;
      }, LONG_PRESS_MS);
    }
    const intent = resolveGesture(hit, m, false);
    if (intent.kind === 'park') parkPlayhead(intent.timeSec);
    if (intent.kind === 'zoom-cluster') zoomIntoCluster(anim, intent.kfIds);
    if (intent.kind === 'select-column') {
      // The phone's `[☑ select]` mode turns every plain tap into a membership toggle.
      const mode = selectMode && intent.mode === 'replace' ? 'toggle' : intent.mode;
      applySelect(intent.kfId, mode, rowOf(hit));
    }
  };

  const applySelect = (
    kfId: string,
    mode: 'replace' | 'toggle' | 'range',
    rowIndex: number | 'summary',
  ) => {
    const ordered = model.columns.map((c) => c.kfId);
    const current = $timelineSelection.get();
    if (mode === 'toggle') {
      $timelineSelection.set(toggleColumn(kfId, current));
      return;
    }
    if (mode === 'range') {
      $timelineSelection.set(growOnlyColumnRange(kfId, ordered, current));
      return;
    }
    $timelineSelection.set([kfId]);
    const jointId = jointOfRow(rowIndex);
    if (jointId) $activeJointId.set(jointId);
    selectKeyframeForEditing(anim.id, kfId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const geom = geomRef.current;
    const drag = dragRef.current;
    if (!geom) return;

    // ── two-finger pinch (zoom) / drag (pan), design §14 ─────────────────────
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const rect = hostRef.current?.getBoundingClientRect();
      const dist = Math.max(1, Math.abs(a.x - b.x));
      const midX = (a.x + b.x) / 2 - (rect?.left ?? 0);
      const px = Math.min(
        PX_PER_SEC_MAX,
        Math.max(PX_PER_SEC_MIN, (pinch.pxPerSec * dist) / pinch.dist),
      );
      // Keep the time that was under the finger midpoint AT the midpoint: a pure spread
      // zooms, a pure slide pans, and doing both at once behaves the way a map does.
      setTimelineView(pinch.anchorSec - midX / px, px);
      // …and the same slide VERTICALLY scrolls the tracks. Without this there was no touch
      // route to `$timelineScrollTop` at all — it was written only by `onWheel`, and the host
      // is `touch-none`, so on a phone every joint past the ~31 rows that fit was permanently
      // unreachable. A one-finger drag is already spoken for (it scrubs the playhead), which
      // is why this rides the two-finger gesture that already means "pan the view".
      const maxScroll = Math.max(0, geom.rowCount * ROW_H - (size.h - ROWS_TOP));
      const midY = (a.y + b.y) / 2;
      $timelineScrollTop.set(
        Math.min(maxScroll, Math.max(0, pinch.scrollTop - (midY - pinch.midY))),
      );
      return;
    }

    if (!drag) {
      const hover = hitAt(e.clientX, e.clientY);
      setHoverContext(
        hover?.kind === 'diamond' || hover?.kind === 'cluster' ? 'timeline-key' : 'timeline-track',
      );
      return;
    }
    const timeSec =
      geom.startSec +
      (e.clientX - (hostRef.current?.getBoundingClientRect().left ?? 0)) / geom.pxPerSec;

    if (!drag.dragged && Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX) return;
    // A touch that started on a diamond drags NOTHING until the long press arms it, and a
    // finger that moves first cancels the arming outright (§14) — so a scroll that happens
    // to begin on a key can never retime it.
    if (drag.touch && (drag.hit.kind === 'diamond' || drag.hit.kind === 'cluster')) {
      if (!longPressRef.current.armed) {
        if (longPressRef.current.timer) window.clearTimeout(longPressRef.current.timer);
        longPressRef.current.timer = 0;
        return;
      }
    }
    if (!drag.dragged) {
      drag.dragged = true;
      const intent = resolveGesture(drag.hit, mods(), true);
      if (intent.kind === 'scrub') {
        drag.mode = 'scrub';
        beginScrub();
      } else if (intent.kind === 'marquee') {
        drag.mode = 'marquee';
        marqueeRef.current = { fromSec: drag.startTime, toSec: timeSec };
      } else if (intent.kind === 'retime') {
        const selected = $timelineSelection.get();
        drag.ids = selected.includes(intent.kfId) ? [...selected] : [intent.kfId];
        const kf = anim.keyframes.find((k) => k.id === intent.kfId);
        drag.originalAnchorTime = kf?.timeSec ?? 0;
        drag.anchorTime = drag.originalAnchorTime;
        if (drag.originalAnchorTime === 0) {
          drag.mode = 'none';
          status('The first keyframe pins the clip start', { severity: 'warning' });
          hostRef.current?.animate?.(
            [{ transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, {}],
            { duration: 120, iterations: 2 },
          );
          return;
        }
        drag.mode = 'retime';
        // ONE undo push at drag start; every move below is streaming (foundation invariant).
        pushUndo('retime keyframe', `${drag.originalAnchorTime.toFixed(2)}s`);
      }
    }

    if (drag.mode === 'scrub') {
      scrubTo(timeSec);
      return;
    }
    if (drag.mode === 'marquee') {
      marqueeRef.current = { fromSec: drag.startTime, toSec: timeSec };
      drawDynamic(dynamicRef.current, hostRef.current, geom, marqueeRef.current);
      return;
    }
    if (drag.mode === 'retime') applyRetime(drag, timeSec, geom);
  };

  const applyRetime = (
    drag: NonNullable<typeof dragRef.current>,
    pointerSec: number,
    geom: Geometry,
  ) => {
    const live = $part.get().animations.find((a) => a.id === anim.id);
    const dtRaw = pointerSec - drag.startTime;
    const dt = resolveRetimeDt({
      anchorTime: drag.originalAnchorTime,
      rawDt: dtRaw,
      pxPerSec: geom.pxPerSec,
      gridSec: rulerSteps(geom.pxPerSec).minor,
      ctrlHeld: $heldModifiers.get().ctrl,
      candidates: live ? snapCandidates(live, drag.ids, $playheadSec.get()) : [],
    });
    const target = drag.originalAnchorTime + dt;
    const now = live?.keyframes.find((k) => k.id === anchorIdOf(drag))?.timeSec ?? target;
    const delta = target - now;
    if (Math.abs(delta) < 1e-9) return;
    const { blocked } = moveKeyframes(anim.id, drag.ids, delta);
    drag.anchorTime = target;
    status(
      `@${drag.originalAnchorTime.toFixed(2)}s → ${target.toFixed(2)}s · all joints` +
        (blocked ? ' · the clip-start keyframe stays put' : ''),
    );
  };

  /** Pointer up/cancel: drop the point, end the pinch when the pair breaks, finish the drag. */
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    clearLongPress();
    finishDrag();
  };

  const finishDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.mode === 'scrub') endScrub();
    if (drag.mode === 'marquee') {
      const m = marqueeRef.current;
      marqueeRef.current = null;
      if (m)
        $timelineSelection.set(marqueeColumns(anim, m.fromSec, m.toSec, $timelineSelection.get()));
    }
    if (drag.mode === 'retime') {
      status('Keyframe retimed', { severity: 'success', action: undoStatusAction() });
    }
    const geom = geomRef.current;
    if (geom) drawDynamic(dynamicRef.current, hostRef.current, geom, null);
  };

  /** Escape mid-drag: restore the drag-start times directly (never `undo()` — plan §P11B.06). */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (e.key !== 'Escape' || !drag || !drag.dragged) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.mode === 'retime') {
      const live = $part.get().animations.find((a) => a.id === anim.id);
      const now = live?.keyframes.find((k) => k.id === anchorIdOf(drag))?.timeSec;
      if (now !== undefined) moveKeyframes(anim.id, drag.ids, drag.originalAnchorTime - now);
    }
    if (drag.mode === 'scrub') endScrub();
    marqueeRef.current = null;
    dragRef.current = null;
    const geom = geomRef.current;
    if (geom) drawDynamic(dynamicRef.current, hostRef.current, geom, null);
  };

  /**
   * Double-click (§5.3): insert a keyframe at that time on an empty track, and on a segment
   * span additionally focus that joint. A separate handler rather than a `detail === 2`
   * check inside `onPointerDown` — a `PointerEvent`'s `detail` is 0 by spec, so the click
   * count only exists on the `dblclick` MouseEvent.
   */
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const hit = hitAt(e.clientX, e.clientY);
    if (!hit || (hit.kind !== 'track' && hit.kind !== 'segment')) return;
    dragRef.current = null;
    parkPlayhead(hit.timeSec);
    insertKeyframeAtPlayhead();
    if (hit.kind === 'segment') {
      const jointId = jointOfRow(hit.rowIndex);
      if (jointId) $activeJointId.set(jointId);
      // …and open the left Joint card's Easing block on the Uniform tab (design §5.3): the
      // pin the insert above just set is what makes that block render for THIS segment.
      $easingFocusChannel.set('uniform');
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const geom = geomRef.current;
    if (!geom) return;
    // Browsers report a trackpad pinch as ctrl+wheel, which is why the two share a branch.
    if (e.ctrlKey || e.metaKey) {
      const rect = hostRef.current?.getBoundingClientRect();
      const aboutSec = geom.startSec + (e.clientX - (rect?.left ?? 0)) / geom.pxPerSec;
      zoomTimeline(e.deltaY < 0 ? 1.15 : 1 / 1.15, aboutSec);
      return;
    }
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      $timelineView.set({ ...$timelineView.get(), startSec: geom.startSec + dx / geom.pxPerSec });
      return;
    }
    const maxScroll = Math.max(0, geom.rowCount * ROW_H - (size.h - ROWS_TOP));
    $timelineScrollTop.set(Math.min(maxScroll, Math.max(0, scrollTop + e.deltaY)));
  };

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const hit = hitAt(e.clientX, e.clientY);
    const rect = hostRef.current?.getBoundingClientRect();
    if (!hit || !rect) return;
    setMenu({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      hit,
      nonce: Date.now(),
    });
  };

  return (
    <div
      ref={hostRef}
      tabIndex={-1}
      // `touch-none`: the pinch/pan/long-press gestures below are ours, so the browser must
      // not also scroll or page-zoom while a finger is on the dopesheet.
      className="relative min-h-0 flex-1 touch-none overflow-hidden outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={finishDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
      onPointerLeave={() => setHoverContext('none')}
      aria-label="Keyframe dopesheet. Every keyframe is also reachable with the , and . keys and from the keyframe list."
      role="img"
    >
      <canvas ref={staticRef} className="absolute inset-0" />
      <canvas ref={dynamicRef} className="pointer-events-none absolute inset-0" />
      <MenuTrigger isOpen={menu !== null} onOpenChange={(open) => !open && setMenu(null)}>
        <Button
          aria-label="Timeline context menu"
          className="pointer-events-none absolute h-px w-px opacity-0"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
        />
        <Popover>
          {menu && (
            <ContextMenu
              key={menu.nonce}
              anim={anim}
              hit={menu.hit}
              jointId={jointOfRow(rowOf(menu.hit))}
              onDone={() => setMenu(null)}
            />
          )}
        </Popover>
      </MenuTrigger>
    </div>
  );
}

/** The track a hit landed on ('summary' for the ∑ row and for the ruler). */
function rowOf(hit: TimelineHit): number | 'summary' {
  return hit.kind === 'ruler' ? 'summary' : hit.rowIndex;
}

/** The id of the column a retime drag is anchored on. */
function anchorIdOf(drag: { hit: TimelineHit; ids: string[] }): string {
  return drag.hit.kind === 'diamond' ? drag.hit.kfId : drag.ids[0];
}

function zoomIntoCluster(anim: PartAnimation, kfIds: string[]): void {
  const times = anim.keyframes.filter((k) => kfIds.includes(k.id)).map((k) => k.timeSec);
  if (times.length === 0) return;
  const mid = (Math.min(...times) + Math.max(...times)) / 2;
  zoomTimeline(3, mid);
}

const PRESET_IDS = Object.keys(EASING_PRESETS) as EasingPreset[];

/**
 * The right-click menus (design §5.2 + §5.6). A fresh instance per open (keyed on the
 * menu's nonce) so its enabled/checked predicates are genuinely re-evaluated — a menu that
 * never unmounts freezes its predicates under React Compiler memoization.
 */
function ContextMenu({
  anim,
  hit,
  jointId,
  onDone,
}: {
  anim: PartAnimation;
  hit: TimelineHit;
  jointId: string | null;
  onDone: () => void;
}) {
  const kfId = hit.kind === 'diamond' || hit.kind === 'segment' ? hit.kfId : null;
  const column = kfId ? anim.keyframes.find((k) => k.id === kfId) : null;
  const isSegment = hit.kind === 'segment';

  if (!column) {
    return (
      <Menu onAction={onDone}>
        <MenuItem
          id="insert"
          onAction={() => {
            parkPlayhead(hit.timeSec);
            insertKeyframeAtPlayhead();
          }}
        >
          Insert keyframe here
        </MenuItem>
      </Menu>
    );
  }

  return (
    <Menu onAction={onDone}>
      {jointId && (
        <MenuItem id="reset" onAction={() => resetJointPoseToCurve(anim.id, column.id, jointId)}>
          Reset joint here to on-curve
        </MenuItem>
      )}
      {jointId && (
        <MenuItem
          id="copyPose"
          onAction={() => {
            if (copyJointPose(anim.id, column.id, jointId)) status('Joint pose copied');
          }}
        >
          Copy pose
        </MenuItem>
      )}
      {jointId && (
        <MenuItem
          id="pastePose"
          onAction={() => {
            if (pasteJointPose(anim.id, column.id, jointId)) {
              status('Joint pose pasted', { severity: 'success', action: undoStatusAction() });
            } else {
              status('No joint pose on the clipboard');
            }
          }}
        >
          Paste pose
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem
        id="reanchor"
        onAction={() => {
          setRestAnchor(anim.id, column.id);
          status(
            `Rest anchor moved to @${column.timeSec.toFixed(2)}s — this keyframe now matches the modeled placements`,
            { severity: 'success', action: undoStatusAction() },
          );
        }}
      >
        Re-anchor here
      </MenuItem>
      <MenuItem
        id="delete"
        variant="danger"
        onAction={() => {
          const { removed, skipped } = removeKeyframes(anim.id, [column.id]);
          if (removed === 0) {
            status(
              column.timeSec === 0
                ? 'The first keyframe pins the clip start'
                : 'This keyframe is the rest anchor — re-anchor another keyframe first',
              { severity: 'warning' },
            );
          } else {
            status(`Deleted 1 keyframe`, { severity: 'success', action: undoStatusAction() });
          }
          void skipped;
        }}
      >
        Delete keyframe
      </MenuItem>
      {isSegment && jointId && <MenuSeparator />}
      {isSegment && jointId && (
        <SubmenuTrigger>
          <MenuItem id="easing">Easing</MenuItem>
          <Popover>
            <Menu onAction={onDone}>
              {PRESET_IDS.map((preset) => (
                <MenuItem
                  key={preset}
                  id={preset}
                  onAction={() => {
                    pushUndo('segment easing', preset);
                    setJointChannelEasing(anim.id, column.id, jointId, 'uniform', {
                      kind: 'preset',
                      preset,
                    });
                  }}
                >
                  {preset}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </SubmenuTrigger>
      )}
      {isSegment && jointId && (
        <MenuItem
          id="copyEasing"
          onAction={() => {
            $easingClipboard.set(column.easings?.[jointId] ?? null);
            status('Easing copied');
          }}
        >
          Copy easing
        </MenuItem>
      )}
      {isSegment && jointId && (
        <MenuItem
          id="pasteEasing"
          onAction={() => {
            const seg = $easingClipboard.get();
            pushUndo('segment easing', 'paste');
            for (const channel of ['position', 'rotation', 'scale'] as const) {
              setJointChannelEasing(
                anim.id,
                column.id,
                jointId,
                channel,
                seg?.[channel] ?? { kind: 'preset', preset: 'linear' },
              );
            }
            status('Easing pasted', { severity: 'success', action: undoStatusAction() });
          }}
        >
          Paste easing
        </MenuItem>
      )}
    </Menu>
  );
}

// ── drawing ──────────────────────────────────────────────────────────────────

interface DrawInput {
  model: DopeSheetModel;
  anim: PartAnimation;
  view: { startSec: number; pxPerSec: number };
  selection: string[];
  activeJointId: string | null;
  editKfId: string | null;
  scrollTop: number;
  size: { w: number; h: number };
}

function prepare(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

function drawStatic(canvas: HTMLCanvasElement, host: HTMLElement, input: DrawInput): Geometry {
  const { model, anim, view, selection, activeJointId, editKfId, scrollTop, size } = input;
  const { w, h } = size;
  const p = readPalette(host);
  const xOf = (t: number) => (t - view.startSec) * view.pxPerSec;
  const xs = model.columns.map((c) => xOf(c.timeSec));

  // Overlap clustering: consecutive columns closer than CLUSTER_PX collapse into one pill.
  const groups: ColumnGroup[] = [];
  for (let i = 0; i < xs.length; i++) {
    const last = groups[groups.length - 1];
    if (last && xs[i] - xs[last.indices[last.indices.length - 1]] < CLUSTER_PX) {
      last.indices.push(i);
      last.x = (xs[last.indices[0]] + xs[i]) / 2;
    } else {
      groups.push({ x: xs[i], indices: [i] });
    }
  }

  const geom: Geometry = {
    width: w,
    height: h,
    startSec: view.startSec,
    pxPerSec: view.pxPerSec,
    groups,
    xs,
    rowCount: model.rows.length,
    scrollTop,
  };

  const ctx = prepare(canvas, w, h);
  if (!ctx) return geom;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  // Selected-column tint bands, behind everything.
  const selected = new Set(selection);
  ctx.fillStyle = p.accent;
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < model.columns.length; i++) {
    if (selected.has(model.columns[i].kfId)) ctx.fillRect(xs[i] - 3, RULER_H, 6, h - RULER_H);
  }
  ctx.globalAlpha = 1;

  // ── ruler ────────────────────────────────────────────────────────────────
  ctx.fillStyle = p.panelSunken;
  ctx.fillRect(0, 0, w, RULER_H);
  const { minor, major } = rulerSteps(view.pxPerSec);
  const from = Math.floor(view.startSec / minor) * minor;
  const to = view.startSec + w / view.pxPerSec;
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let t = from; t <= to; t += minor) {
    const x = Math.round(xOf(t)) + 0.5;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ctx.moveTo(x, isMajor ? 6 : RULER_H - 5);
    ctx.lineTo(x, RULER_H);
  }
  ctx.stroke();
  ctx.fillStyle = p.fgSubtle;
  for (let t = Math.floor(view.startSec / major) * major; t <= to; t += major) {
    ctx.fillText(major < 1 ? t.toFixed(2) : t.toFixed(1), xOf(t) + 3, 8);
  }
  ctx.strokeStyle = p.border;
  ctx.beginPath();
  ctx.moveTo(0, RULER_H - 0.5);
  ctx.lineTo(w, RULER_H - 0.5);
  ctx.stroke();

  // Clip-extent shading: everything outside [0, duration] is dimmed.
  ctx.fillStyle = p.panelSunken;
  ctx.globalAlpha = 0.6;
  if (xOf(0) > 0) ctx.fillRect(0, RULER_H, xOf(0), h - RULER_H);
  if (xOf(anim.durationSec) < w) {
    ctx.fillRect(xOf(anim.durationSec), RULER_H, w - xOf(anim.durationSec), h - RULER_H);
  }
  ctx.globalAlpha = 1;

  // ── summary row ──────────────────────────────────────────────────────────
  const marks = summaryMarks(model);
  const sumY = RULER_H + SUMMARY_H / 2;
  drawTrack(ctx, p, geom, groups, marks, sumY, model, { summary: true });
  ctx.strokeStyle = p.border;
  ctx.beginPath();
  ctx.moveTo(0, ROWS_TOP - 0.5);
  ctx.lineTo(w, ROWS_TOP - 0.5);
  ctx.stroke();

  // ── joint rows ───────────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, ROWS_TOP, w, h - ROWS_TOP);
  ctx.clip();
  for (let r = 0; r < model.rows.length; r++) {
    const row = model.rows[r];
    const y = ROWS_TOP + r * ROW_H - scrollTop + ROW_H / 2;
    if (y < ROWS_TOP - ROW_H || y > h + ROW_H) continue;
    if (row.jointId === activeJointId) {
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(0, y - ROW_H / 2, w, ROW_H);
      ctx.globalAlpha = 1;
    }
    drawSegments(ctx, p, geom, row.segments, y);
    drawTrack(ctx, p, geom, groups, row.marks, y, model, {
      summary: false,
      aggregated: row.aggregated,
      warn: row.memberCount === 0,
    });
  }
  ctx.restore();

  // The pinned column reads as a brighter full-height rule.
  if (editKfId) {
    const idx = model.columns.findIndex((c) => c.kfId === editKfId);
    if (idx >= 0) {
      ctx.strokeStyle = p.accent;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(xs[idx]) + 0.5, RULER_H);
      ctx.lineTo(Math.round(xs[idx]) + 0.5, h);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  return geom;
}

/** One track's diamonds (plus cluster pills and ⚓ badges). */
function drawTrack(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  geom: Geometry,
  groups: ColumnGroup[],
  marks: ('move' | 'hold')[],
  y: number,
  model: DopeSheetModel,
  opts: { summary: boolean; aggregated?: boolean; warn?: boolean },
) {
  // The connecting baseline, first column to last.
  if (geom.xs.length > 1) {
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(geom.xs[0], y + 0.5);
    ctx.lineTo(geom.xs[geom.xs.length - 1], y + 0.5);
    ctx.stroke();
  }
  const r = opts.summary ? 5 : 4.5;
  for (const group of groups) {
    const anyMove = group.indices.some((i) => marks[i] === 'move');
    const anchor = group.indices.some((i) => model.columns[i].isAnchor);
    const color = opts.warn ? p.fgSubtle : anyMove ? (opts.summary ? p.fg : p.accent) : p.fgMuted;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    if (group.indices.length > 1) {
      // `◆N` cluster pill — clicking it zooms into the cluster (§5.3).
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(group.x - 9, y - r, 18, r * 2, 3);
      if (anyMove) ctx.fill();
      else ctx.stroke();
      ctx.fillStyle = anyMove ? p.panel : color;
      ctx.textAlign = 'center';
      ctx.fillText(`${group.indices.length}`, group.x, y);
      ctx.textAlign = 'left';
    } else {
      diamond(ctx, group.x, y, r, anyMove);
      if (opts.aggregated && anyMove) diamond(ctx, group.x, y, r + 2.5, false);
    }
    if (anchor) {
      // Beside the diamond, not above it: above would sit in the ruler strip on the ∑ row.
      ctx.fillStyle = p.warning;
      ctx.fillText('⚓', group.x + r + 3, y);
    }
  }
}

/** Per-segment easing indicators: a thicker span plus its label when it fits. */
function drawSegments(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  geom: Geometry,
  segments: (string | null)[],
  y: number,
) {
  for (let i = 0; i < segments.length; i++) {
    const label = segments[i];
    if (!label) continue;
    const x0 = geom.xs[i];
    const x1 = geom.xs[i + 1];
    ctx.strokeStyle = p.fgMuted;
    ctx.lineWidth = 2;
    ctx.setLineDash(label === 'per-channel' ? [2, 2] : []);
    ctx.beginPath();
    ctx.moveTo(x0 + 6, y + 0.5);
    ctx.lineTo(x1 - 6, y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    const text = label === 'per-channel' ? 'per-chan' : label;
    const width = ctx.measureText(text).width;
    if (x1 - x0 > width + 24) {
      ctx.fillStyle = p.panel;
      ctx.fillRect((x0 + x1 - width) / 2 - 3, y - 6, width + 6, 12);
      ctx.fillStyle = p.fgSubtle;
      ctx.fillText(text, (x0 + x1 - width) / 2, y);
    }
  }
}

/** The dynamic layer: the playhead line + time bubble, and the live marquee rectangle. */
function drawDynamic(
  canvas: HTMLCanvasElement | null,
  host: HTMLElement | null,
  geom: Geometry,
  marquee: { fromSec: number; toSec: number } | null,
) {
  if (!canvas || !host) return;
  const ctx = prepare(canvas, geom.width, geom.height);
  if (!ctx) return;
  const p = readPalette(host);
  const sec = $playheadSec.get();
  const x = Math.round((sec - geom.startSec) * geom.pxPerSec) + 0.5;

  if (marquee) {
    const mx0 = (Math.min(marquee.fromSec, marquee.toSec) - geom.startSec) * geom.pxPerSec;
    const mx1 = (Math.max(marquee.fromSec, marquee.toSec) - geom.startSec) * geom.pxPerSec;
    ctx.fillStyle = p.accent;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(mx0, RULER_H, mx1 - mx0, geom.height - RULER_H);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.accent;
    ctx.strokeRect(mx0 + 0.5, RULER_H + 0.5, mx1 - mx0, geom.height - RULER_H - 1);
  }

  ctx.strokeStyle = p.fg;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, geom.height);
  ctx.stroke();

  const label = `${sec.toFixed(2)}s`;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(label).width + 8;
  ctx.fillStyle = p.fg;
  ctx.beginPath();
  ctx.roundRect(Math.min(Math.max(x - width / 2, 0), geom.width - width), 1, width, 13, 3);
  ctx.fill();
  ctx.fillStyle = p.panelSunken;
  ctx.textAlign = 'center';
  ctx.fillText(label, Math.min(Math.max(x, width / 2), geom.width - width / 2), 8);
  ctx.textAlign = 'left';
}
