import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react';
import type { Vec3 } from '../../ksa/types';
import {
  $chainSession,
  moveChainOp,
  moveChainOpTo,
  removeChainOp,
  updateChainOp,
  type ChainAxis,
  type ChainOp,
  type ChainPivotMode,
  type ChainPlane,
  type GridArrayOp,
  type LinearArrayOp,
  type RadialArrayOp,
  type RotateOp,
  type ScaleOp,
  type TranslateOp,
} from '../../state/chainStore';
import { Button, Checkbox, ListBoxItem, Select, cn } from '../kit';
import { PreciseNumberInput } from '../PreciseNumberInput';
import { Vec3Field } from '../Vec3Field';
import { CHAIN_COMMANDS } from './chainCommands';

/**
 * One step of the chain: its icon/label, reorder + remove controls, and the parameter
 * form for its kind.
 *
 * Every field writes straight through {@link updateChainOp}, which clamps and stores the
 * value as the kind's next default — the card holds NO local state, so it re-renders
 * purely from the `op` prop and can never drift from the session.
 *
 * Deliberately no `onInteractionStart` on any input: editing a chain step mutates
 * ephemeral session state, not the document, so there is nothing to enroll in undo. The
 * single undo entry is pushed once, by Apply.
 */
/**
 * Drag payload for step reorder. Native HTML5 DnD, matching the Outliner's layer and entity
 * grips (see the DND note in `LayerHeaderRow.tsx`): react-aria's `useDragAndDrop` wants to
 * own the whole collection, and these cards are forms, not a collection.
 */
const DND_CHAIN_STEP = 'application/x-flexo-chain-step';

export function ChainStepCard({
  op,
  index,
  total,
  reorderable = false,
}: {
  op: ChainOp;
  index: number;
  total: number;
  /** Adds the ⠿ drag-reorder grip. Off on touch — the ▲▼ chevrons are the phone path. */
  reorderable?: boolean;
}) {
  const [dropHint, setDropHint] = useState<'before' | 'after' | null>(null);
  // Every kind has a command entry; the fallback exists only to satisfy the type.
  const command = CHAIN_COMMANDS.find((c) => c.kind === op.kind) ?? CHAIN_COMMANDS[0];
  const Icon = command.icon;

  const onDragOver = (e: React.DragEvent) => {
    if (!reorderable || !e.dataTransfer.types.includes(DND_CHAIN_STEP)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = e.currentTarget.getBoundingClientRect();
    setDropHint(e.clientY < box.top + box.height / 2 ? 'before' : 'after');
  };

  const onDrop = (e: React.DragEvent) => {
    const hint = dropHint;
    setDropHint(null);
    const draggedId = e.dataTransfer.getData(DND_CHAIN_STEP);
    if (!draggedId || draggedId === op.id) return;
    e.preventDefault();
    const ops = $chainSession.get()?.ops ?? [];
    const from = ops.findIndex((o) => o.id === draggedId);
    if (from < 0) return;
    // `moveChainOpTo` splices the step OUT first, so the destination index is measured in
    // the list without it: everything after the source shifts down by one.
    const targetInRest = index < from ? index : index - 1;
    moveChainOpTo(draggedId, targetInRest + (hint === 'after' ? 1 : 0));
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border border-border bg-panel-sunken p-2',
        dropHint === 'before' && 'shadow-[inset_0_2px_0_0_var(--color-accent)]',
        dropHint === 'after' && 'shadow-[inset_0_-2px_0_0_var(--color-accent)]',
      )}
      onDragOver={onDragOver}
      onDragLeave={() => setDropHint(null)}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-1.5">
        {reorderable && (
          <span
            draggable
            aria-hidden
            title="Drag to reorder"
            className="-my-1 shrink-0 cursor-grab py-1 text-fg-subtle active:cursor-grabbing"
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_CHAIN_STEP, op.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setDropHint(null)}
          >
            <GripVertical size={14} />
          </span>
        )}
        <Icon size={14} className="shrink-0 text-fg-subtle" />
        <span className="text-xs font-medium">{command.label}</span>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label="Move step up"
          isDisabled={index === 0}
          onPress={() => moveChainOp(op.id, -1)}
        >
          <ChevronUp size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label="Move step down"
          isDisabled={index === total - 1}
          onPress={() => moveChainOp(op.id, 1)}
        >
          <ChevronDown size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label="Remove step"
          onPress={() => removeChainOp(op.id)}
        >
          <X size={14} />
        </Button>
      </div>
      <StepParameters op={op} />
    </div>
  );
}

/**
 * Field bounds mirroring the clamps in `chainStore` — the store is the authority, these
 * only keep the input from committing a value it would silently correct, and set the
 * arrow-key step to the unit the parameter is actually authored in (0.1 m, 15°, ×0.1).
 */
const DISTANCE = { min: -10000, max: 10000, step: 0.1 };
const ANGLE = { min: -360, max: 360, step: 15 };
const FACTOR = { min: 0.01, max: 100, step: 0.1 };
const LINEAR_COUNT = { min: 2, max: 500, step: 1 };
const RADIAL_COUNT = { min: 2, max: 360, step: 1 };
const GRID_COUNT = { min: 1, max: 500, step: 1 };

/** Immutably replaces one axis of a vector parameter (never mutates the op's value). */
function withAxis(vec: Vec3, axis: keyof Vec3, value: number): Vec3 {
  return { ...vec, [axis]: value };
}

function StepParameters({ op }: { op: ChainOp }) {
  switch (op.kind) {
    case 'translate':
      return <TranslateRows op={op} />;
    case 'rotate':
      return <RotateRows op={op} />;
    case 'scale':
      return <ScaleRows op={op} />;
    case 'linear-array':
      return <LinearArrayRows op={op} />;
    case 'radial-array':
      return <RadialArrayRows op={op} />;
    case 'grid-array':
      return <GridArrayRows op={op} />;
  }
}

/** Label + single numeric input, column-aligned with {@link Vec3Field}'s `w-20` labels. */
function ScalarRow({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs text-fg-muted">{label}</span>
      <PreciseNumberInput
        aria-label={label}
        className="min-w-0 flex-1"
        value={value}
        min={min}
        max={max}
        step={step}
        onCommit={onCommit}
      />
    </div>
  );
}

/** Label + dropdown, same column geometry as {@link ScalarRow}. */
function SelectRow({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (key: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-20 shrink-0 text-xs text-fg-muted">{label}</span>
      <Select
        size="sm"
        aria-label={label}
        className="min-w-0 flex-1"
        value={value}
        onChange={(key) => onChange(String(key))}
      >
        {children}
      </Select>
    </div>
  );
}

/** Pivot dropdown + the custom-center vector it reveals (shared by Rotate and Scale). */
function PivotRows({ op }: { op: RotateOp | ScaleOp }) {
  return (
    <>
      <SelectRow
        label="Pivot"
        value={op.pivot}
        onChange={(key) => updateChainOp(op.id, { pivot: key as ChainPivotMode })}
      >
        <ListBoxItem id="centroid">Centroid</ListBoxItem>
        <ListBoxItem id="origin">Part origin</ListBoxItem>
        <ListBoxItem id="custom">Custom</ListBoxItem>
      </SelectRow>
      {op.pivot === 'custom' && (
        <Vec3Field
          label="Center (m)"
          labelWidth="w-20"
          value={op.center}
          {...DISTANCE}
          onCommit={(axis, v) => updateChainOp(op.id, { center: withAxis(op.center, axis, v) })}
        />
      )}
    </>
  );
}

function TranslateRows({ op }: { op: TranslateOp }) {
  return (
    <Vec3Field
      label="Move (m)"
      labelWidth="w-20"
      value={op.delta}
      {...DISTANCE}
      onCommit={(axis, v) => updateChainOp(op.id, { delta: withAxis(op.delta, axis, v) })}
    />
  );
}

function RotateRows({ op }: { op: RotateOp }) {
  return (
    <>
      <Vec3Field
        label="Rotate (°)"
        labelWidth="w-20"
        value={op.degreesDeg}
        {...ANGLE}
        onCommit={(axis, v) =>
          updateChainOp(op.id, { degreesDeg: withAxis(op.degreesDeg, axis, v) })
        }
      />
      <PivotRows op={op} />
    </>
  );
}

function ScaleRows({ op }: { op: ScaleOp }) {
  return (
    <>
      <Vec3Field
        label="Factor (×)"
        labelWidth="w-20"
        value={op.factor}
        {...FACTOR}
        onCommit={(axis, v) => updateChainOp(op.id, { factor: withAxis(op.factor, axis, v) })}
      />
      <SelectRow
        label="Mode"
        value={op.mode}
        onChange={(key) => updateChainOp(op.id, { mode: key === 'inPlace' ? 'inPlace' : 'smart' })}
      >
        <ListBoxItem id="smart">Smart (scale positions too)</ListBoxItem>
        <ListBoxItem id="inPlace">In place</ListBoxItem>
      </SelectRow>
      {/* In-place scaling grows each member where it stands — there is no pivot to pick. */}
      {op.mode === 'smart' && <PivotRows op={op} />}
    </>
  );
}

function LinearArrayRows({ op }: { op: LinearArrayOp }) {
  return (
    <>
      <ScalarRow
        label="Count"
        value={op.count}
        {...LINEAR_COUNT}
        onCommit={(n) => updateChainOp(op.id, { count: n })}
      />
      <Vec3Field
        label="Offset/step (m)"
        labelWidth="w-20"
        value={op.offset}
        {...DISTANCE}
        onCommit={(axis, v) => updateChainOp(op.id, { offset: withAxis(op.offset, axis, v) })}
      />
      <Vec3Field
        label="Rotate/step (°)"
        labelWidth="w-20"
        value={op.stepRotateDeg}
        {...ANGLE}
        onCommit={(axis, v) =>
          updateChainOp(op.id, { stepRotateDeg: withAxis(op.stepRotateDeg, axis, v) })
        }
      />
      <Vec3Field
        label="Scale/step (×)"
        labelWidth="w-20"
        value={op.stepScale}
        {...FACTOR}
        onCommit={(axis, v) => updateChainOp(op.id, { stepScale: withAxis(op.stepScale, axis, v) })}
      />
    </>
  );
}

function RadialArrayRows({ op }: { op: RadialArrayOp }) {
  return (
    <>
      <ScalarRow
        label="Count"
        value={op.count}
        {...RADIAL_COUNT}
        onCommit={(n) => updateChainOp(op.id, { count: n })}
      />
      <SelectRow
        label="Axis"
        value={op.axis}
        onChange={(key) => updateChainOp(op.id, { axis: key as ChainAxis })}
      >
        <ListBoxItem id="x">X (part nose)</ListBoxItem>
        <ListBoxItem id="y">Y (world up)</ListBoxItem>
        <ListBoxItem id="z">Z</ListBoxItem>
      </SelectRow>
      <Vec3Field
        label="Center (m)"
        labelWidth="w-20"
        value={op.center}
        {...DISTANCE}
        onCommit={(axis, v) => updateChainOp(op.id, { center: withAxis(op.center, axis, v) })}
      />
      <ScalarRow
        label="Start (°)"
        value={op.startAngleDeg}
        {...ANGLE}
        onCommit={(n) => updateChainOp(op.id, { startAngleDeg: n })}
      />
      <ScalarRow
        label="Sweep (°)"
        value={op.sweepDeg}
        {...ANGLE}
        onCommit={(n) => updateChainOp(op.id, { sweepDeg: n })}
      />
      <SelectRow
        label="Orient"
        value={op.orient}
        onChange={(key) => updateChainOp(op.id, { orient: key === 'keep' ? 'keep' : 'rotate' })}
      >
        <ListBoxItem id="rotate">Rotate with array</ListBoxItem>
        <ListBoxItem id="keep">Keep orientation</ListBoxItem>
      </SelectRow>
      <ScalarRow
        label="Radial offset (m)"
        value={op.radialOffset}
        {...DISTANCE}
        onCommit={(n) => updateChainOp(op.id, { radialOffset: n })}
      />
      <ScalarRow
        label="Rise/step (m)"
        value={op.axialStep}
        {...DISTANCE}
        onCommit={(n) => updateChainOp(op.id, { axialStep: n })}
      />
    </>
  );
}

function GridArrayRows({ op }: { op: GridArrayOp }) {
  return (
    <>
      <SelectRow
        label="Plane"
        value={op.plane}
        onChange={(key) => updateChainOp(op.id, { plane: key as ChainPlane })}
      >
        <ListBoxItem id="xy">XY</ListBoxItem>
        <ListBoxItem id="xz">XZ</ListBoxItem>
        <ListBoxItem id="yz">YZ</ListBoxItem>
      </SelectRow>
      <div className="flex items-center gap-1.5">
        <span className="w-20 shrink-0 text-xs text-fg-muted">Count A × B</span>
        <PreciseNumberInput
          aria-label="Count A"
          className="min-w-0 flex-1"
          value={op.countA}
          {...GRID_COUNT}
          onCommit={(n) => updateChainOp(op.id, { countA: n })}
        />
        <PreciseNumberInput
          aria-label="Count B"
          className="min-w-0 flex-1"
          value={op.countB}
          {...GRID_COUNT}
          onCommit={(n) => updateChainOp(op.id, { countB: n })}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-20 shrink-0 text-xs text-fg-muted">Spacing (m)</span>
        <PreciseNumberInput
          aria-label="Spacing A"
          className="min-w-0 flex-1"
          value={op.spacingA}
          {...DISTANCE}
          onCommit={(n) => updateChainOp(op.id, { spacingA: n })}
        />
        <PreciseNumberInput
          aria-label="Spacing B"
          className="min-w-0 flex-1"
          value={op.spacingB}
          {...DISTANCE}
          onCommit={(n) => updateChainOp(op.id, { spacingB: n })}
        />
      </div>
      <Checkbox
        className="text-xs"
        isSelected={op.centered}
        onChange={(on) => updateChainOp(op.id, { centered: on })}
      >
        Center on seed
      </Checkbox>
    </>
  );
}
