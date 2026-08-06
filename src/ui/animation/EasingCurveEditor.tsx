import { useRef } from 'react';
import { useStore } from '@nanostores/react';
import { Button, ListBoxItem, Select, ToggleButton, ToggleButtonGroup, Tooltip } from '../kit';
import { pushUndo } from '../../state/editorStore';
import { $easingFocusChannel, setJointChannelEasing } from '../../state/animationStore';
import {
  controlPointsOf,
  evalBezierPoints,
  matchingPreset,
  segmentEasingUniform,
  type BezierPoints,
} from '../../ksa/easing';
import type {
  EasingChannel,
  EasingConfig,
  EasingPreset,
  JointSegmentEasing,
} from '../../ksa/types';
import { CHANNEL_LABELS, CHANNEL_TABS, PRESET_LABELS, PRESET_ORDER } from './easingLabels';

/**
 * **The per-channel easing editor** (design-animation-mode.md §8.3 EASING block; LOCKED #8).
 * The v1 `EasingEditor` widget — ten presets over a draggable 2-handle cubic-bézier SVG —
 * carried over VERBATIM (census §1.8 semantics are an invariant: handle x clamped to [0,1] so
 * time stays monotonic, y free within [−0.5, 1.5] so overshoot and anticipation are
 * expressible, "Custom curve" appearing in the dropdown off-preset, `overflow: visible` so a
 * handle may overhang the box) with channel TABS above it.
 *
 * The Uniform tab writes all three channels at once; it shows **Mixed** + `[Make uniform]`
 * when they disagree. That action copies the POSITION channel to all three — a deliberate
 * pick: position is the channel a pose edit almost always starts from, and picking one is
 * strictly better than refusing to answer.
 *
 * **Undo enrollment: STREAMING.** ONE `pushUndo('segment easing', …)` fires on `onEditStart`
 * (curve drag start / preset change) and every subsequent write streams — the v1 contract.
 */
export function EasingCurveEditor({
  animId,
  keyframeId,
  jointId,
  jointName,
  segment,
  nextTimeSec,
}: {
  animId: string;
  keyframeId: string;
  jointId: string;
  jointName: string;
  segment: JointSegmentEasing | undefined;
  /** The segment's END time — undefined on the final column, where easing is meaningless. */
  nextTimeSec: number | undefined;
}) {
  const tab = useStore($easingFocusChannel);
  const uniform = segmentEasingUniform(segment);
  const mixed = uniform === 'mixed';
  // The curve the widget shows: the shared config on the Uniform tab (linear when mixed —
  // the handles have to sit somewhere, and the Mixed banner says why they are not the truth),
  // or the tab's own channel.
  const shown: EasingConfig | undefined =
    tab === 'uniform' ? (mixed ? undefined : uniform) : segment?.[tab];

  if (nextTimeSec === undefined) return null;

  const editStart = () => pushUndo('segment easing', `${jointName} → ${nextTimeSec.toFixed(2)}s`);
  const write = (cfg: EasingConfig) => setJointChannelEasing(animId, keyframeId, jointId, tab, cfg);

  return (
    <div className="flex flex-col gap-1.5">
      <ToggleButtonGroup
        size="xs"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[tab]}
        onSelectionChange={(keys) => {
          const next = [...keys][0];
          if (typeof next === 'string') $easingFocusChannel.set(next as EasingChannel | 'uniform');
        }}
      >
        {CHANNEL_TABS.map((id) => (
          <ToggleButton key={id} size="xs" id={id}>
            {CHANNEL_LABELS[id]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {tab === 'uniform' && mixed && (
        <div className="flex items-center gap-2 rounded-md bg-panel px-1.5 py-1 text-xs">
          <span className="min-w-0 flex-1 text-fg-muted">Mixed — the three channels differ</span>
          <Tooltip content="Copy the Position curve onto Rotation and Scale">
            <Button
              size="xs"
              variant="secondary"
              onPress={() => {
                editStart();
                setJointChannelEasing(
                  animId,
                  keyframeId,
                  jointId,
                  'uniform',
                  segment?.position ?? LINEAR,
                );
              }}
            >
              Make uniform
            </Button>
          </Tooltip>
        </div>
      )}

      <CurveWidget value={shown} onEditStart={editStart} onChange={write} />
    </div>
  );
}

const LINEAR: EasingConfig = { kind: 'preset', preset: 'linear' };

// Unit square → SVG user units. Curve (0,0) is bottom-left, (1,1) top-right.
const S = 100;
const toSvg = (cx: number, cy: number) => ({ x: cx * S, y: (1 - cy) * S });

/**
 * The ported v1 curve widget. Storage is always an {@link EasingConfig}: picking a preset
 * emits `{kind:'preset'}`, dragging a handle emits `{kind:'cubicBezier'}`.
 */
function CurveWidget({
  value,
  onChange,
  onEditStart,
}: {
  value: EasingConfig | undefined;
  onChange: (cfg: EasingConfig) => void;
  onEditStart: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<0 | 1 | null>(null);
  const points = controlPointsOf(value);
  const [x1, y1, x2, y2] = points;
  const selectedKey = matchingPreset(points) ?? 'custom';

  const curvePath = (() => {
    const N = 40;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const cx = i / N;
      const { x, y } = toSvg(cx, evalBezierPoints(points, cx));
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
    }
    return d;
  })();

  const clientToCurve = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const local = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: local.x / S, y: 1 - local.y / S };
  };

  const onHandleDown = (handle: 0 | 1) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = handle;
    onEditStart();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current === null) return;
    const c = clientToCurve(e.clientX, e.clientY);
    if (!c) return;
    const cx = Math.min(1, Math.max(0, c.x)); // x clamped: time must stay monotonic
    const cy = Math.min(1.5, Math.max(-0.5, c.y)); // y free (overshoot), bounded for sanity
    const next: BezierPoints = dragging.current === 0 ? [cx, cy, x2, y2] : [x1, y1, cx, cy];
    onChange({ kind: 'cubicBezier', x1: next[0], y1: next[1], x2: next[2], y2: next[3] });
  };
  const onPointerUp = () => {
    dragging.current = null;
  };

  const h1 = toSvg(x1, y1);
  const h2 = toSvg(x2, y2);
  const c0 = toSvg(0, 0);
  const c1 = toSvg(1, 1);

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        size="sm"
        aria-label="Easing preset"
        value={selectedKey}
        onChange={(k) => {
          onEditStart();
          onChange({ kind: 'preset', preset: k as EasingPreset });
        }}
      >
        {PRESET_ORDER.map((p) => (
          <ListBoxItem key={p} id={p}>
            {PRESET_LABELS[p]}
          </ListBoxItem>
        ))}
        {selectedKey === 'custom' && <ListBoxItem id="custom">Custom curve</ListBoxItem>}
      </Select>
      <svg
        ref={svgRef}
        viewBox="-10 -38 120 176"
        className="w-full touch-none rounded-md border border-border bg-panel"
        style={{ overflow: 'visible' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* unit square + linear reference diagonal */}
        <rect
          x={0}
          y={0}
          width={S}
          height={S}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
        />
        <line
          x1={c0.x}
          y1={c0.y}
          x2={c1.x}
          y2={c1.y}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeDasharray="3 3"
        />
        {/* control-handle guide lines */}
        <line
          x1={c0.x}
          y1={c0.y}
          x2={h1.x}
          y2={h1.y}
          stroke="var(--color-accent, #6ab)"
          strokeOpacity={0.5}
        />
        <line
          x1={c1.x}
          y1={c1.y}
          x2={h2.x}
          y2={h2.y}
          stroke="var(--color-accent, #6ab)"
          strokeOpacity={0.5}
        />
        {/* the easing curve */}
        <path d={curvePath} fill="none" stroke="var(--color-accent, #6ab)" strokeWidth={2} />
        {/* draggable handles */}
        {(
          [
            [h1, 0],
            [h2, 1],
          ] as const
        ).map(([h, idx]) => (
          <circle
            key={idx}
            cx={h.x}
            cy={h.y}
            r={6}
            className="cursor-grab"
            fill="var(--color-accent, #6ab)"
            stroke="white"
            strokeWidth={1.5}
            onPointerDown={onHandleDown(idx)}
          />
        ))}
      </svg>
    </div>
  );
}
