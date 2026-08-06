import { useStore } from '@nanostores/react';
import { SectionTitle, Switch } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import {
  $connectorSettings,
  $ivaSeatSettings,
  $lightSettings,
  DEFAULT_LIGHT_SETTINGS,
  setConnectorSettings,
  setIvaSeatSettings,
  setLightSettings,
} from '../../state/settingsStore';
import { $colliderSettings, setColliderSettings } from '../../state/colliderStore';
import { $grids, setGrid, type Axis } from '../../state/viewStore';

/**
 * **Settings ▸ Viewport** (design: foundation §10.7).
 *
 * Sizes and fit options for everything the viewport DRAWS but never exports: grid spacing,
 * connector size, seat markers, light markers and the collider fit defaults. Two of these
 * close long-standing UI gaps — `$lightSettings.markerSize` and the `$colliderSettings`
 * fit knobs existed in their stores with no editor anywhere, which is why the light and
 * collider panels' "→ Settings" captions used to point at nothing.
 *
 * Every field is a persisted preference. ZERO undo participation — view state, not document
 * state. Numerics are `PreciseNumberInput` (`useNumberDraft` + `inputMode="url"`).
 */
const GRID_AXES: { axis: Axis; label: string }[] = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' },
];

export function ViewportSettings() {
  const grids = useStore($grids);
  const connectors = useStore($connectorSettings);
  const ivaSeats = useStore($ivaSeatSettings);
  // Resolved read: a settings object persisted before these fields existed must show its
  // defaults, not blanks (see lightSettings()'s JSDoc).
  const lights = { ...DEFAULT_LIGHT_SETTINGS, ...useStore($lightSettings) };
  const colliders = useStore($colliderSettings);

  return (
    <>
      <SectionTitle>Grid</SectionTitle>
      {GRID_AXES.map(({ axis, label }) => (
        <MeterRow
          key={axis}
          label={`${label} grid spacing`}
          min={0.05}
          value={grids[axis].spacing}
          onCommit={(spacing) => setGrid(axis, { spacing })}
        />
      ))}
      <span className="text-xs text-fg-subtle">
        The per-axis show/hide switches stay in View ▸ Grids.
      </span>

      <SectionTitle>Connectors</SectionTitle>
      <MeterRow
        label="Connector size"
        min={0.01}
        value={connectors.size}
        onCommit={(size) => setConnectorSettings({ size })}
      />

      <SectionTitle>IVA seats</SectionTitle>
      <MeterRow
        label="Seat marker size"
        min={0.01}
        value={ivaSeats.markerSize}
        onCommit={(markerSize) => setIvaSeatSettings({ markerSize })}
      />
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Show gaze cone</span>
        <Switch
          aria-label="Show IVA seat gaze cone"
          isSelected={ivaSeats.showGazeCone}
          onChange={(showGazeCone) => setIvaSeatSettings({ showGazeCone })}
        />
      </label>
      <span className="text-xs text-fg-subtle">
        The gaze cone is indicative only — it shows roughly where a seat looks. In game the view is
        clamped to a 90° hemisphere around the seat's forward axis, so you can look anywhere ahead
        of the seat but never behind it.
      </span>

      <SectionTitle>Lights</SectionTitle>
      <MeterRow
        label="Light marker size"
        min={0.01}
        value={lights.markerSize}
        onCommit={(markerSize) => setLightSettings({ markerSize })}
      />

      <SectionTitle>Collider fit</SectionTitle>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Fit margin</span>
        <div className="flex items-center gap-1">
          <PreciseNumberInput
            aria-label="Collider fit margin (fraction)"
            className="w-40"
            step={0.005}
            value={colliders.margin}
            onCommit={(margin) => setColliderSettings({ margin })}
          />
          <span className="text-xs text-fg-subtle">×</span>
        </div>
      </label>
      <span className="text-xs text-fg-subtle">
        Fractional inset (negative) or outset (positive) applied to every fitted dimension — Core
        habitually shaves ~0.7% (−0.007) off a mesh bounding box.
      </span>
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm text-fg-muted">Orient fit to selection</span>
        <Switch
          aria-label="Orient collider fit to the selection"
          isSelected={colliders.orientToSelection}
          onChange={(orientToSelection) => setColliderSettings({ orientToSelection })}
        />
      </label>
      <span className="text-xs text-fg-subtle">
        On, a fitted collider takes the last-selected placement's rotation, so a tilted tank gets a
        tilted cylinder; off, every fit is world-aligned.
      </span>
    </>
  );
}

/** A labelled metre-valued numeric row (the shape every size field in this tab takes). */
function MeterRow({
  label,
  min,
  value,
  onCommit,
}: {
  label: string;
  min: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-fg-muted">{label}</span>
      <div className="flex items-center gap-1">
        <PreciseNumberInput
          aria-label={`${label} (m)`}
          className="w-40"
          min={min}
          value={value}
          onCommit={onCommit}
        />
        <span className="text-xs text-fg-subtle">m</span>
      </div>
    </label>
  );
}
