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
  cn,
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
 * (`flexo:layout` → `float.toolbar`) and the Window ▸ Tool Bar hide toggle; it renders
 * nothing below 640px, where {@link ToolBarStrip} is the docked phone variant.
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

  if (!hasSelection && !isPoseEditing && !isExhaustPlacing) return null;

  return (
    <FloatingWindow
      id="toolbar"
      title="Tool bar"
      titleHidden
      defaultAnchor={{ h: 'center', v: 'top', dx: 0, dy: 8 }}
      minSize={{ w: 268, h: 30 }}
    >
      <div className="px-1 pb-1">
        <ToolBarControls />
      </div>
    </FloatingWindow>
  );
}

/**
 * The phone variant (foundation §12 "Floating windows": Tool bar → pinned strip above the
 * CondensedStatusBar; design-build-mode.md §11 item 4). Same controls, same gate, same
 * store actions — it is a different HOST, not a different tool bar. Mounted by `app.tsx`
 * as a flex sibling of the condensed strip so it takes real layout instead of floating.
 */
export function ToolBarStrip() {
  const hasSelection = useStore($hasSelection);
  const isPoseEditing = useStore($isPoseEditing);
  const isExhaustPlacing = useStore($isExhaustPlacing);

  if (!hasSelection && !isPoseEditing && !isExhaustPlacing) return null;

  return (
    <div className="flex min-h-11 flex-none items-center border-t border-border bg-panel px-1">
      <ToolBarControls phone />
    </div>
  );
}

/**
 * Move/Rotate/Scale + the W/L gizmo space + the snap magnet and its step popover — the
 * Tool bar's entire contents, shared by both hosts.
 *
 * `phone` only changes the touch-target sizing (44px rows per foundation §14.4) and swaps
 * the hover tooltips out; every control is the same component writing the same store.
 */
function ToolBarControls({ phone = false }: { phone?: boolean }) {
  // $effectiveToolMode, never $toolMode: exhaust placement clamps Scale→Move, and the
  // switcher must show the tool the gizmo is ACTUALLY in (v1 SelectionToolbar rule).
  const mode = useStore($effectiveToolMode);
  const isExhaustPlacing = useStore($isExhaustPlacing);
  const space = useStore($gizmoSpace);
  const snapEnabled = useStore($snapEnabled);
  // The kit's ToggleButton scale is `md | xs`; `md` is the 36px touch size (§14.4).
  const size = phone ? ('md' as const) : ('xs' as const);
  const buttonSize = phone ? ('md' as const) : ('xs' as const);
  const touch = phone ? 'min-h-9' : undefined;

  const spaceGroup = (
    <ToggleButtonGroup
      size={size}
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
        <ToggleButton key={id} id={id} size={size} className={touch} aria-label={label}>
          {short}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );

  const snapToggle = (
    <ToggleButton
      size={size}
      className={cn('flex-none px-1.5', touch)}
      aria-label="Snap while dragging"
      isSelected={snapEnabled}
      onChange={() => toggleSnap()}
    >
      <Magnet size={phone ? 14 : 12} />
    </ToggleButton>
  );

  return (
    <div className="flex flex-1 items-center gap-1">
      <ToggleButtonGroup
        size={size}
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
            size={size}
            className={touch}
            // A nozzle placement is a point plus a direction — nothing to scale.
            isDisabled={isExhaustPlacing && id === 'scale'}
          >
            <Icon size={phone ? 14 : 12} />
            {!phone && label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {phone ? (
        spaceGroup
      ) : (
        <Tooltip content={`Gizmo handles: ${space === 'world' ? 'world' : 'local'} axes`}>
          {spaceGroup}
        </Tooltip>
      )}

      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />

      {phone ? snapToggle : <Tooltip content={<SnapHint />}>{snapToggle}</Tooltip>}

      <DialogTrigger>
        <Button
          iconOnly
          size={buttonSize}
          variant="ghost"
          className={cn('shrink-0', phone ? 'size-9' : 'size-5')}
          aria-label="Snap steps"
        >
          <ChevronDown size={phone ? 14 : 12} />
        </Button>
        {/* Popovers become sheets on phone inside the kit `Popover` (§12 dialog mapping),
            so the ▾ steps panel needs no phone fork of its own. */}
        <Popover placement="bottom end">
          {/* A component the Popover MOUNTS, so its store reads re-run on every open
              instead of being frozen into one render by React Compiler. */}
          <SnapStepsBody />
        </Popover>
      </DialogTrigger>
    </div>
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
