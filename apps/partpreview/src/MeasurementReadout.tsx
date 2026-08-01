import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { ArrowDownLeft, ArrowRight, ArrowUp, Check, Copy } from 'lucide-react';
import { Button } from '../../../src/ui/kit';
import { AXIS_COLOR_CSS } from '../../../src/three/axisColors';
import { formatLengthValue, formatVec } from '../../../src/measure/format';
import { $measurements, $partBounds } from './settings';

/**
 * The three axes in readout order, each with the arrow that matches how that axis
 * projects on screen in the DEFAULT framing (camera at `(1, 0.6, 1)`): +X to the
 * right, +Y up, +Z down-left. The colors are {@link AXIS_COLOR_CSS}, the same ones
 * the viewport's corner {@link AxisGizmo} draws, so an arrow here always names the
 * arrow there.
 */
const AXES = [
  { key: 'x', Icon: ArrowRight, label: 'width' },
  { key: 'y', Icon: ArrowUp, label: 'height' },
  { key: 'z', Icon: ArrowDownLeft, label: 'depth' },
] as const;

/** How long the ✓ replaces the copy icon after a successful copy. */
const COPIED_MS = 1200;

/**
 * The whole part's extents as one compact, selectable, copy-on-click line.
 *
 * The editor draws a `CSS2DObject` label per axis (`MeasurementLayer`); three
 * floating labels are illegible in a 200×200 iframe, so the dimensions are shown
 * once, as HTML, instead — real DOM (not canvas) so a reader can select the text,
 * and a react-aria button so click/Enter/Space all copy it.
 *
 * Always meters: that is KSA's native unit and, by design, this app exposes no
 * unit / orientation / precision options — just the one toggle.
 */
export function MeasurementReadout() {
  const show = useStore($measurements);
  const bounds = useStore($partBounds);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  // Only cleanup — a pending flash must not fire into an unmounted component.
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  if (!show || !bounds) return null;

  // What lands on the clipboard: the plain `x × y × z m` line, no arrow glyphs.
  const text = formatVec(bounds.size, 'm');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Blocked (an iframe without `allow="clipboard-write"`, or an insecure
      // context). Nothing to recover — just don't claim it worked.
      return;
    }
    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  const CopyIcon = copied ? Check : Copy;

  return (
    // Bottom-CENTER, but ABOVE the bottom edge: the [−][+][⚙] bar is 28px tall at
    // bottom-2, so `bottom-2` would have put this underneath it at 200px wide.
    // `bottom-10` (40px) clears that bar and DownloadProgress's bar + "x of y MB"
    // label at the very bottom.
    <Button
      variant="ghost"
      size="sm"
      onPress={() => void copy()}
      aria-label={`Copy dimensions: ${text}`}
      className="absolute bottom-10 left-1/2 h-6 -translate-x-1/2 gap-1.5 px-1.5 text-[10px] tabular-nums text-fg-muted"
    >
      {AXES.map(({ key, Icon, label }) => (
        <span key={key} className="flex items-center gap-0.5">
          {/* Decorative: the accessible name above already spells the value out. */}
          <Icon size={9} color={AXIS_COLOR_CSS[key]} aria-hidden />
          <span title={label}>{formatLengthValue(bounds.size[key], 'm')}</span>
        </span>
      ))}
      <span className="text-fg-subtle">m</span>
      <CopyIcon size={10} className="text-fg-subtle" aria-hidden />
    </Button>
  );
}
