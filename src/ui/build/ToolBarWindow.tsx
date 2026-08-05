import { useStore } from '@nanostores/react';
import { ChevronDown, Magnet, Move3d, RotateCw, Scale3d, type LucideIcon } from 'lucide-react';
import {
  Button,
  DialogTrigger,
  FloatingWindow,
  Label,
  Popover,
  PopoverDialog,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  keyLabel,
} from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import {
  $gizmoSpace,
  setToolMode,
  toggleGizmoSpace,
  type GizmoSpace,
  type ToolMode,
} from '../../state/editorStore';
import { $effectiveToolMode, $isExhaustPlacing } from '../../state/engineStore';
import { $isPoseEditing } from '../../state/animationStore';
import { $hasSelection } from '../../state/selectors';
import {
  $snapEnabled,
  $snapRotateStep,
  $snapTranslateStep,
  setSnapRotateStep,
  setSnapTranslateStep,
  toggleSnap,
} from '../../state/snapStore';

/**
 * The **Tool bar** — one of exactly two floating windows v2 ships (foundation §6.2;
 * design-build-mode.md §4.1). It carries the gizmo's *parameters* and nothing else:
 * Move/Rotate/Scale, the W/L space toggle, and the snap magnet with its step popover.
 *
 * Selection ACTIONS (Duplicate / Chain / Delete) are deliberately absent — Law 1 puts them
 * in the left sidebar and the Edit menu. That is the difference between this and v1's
 * `SelectionToolbar`, which mixed both.
 *
 * Shown whenever a gizmo target exists: a selection, a joint being posed, or an exhaust
 * being placed. `FloatingWindow` owns dragging, clamping, z-order, the persisted position
 * (`flexo:layout` → `float.toolbar`) and the Window ▸ Tool Bar hide toggle; the phone
 * variant is a docked strip, so nothing renders here below 640px.
 *
 * **Undo enrollment: NONE.** Tool mode, gizmo space and snap are all view/tool state.
 */

const TOOLS: { mode: ToolMode; label: string; Icon: LucideIcon }[] = [
  { mode: 'translate', label: 'Move', Icon: Move3d },
  { mode: 'rotate', label: 'Rotate', Icon: RotateCw },
  { mode: 'scale', label: 'Scale', Icon: Scale3d },
];

const SPACES: { space: GizmoSpace; short: string; label: string }[] = [
  { space: 'world', short: 'W', label: 'World axes' },
  { space: 'local', short: 'L', label: "The entity's own axes" },
];

export function ToolBarWindow() {
  const hasSelection = useStore($hasSelection);
  const isPoseEditing = useStore($isPoseEditing);
  const isExhaustPlacing = useStore($isExhaustPlacing);
  // $effectiveToolMode, never $toolMode: exhaust placement clamps Scale→Move, and the
  // switcher must show the tool the gizmo is ACTUALLY in (v1 SelectionToolbar rule).
  const mode = useStore($effectiveToolMode);
  const space = useStore($gizmoSpace);
  const snapEnabled = useStore($snapEnabled);

  if (!hasSelection && !isPoseEditing && !isExhaustPlacing) return null;

  return (
    <FloatingWindow
      id="toolbar"
      title="Tool bar"
      titleHidden
      defaultAnchor={{ h: 'center', v: 'top', dx: 0, dy: 8 }}
      minSize={{ w: 268, h: 30 }}
    >
      <div className="flex items-center gap-1 px-1 pb-1">
        <ToggleButtonGroup
          size="xs"
          className="w-auto"
          aria-label="Transform tool"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[mode]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next) setToolMode(next as ToolMode);
          }}
        >
          {TOOLS.map(({ mode: id, label, Icon }) => (
            <ToggleButton
              key={id}
              id={id}
              size="xs"
              // A nozzle placement is a point plus a direction — nothing to scale.
              isDisabled={isExhaustPlacing && id === 'scale'}
            >
              <Icon size={12} />
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Tooltip content={`Gizmo handles: ${space === 'world' ? 'world' : 'local'} axes`}>
          <ToggleButtonGroup
            size="xs"
            className="w-auto"
            aria-label="Gizmo space"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[space]}
            onSelectionChange={(keys) => {
              const next = [...keys][0] as GizmoSpace | undefined;
              if (next && next !== space) toggleGizmoSpace();
            }}
          >
            {SPACES.map(({ space: id, short, label }) => (
              <ToggleButton key={id} id={id} size="xs" aria-label={label}>
                {short}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Tooltip>

        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />

        <Tooltip content={<SnapHint />}>
          <ToggleButton
            size="xs"
            className="flex-none px-1.5"
            aria-label="Snap while dragging"
            isSelected={snapEnabled}
            onChange={() => toggleSnap()}
          >
            <Magnet size={12} />
          </ToggleButton>
        </Tooltip>

        <DialogTrigger>
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-5 shrink-0"
            aria-label="Snap steps"
          >
            <ChevronDown size={12} />
          </Button>
          <Popover placement="bottom end">
            {/* A component the Popover MOUNTS, so its store reads re-run on every open
                instead of being frozen into one render by React Compiler. */}
            <SnapStepsBody />
          </Popover>
        </DialogTrigger>
      </div>
    </FloatingWindow>
  );
}

function SnapHint() {
  return (
    <span>
      Snap while dragging — hold {keyLabel('ctrl')} during a drag for the temporary opposite
    </span>
  );
}

function SnapStepsBody() {
  const translate = useStore($snapTranslateStep);
  const rotate = useStore($snapRotateStep);

  return (
    <PopoverDialog className="flex w-56 flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <Label className="flex-1">Translate step</Label>
        <PreciseNumberInput
          aria-label="Translate snap step in metres"
          className="w-16"
          value={translate}
          min={0.001}
          step={0.05}
          onCommit={setSnapTranslateStep}
        />
        <span className="w-3 text-xs text-fg-subtle">m</span>
      </div>
      <div className="flex items-center gap-2">
        <Label className="flex-1">Rotate step</Label>
        <PreciseNumberInput
          aria-label="Rotate snap step in degrees"
          className="w-16"
          value={rotate}
          min={1}
          max={180}
          step={5}
          onCommit={setSnapRotateStep}
        />
        <span className="w-3 text-xs text-fg-subtle">°</span>
      </div>
      <p className="text-xs text-fg-subtle">
        Hold {keyLabel('ctrl')} while dragging for the temporary opposite.
      </p>
    </PopoverDialog>
  );
}
