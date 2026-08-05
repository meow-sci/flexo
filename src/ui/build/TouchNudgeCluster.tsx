import { useStore } from '@nanostores/react';
import { Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { Button, SectionTitle, ToggleButton, ToggleButtonGroup } from '../kit';
import { AXIS_COLOR, type AxisKey } from '../status/axisColors';
import {
  $nudgeAxis,
  $nudgeStep,
  $rotateStep,
  decreaseRotateStep,
  decrementNudgeStep,
  increaseRotateStep,
  incrementNudgeStep,
  setNudgeAxis,
  type NudgeAxis,
} from '../../state/editorStore';
import { nudgeSelectionBy } from '../../three/nudgeSelection';
import { rotateSelectionBy } from '../../three/rotateSelection';
import { formatNudgeStep } from '../nudgeControls';

/**
 * The phone Inspector sheet's **touch nudge / rotate cluster** (design-build-mode.md §11
 * item 2; foundation §12 Sheet row). It closes the census's touch gap: v1's only precise
 * move was the arrow keys and its only quick rotate was `W`/`S`, neither of which exists on
 * a phone, so a touch user could nudge nothing.
 *
 * It is a second SURFACE for the keyboard's actions, not a second implementation: every
 * button calls the very function the chord does — `nudgeSelectionBy` / `rotateSelectionBy`
 * over `applySelectionTransform`, and the same axis/step store actions the status-bar chips
 * write. That is what keeps the undo semantics identical (one step per tap) and the locked
 * -layer refusal automatic.
 *
 * Desktop keeps the status-bar chips instead (they are keyboard posture readouts), so this
 * renders only where it is mounted: inside {@link TransformGroups} under `useIsPhone`.
 *
 * **Undo enrollment: per tap.** `applySelectionTransform` pushes one discrete step for each
 * nudge/rotate, exactly as the key press does.
 */

const AXES: NudgeAxis[] = ['x', 'y', 'z'];

export function TouchNudgeCluster({ locked }: { locked: boolean }) {
  const nudgeAxis = useStore($nudgeAxis);
  const nudgeStep = useStore($nudgeStep);
  const rotateStep = useStore($rotateStep);

  const rotate = (sign: 1 | -1) => {
    const amount = rotateStep * sign;
    rotateSelectionBy({
      x: nudgeAxis === 'x' ? amount : 0,
      y: nudgeAxis === 'y' ? amount : 0,
      z: nudgeAxis === 'z' ? amount : 0,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>Touch nudge / rotate</SectionTitle>

      <ToggleButtonGroup
        size="md"
        aria-label="Nudge and rotate axis"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[nudgeAxis]}
        onSelectionChange={(keys) => {
          const next = [...keys][0] as NudgeAxis | undefined;
          if (next) setNudgeAxis(next);
        }}
      >
        {AXES.map((axis) => (
          <ToggleButton key={axis} id={axis} size="md" className="min-h-11">
            <span style={{ color: AXIS_COLOR[axis as AxisKey] }}>{axis.toUpperCase()}</span>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <StepRow
        label={`Nudge · ${formatNudgeStep(nudgeStep)} m`}
        onStepDown={decrementNudgeStep}
        onStepUp={incrementNudgeStep}
      >
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11 flex-1"
          isDisabled={locked}
          aria-label={`Nudge ${nudgeAxis.toUpperCase()} negative`}
          onPress={() => nudgeSelectionBy(-1)}
        >
          <Minus className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11 flex-1"
          isDisabled={locked}
          aria-label={`Nudge ${nudgeAxis.toUpperCase()} positive`}
          onPress={() => nudgeSelectionBy(1)}
        >
          <Plus className="size-4" />
        </Button>
      </StepRow>

      <StepRow
        label={`Rotate · ${rotateStep}°`}
        onStepDown={decreaseRotateStep}
        onStepUp={increaseRotateStep}
      >
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11 flex-1"
          isDisabled={locked}
          aria-label={`Rotate ${nudgeAxis.toUpperCase()} counter-clockwise`}
          onPress={() => rotate(-1)}
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11 flex-1"
          isDisabled={locked}
          aria-label={`Rotate ${nudgeAxis.toUpperCase()} clockwise`}
          onPress={() => rotate(1)}
        >
          <RotateCw className="size-4" />
        </Button>
      </StepRow>
    </div>
  );
}

/** One `label · [−][+] step · [action][action]` row. */
function StepRow({
  label,
  onStepDown,
  onStepUp,
  children,
}: {
  label: string;
  onStepDown: () => void;
  onStepUp: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{label}</span>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-11"
          aria-label={`Decrease step for ${label}`}
          onPress={onStepDown}
        >
          <Minus className="size-3.5" />
        </Button>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-11"
          aria-label={`Increase step for ${label}`}
          onPress={onStepUp}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}
