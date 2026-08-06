import { useRef } from 'react';
import { Select, ListBoxItem } from './kit';
import {
  controlPointsOf,
  evalBezierPoints,
  matchingPreset,
  type BezierPoints,
} from '../ksa/easing';
import type { EasingConfig, EasingPreset } from '../ksa/types';

/**
 * Authoring widget for one keyframe-segment's easing: a preset dropdown plus a
 * draggable 2-handle cubic-bézier curve (CSS `cubic-bezier()` model). Storage is
 * always a {@link EasingConfig}; picking a preset emits `{kind:'preset'}`, dragging a
 * handle emits `{kind:'cubicBezier'}`. Handle x is clamped to [0,1] (time stays
 * monotonic); y is free so overshoot/anticipation curves are expressible.
 */

const PRESET_ORDER: EasingPreset[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
];

const PRESET_LABELS: Record<EasingPreset, string> = {
  linear: 'Linear',
  easeIn: 'Ease In',
  easeOut: 'Ease Out',
  easeInOut: 'Ease In-Out',
  easeInCubic: 'Ease In · Cubic',
  easeOutCubic: 'Ease Out · Cubic',
  easeInOutCubic: 'Ease In-Out · Cubic',
  easeInSine: 'Ease In · Sine',
  easeOutSine: 'Ease Out · Sine',
  easeInOutSine: 'Ease In-Out · Sine',
};

// Unit square → SVG user units. Curve (0,0) is bottom-left, (1,1) top-right.
const S = 100;
const toSvg = (cx: number, cy: number) => ({ x: cx * S, y: (1 - cy) * S });

export function EasingEditor({
  value,
  onChange,
  onEditStart,
}: {
  value: EasingConfig | undefined;
  /** Streamed on every preset pick / handle drag. */
  onChange: (cfg: EasingConfig) => void;
  /** Called once at the start of a drag / preset change (push undo here). */
  onEditStart?: () => void;
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
    onEditStart?.();
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
          onEditStart?.();
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
