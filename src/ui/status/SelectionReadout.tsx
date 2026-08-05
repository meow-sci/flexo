import { useStore } from '@nanostores/react';
import { Tooltip } from '../kit';
import { StatusChipButton, StatusDivider } from './StatusChip';
import {
  $measurementSettings,
  $selectionBounds,
  setMeasurementSettings,
} from '../../state/measurementStore';
import type { EntityKind } from '../../state/editorStore';
import { $selectionByKind } from '../../state/selectors';
import { formatLength, formatVec } from '../../measure/format';

/**
 * Status-bar segment 4 — the **selection readout** (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.2 #4; foundation §5). Absorbs v1's
 * `MeasurementInfo`, the bottom-left floating card that overlapped the floating inspector's
 * default anchor.
 *
 * `3 SubParts · 1 Light │ 2.400 × 1.100 × 0.850 m ⬚`
 *
 * Two behavior deltas from v1, both design-mandated (§1.5):
 * - The whole chip is now a BUTTON: clicking toggles world ⇄ oriented bounds. v1's badge
 *   was passive, so the only way to switch was the View ▸ Measurement Overlays radio.
 * - The diagonal moves into the tooltip — it is reference data, not posture.
 *
 * The readout does NOT obey the "show bounding box" overlay switch (§1.2 #4, explicit): the
 * 3D box obeys it, this is a readout. `$selectionBounds` is written by `MeasurementLayer`
 * on every selection change regardless of that switch, which is what makes that possible.
 *
 * Undo enrollment: NONE — `boundsMode` is persisted VIEW state (`flexo:measure`, the same
 * store the View menu's radio writes), so the two can never disagree (§1.6).
 */

/** Singular / plural label per selectable kind, in the order they read best. */
const KIND_LABELS: [kind: EntityKind, singular: string, plural: string][] = [
  ['subpart', 'SubPart', 'SubParts'],
  ['connector', 'Connector', 'Connectors'],
  ['collider', 'Collider', 'Colliders'],
  ['ivaSeat', 'IVA Seat', 'IVA Seats'],
  ['light', 'Light', 'Lights'],
  ['kitten', 'Kitten', 'Kittens'],
];

/**
 * `3 SubParts · 1 Light`, or `5 items` once more than two kinds are involved — past that
 * the enumeration is longer than the bar and says less than the total (§1.2 #4).
 */
function countsLabel(counts: number[]): string {
  const present = counts.flatMap((count, i) =>
    count > 0 ? [`${count} ${KIND_LABELS[i][count === 1 ? 1 : 2]}`] : [],
  );
  if (present.length === 0) return '';
  if (present.length > 2) {
    const total = counts.reduce((sum, count) => sum + count, 0);
    return `${total} items`;
  }
  return present.join(' · ');
}

export function SelectionReadout() {
  const byKind = useStore($selectionByKind);
  const bounds = useStore($selectionBounds);
  const { unit } = useStore($measurementSettings);

  const counts = KIND_LABELS.map(([kind]) => byKind[kind].length);
  const label = countsLabel(counts);

  // Both conditions, per §1.1's "shown when" row: an empty selection has nothing to count,
  // and a selection whose bounds have not been computed yet has nothing to measure.
  if (label === '' || !bounds) return null;

  const { size, mode } = bounds;
  const diagonal = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z);
  const oriented = mode === 'oriented';
  const next = oriented ? 'world' : 'oriented';

  return (
    <>
      <StatusDivider />
      <Tooltip
        content={
          <div className="flex flex-col gap-0.5">
            <span>Width {formatLength(size.x, unit)}</span>
            <span>Height {formatLength(size.y, unit)}</span>
            <span>Depth {formatLength(size.z, unit)}</span>
            <span>Diagonal {formatLength(diagonal, unit)}</span>
            <span className="text-fg-subtle">
              {oriented
                ? 'Oriented bounds — click for world-aligned'
                : 'World-aligned bounds — click for oriented'}
            </span>
          </div>
        }
      >
        <StatusChipButton
          aria-label={`Selection: ${label}, ${formatVec(size, unit)}, ${mode} bounds. Click to switch to ${next} bounds.`}
          onPress={() => setMeasurementSettings({ boundsMode: next })}
        >
          <span className="flex-none text-fg">{label}</span>
          {/* Dims drop before counts under pressure (§1.1 overflow column) — the counts
              stay `flex-none` and this truncates. */}
          <span className="min-w-0 truncate font-mono tabular-nums">{formatVec(size, unit)}</span>
          <span aria-hidden="true" className="flex-none text-fg-subtle">
            {oriented ? '◇' : '⬚'}
          </span>
        </StatusChipButton>
      </Tooltip>
    </>
  );
}
