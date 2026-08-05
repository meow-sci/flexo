import { useStore } from '@nanostores/react';
import { Magnet } from 'lucide-react';
import { Kbd, keyLabel, Tooltip } from '../kit';
import { StatusChipButton, StatusDivider } from './StatusChip';
import {
  $snapEnabled,
  $snapRotateStep,
  $snapTranslateStep,
  toggleSnap,
} from '../../state/snapStore';
import { $mode } from '../../state/modeStore';
import { $hasSelection } from '../../state/selectors';

/**
 * Status-bar segment 9 — the **snap chip** (design: foundation §5 #9; design-build-mode.md
 * §4.1). The one segment of the design's eleven that Phase 3 deliberately left empty,
 * because snapping had no store to mirror until `snapStore` existed.
 *
 * It mirrors the Tool bar's magnet — same store, so the two can never disagree — and
 * clicking it toggles snapping. The tooltip carries the two step sizes and the ⌃ hold-invert,
 * which is otherwise an entirely invisible gesture.
 *
 * **Visibility** matches the rotate/nudge chips (segment 8): desktop only, and shown while
 * the mode is Build or Animation, or anything is selected — snapping only means something
 * when a gizmo drag is possible.
 *
 * Undo enrollment: NONE (persisted `flexo:snap*` prefs, never document state).
 */
export function SnapChip() {
  const mode = useStore($mode);
  const hasSelection = useStore($hasSelection);
  const enabled = useStore($snapEnabled);
  const translate = useStore($snapTranslateStep);
  const rotate = useStore($snapRotateStep);

  if (mode !== 'build' && mode !== 'animation' && !hasSelection) return null;

  return (
    <span className="hidden items-center min-[860px]:flex">
      <StatusDivider />
      <Tooltip
        content={
          <span className="flex items-center gap-1.5">
            <span>
              Snap {enabled ? 'on' : 'off'} — {translate} m · {rotate}°. Hold
            </span>
            <Kbd>{keyLabel('ctrl')}</Kbd>
            <span>while dragging for the temporary opposite.</span>
          </span>
        }
      >
        <StatusChipButton
          onPress={() => toggleSnap()}
          aria-label={`Snapping ${enabled ? 'on' : 'off'} — ${translate} metres, ${rotate} degrees. Click to toggle.`}
          className={enabled ? 'text-accent' : undefined}
        >
          <Magnet size={12} />
          <span>Snap</span>
        </StatusChipButton>
      </Tooltip>
    </span>
  );
}
