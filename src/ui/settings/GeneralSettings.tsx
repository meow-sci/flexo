import { useStore } from '@nanostores/react';
import { ColorField, SectionTitle, Switch } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import {
  $confirmThreshold,
  $selectionHighlight,
  $showFpsCounter,
  setConfirmThreshold,
  setSelectionHighlight,
  setShowFpsCounter,
} from '../../state/settingsStore';

/**
 * **Settings ▸ General** (design: foundation §10.7 — the tab table IS the spec).
 *
 * Selection-highlight appearance, the one confirm-before-destroy threshold, and the FPS
 * counter mirror. Every field is a persisted preference with ZERO undo participation.
 *
 * The highlight rows are the v1 `<input type="color">` pair rebuilt on the kit `ColorField`
 * with its alpha channel — which closes the system-services §7.7 TODO and makes the tint's
 * STRENGTH the swatch's own opacity instead of a slider beside it. The store keeps colour and
 * alpha apart (the three.js layer parses them separately), so the field's `#rrggbbaa` is
 * split on the way in and rejoined on the way out.
 */
export function GeneralSettings() {
  const highlight = useStore($selectionHighlight);
  const threshold = useStore($confirmThreshold);
  const showFps = useStore($showFpsCounter);

  return (
    <>
      <SectionTitle>Selection highlight</SectionTitle>
      <HighlightRow
        label="Meshes"
        color={highlight.meshColor}
        alpha={highlight.meshAlpha}
        onChange={(meshColor, meshAlpha) => setSelectionHighlight({ meshColor, meshAlpha })}
      />
      <HighlightRow
        label="Kittens"
        color={highlight.kittenColor}
        alpha={highlight.kittenAlpha}
        onChange={(kittenColor, kittenAlpha) => setSelectionHighlight({ kittenColor, kittenAlpha })}
      />

      <SectionTitle>Confirmations</SectionTitle>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Skip the confirm up to</span>
        <div className="flex items-center gap-1">
          <PreciseNumberInput
            aria-label="Confirm threshold (entities)"
            className="w-40"
            min={1}
            step={1}
            value={threshold}
            onCommit={setConfirmThreshold}
          />
          <span className="text-xs text-fg-subtle">entities</span>
        </div>
      </label>
      <span className="text-xs text-fg-subtle">
        Deletes of up to this many entities skip the confirm and offer status-bar Undo.
      </span>

      <SectionTitle>Viewport overlay</SectionTitle>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">FPS counter</span>
        <Switch aria-label="Show FPS counter" isSelected={showFps} onChange={setShowFpsCounter} />
      </label>
      <span className="text-xs text-fg-subtle">
        The same setting as View ▸ FPS Counter. The counter is the editor’s only continuously
        rendering mode.
      </span>
    </>
  );
}

/** `#rrggbb` + 0–1 alpha ⇄ the ColorField's single `#rrggbbaa` value. */
function HighlightRow({
  label,
  color,
  alpha,
  onChange,
}: {
  label: string;
  color: string;
  alpha: number;
  onChange: (color: string, alpha: number) => void;
}) {
  const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-fg-muted">{label}</span>
      <div className="flex items-center gap-2">
        <ColorField
          alpha
          aria-label={`${label} highlight color and strength`}
          value={`${color}${alphaHex}`}
          onChange={(hex) => {
            const rgb = hex.slice(0, 7);
            const parsed = hex.length >= 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
            onChange(rgb, Number.isFinite(parsed) ? parsed : 1);
          }}
        />
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-fg-subtle">
          {Math.round(alpha * 100)}%
        </span>
      </div>
    </div>
  );
}
