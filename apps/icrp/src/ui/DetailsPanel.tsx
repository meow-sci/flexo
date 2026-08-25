/**
 * The LEFT details sidebar: selection transform in U/E/N vocabulary (Up is a
 * first-class control — plan P4.01's elevation field), align/distribute for
 * multi-select, arrays for single-select, and the object metres.
 */
import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { ArrowDownToLine, Layers } from 'lucide-react';
import { Button, ToggleButton } from '../../../../src/ui/kit';
import { NumberField } from '../../../../src/ui/NumberField';
import {
  $activeObject,
  $colliderSelection,
  $selection,
  addArrayCopies,
  beginGesture,
  duplicateColliderRef,
  endGesture,
  getCollider,
  getPlacement,
  removeCollider,
  setObjectMeters,
  setPlacementTransform,
  updateCollider,
} from '../state/docStore';
import { colliderSizeLabels, setColliderSizeAxis } from '../../../../src/ksa/colliderSize';
import type { ColliderShape } from '../../../../src/ksa/types';
import { $pieceIndex } from '../state/catalogStore';
import { gridArray, linearArray, radialArray } from '../three/arrays';
import { getScene } from '../three/sceneHandle';
import type { Transform } from '../ksa/types';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

/**
 * One U/E/N row over a KSA vector. KSA components: x = Up, y = East, z = North
 * (basis.ts) — the labels say what the numbers mean instead of leaking axes.
 */
function UenRow(props: {
  title: string;
  value: { x: number; y: number; z: number };
  step: number;
  /** Display transform per component (e.g. rad→deg); commit inverts it. */
  toDisplay?: (n: number) => number;
  fromDisplay?: (n: number) => number;
  onCommit: (axis: 'x' | 'y' | 'z', value: number) => void;
  onInteractionStart: () => void;
}) {
  const to = props.toDisplay ?? ((n) => n);
  const from = props.fromDisplay ?? ((n) => n);
  const fields: Array<{ axis: 'x' | 'y' | 'z'; label: string; aria: string }> = [
    { axis: 'x', label: 'U', aria: `${props.title} up` },
    { axis: 'y', label: 'E', aria: `${props.title} east` },
    { axis: 'z', label: 'N', aria: `${props.title} north` },
  ];
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{props.title}</span>
      <div className="flex items-center gap-1.5">
        {fields.map((f) => (
          <NumberField
            key={f.axis}
            label={f.label}
            ariaLabel={f.aria}
            value={to(props.value[f.axis])}
            step={props.step}
            onInteractionStart={props.onInteractionStart}
            onCommit={(v) => props.onCommit(f.axis, from(v))}
          />
        ))}
      </div>
    </div>
  );
}

function AlignPanel() {
  const axes: Array<{ axis: 'east' | 'north' | 'up'; label: string }> = [
    { axis: 'east', label: 'East' },
    { axis: 'north', label: 'North' },
    { axis: 'up', label: 'Up' },
  ];
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Align</div>
      {axes.map(({ axis, label }) => (
        <div key={axis} className="flex items-center gap-1">
          <span className="w-10 text-xs text-fg-muted">{label}</span>
          {(['min', 'center', 'max'] as const).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant="ghost"
              onPress={() => getScene()?.alignSelection(axis, mode)}
            >
              {mode}
            </Button>
          ))}
        </div>
      ))}
      <div className="flex items-center gap-1">
        <span className="w-10 text-xs text-fg-muted">Spread</span>
        <Button size="sm" variant="ghost" onPress={() => getScene()?.distributeSelection('east')}>
          east
        </Button>
        <Button size="sm" variant="ghost" onPress={() => getScene()?.distributeSelection('north')}>
          north
        </Button>
      </div>
    </div>
  );
}

function ArrayPanel({ instanceId }: { instanceId: string }) {
  const [kind, setKind] = useState<'linear' | 'radial' | 'grid'>('linear');
  const [count, setCount] = useState(4);
  const [dEast, setDEast] = useState(5);
  const [dNorth, setDNorth] = useState(0);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);

  const apply = () => {
    const seed = getPlacement(instanceId);
    if (!seed) return;
    const transforms =
      kind === 'linear'
        ? linearArray(seed.transform, count, { x: 0, y: dEast, z: dNorth })
        : kind === 'radial'
          ? radialArray(seed.transform, count, { y: 0, z: 0 })
          : gridArray(seed.transform, rows, cols, dEast || 5, dNorth || 5);
    addArrayCopies(instanceId, transforms);
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Array</div>
      <div className="flex items-center gap-1">
        {(['linear', 'radial', 'grid'] as const).map((k) => (
          <ToggleButton key={k} size="sm" isSelected={kind === k} onChange={() => setKind(k)}>
            {k}
          </ToggleButton>
        ))}
      </div>
      {kind !== 'grid' && (
        <NumberField
          label="N"
          ariaLabel="Total count"
          value={count}
          min={2}
          max={64}
          step={1}
          onCommit={(v) => setCount(Math.round(v))}
        />
      )}
      {kind === 'linear' && (
        <>
          <NumberField
            label="E"
            ariaLabel="East step (m)"
            value={dEast}
            step={0.5}
            onCommit={setDEast}
          />
          <NumberField
            label="N"
            ariaLabel="North step (m)"
            value={dNorth}
            step={0.5}
            onCommit={setDNorth}
          />
        </>
      )}
      {kind === 'radial' && (
        <div className="text-[11px] text-fg-subtle">
          Copies spin about the object origin (up axis); the seed's offset is the ring radius.
        </div>
      )}
      {kind === 'grid' && (
        <>
          <NumberField
            label="R"
            ariaLabel="Rows"
            value={rows}
            min={1}
            max={32}
            step={1}
            onCommit={(v) => setRows(Math.round(v))}
          />
          <NumberField
            label="C"
            ariaLabel="Columns"
            value={cols}
            min={1}
            max={32}
            step={1}
            onCommit={(v) => setCols(Math.round(v))}
          />
          <NumberField
            label="E"
            ariaLabel="East spacing (m)"
            value={dEast}
            step={0.5}
            onCommit={setDEast}
          />
          <NumberField
            label="N"
            ariaLabel="North spacing (m)"
            value={dNorth}
            step={0.5}
            onCommit={setDNorth}
          />
        </>
      )}
      <Button size="sm" onPress={apply}>
        Apply array
      </Button>
    </div>
  );
}

const SHAPES: ColliderShape[] = ['Box', 'Cylinder', 'Sphere', 'Capsule'];

function ColliderInspector() {
  const ref = useStore($colliderSelection);
  useStore($activeObject);
  if (!ref) return null;
  const collider = getCollider(ref);
  if (!collider) return null;
  const labels = colliderSizeLabels(collider.shape);
  const ownerLabel = ref.owner === null ? 'object level' : `on ${ref.owner}`;
  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {collider.shape} collider · {ownerLabel}
      </div>
      <UenRow
        title={ref.owner === null ? 'Position (m, object frame)' : 'Position (m, piece frame)'}
        value={collider.position}
        step={0.1}
        onInteractionStart={() => beginGesture('Edit collider position')}
        onCommit={(axis, v) =>
          updateCollider(ref, { position: { ...collider.position, [axis]: v } })
        }
      />
      <UenRow
        title="Rotation (°)"
        value={collider.rotation}
        step={5}
        toDisplay={(n) => n * RAD2DEG}
        fromDisplay={(n) => n * DEG2RAD}
        onInteractionStart={() => beginGesture('Edit collider rotation')}
        onCommit={(axis, v) =>
          updateCollider(ref, { rotation: { ...collider.rotation, [axis]: v } })
        }
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs text-fg-muted">Size (m) — the scale gizmo resizes too</span>
        <div className="flex items-center gap-1.5">
          {(['x', 'y', 'z'] as const).map((axis, i) =>
            labels[i] ? (
              <NumberField
                key={axis}
                label={labels[i]!.short}
                ariaLabel={`Collider ${labels[i]!.full}`}
                value={collider.scale[axis]}
                min={0.01}
                step={0.1}
                onInteractionStart={() => beginGesture('Resize collider')}
                onCommit={(v) =>
                  updateCollider(ref, {
                    scale: setColliderSizeAxis(collider.shape, collider.scale, axis, v),
                  })
                }
              />
            ) : null,
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onPress={() => duplicateColliderRef(ref)}>
          Duplicate
        </Button>
        <Button size="sm" variant="ghost" onPress={() => removeCollider(ref)}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/** Add/fit collider buttons for the current placement selection. */
function ColliderAuthoring() {
  const selection = useStore($selection);
  const obj = useStore($activeObject);
  const pieceIndex = useStore($pieceIndex);
  if (selection.length === 0) return null;
  let templateCount = 0;
  let ownCount = 0;
  for (const id of selection) {
    const pl = obj.placements.find((p) => p.instanceId === id);
    if (!pl) continue;
    templateCount += pieceIndex.get(pl.pieceId)?.colliders.length ?? 0;
    ownCount += pl.colliders?.length ?? 0;
  }
  return (
    <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Colliders · {templateCount} built-in · {ownCount} own
      </div>
      <div className="flex items-center gap-1">
        <span className="w-8 text-xs text-fg-muted">Add</span>
        {SHAPES.map((shape) => (
          <Button
            key={shape}
            size="sm"
            variant="ghost"
            aria-label={`Add ${shape} collider`}
            onPress={() => getScene()?.addManualCollider(shape)}
          >
            {shape === 'Cylinder' ? 'Cyl' : shape === 'Capsule' ? 'Cap' : shape}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="w-8 text-xs text-fg-muted">Fit</span>
        {SHAPES.map((shape) => (
          <Button
            key={shape}
            size="sm"
            variant="ghost"
            aria-label={`Fit ${shape} collider`}
            onPress={() => getScene()?.addFittedCollider(shape)}
          >
            {shape === 'Cylinder' ? 'Cyl' : shape === 'Capsule' ? 'Cap' : shape}
          </Button>
        ))}
      </div>
      <div className="text-[11px] text-fg-subtle">
        Fit wraps the selected pieces' geometry; the collider attaches to the first selected piece
        and follows it. Built-in (dimmed) colliders are Core's — scaling a piece bakes scaled copies
        automatically at export.
      </div>
    </div>
  );
}

function SelectionInspector() {
  const selection = useStore($selection);
  useStore($activeObject); // re-render on transform writes
  if (selection.length !== 1) {
    return (
      <div>
        <div className="px-3 py-2 text-sm text-fg-muted">
          {selection.length === 0 ? 'Nothing selected' : `${selection.length} selected`}
        </div>
        {selection.length >= 2 && (
          <>
            <div className="flex gap-1 px-3">
              <Button size="sm" variant="ghost" onPress={() => getScene()?.dropToGround(selection)}>
                <ArrowDownToLine size={12} /> Ground
              </Button>
              <Button size="sm" variant="ghost" onPress={() => getScene()?.restOnTop(selection)}>
                <Layers size={12} /> Rest on top
              </Button>
            </div>
            <AlignPanel />
          </>
        )}
      </div>
    );
  }
  const placement = getPlacement(selection[0]);
  if (!placement) return null;
  const t = placement.transform;
  const commit = (
    part: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    value: number,
  ) => {
    const next: Transform = { ...t, [part]: { ...t[part], [axis]: value } };
    setPlacementTransform(placement.instanceId, next);
  };
  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="truncate text-xs text-fg-muted" title={placement.instanceId}>
        {placement.pieceId}
      </div>
      <UenRow
        title="Position (m) — U is height above ground"
        value={t.position}
        step={0.1}
        onInteractionStart={() => beginGesture('Edit position')}
        onCommit={(axis, v) => commit('position', axis, v)}
      />
      <UenRow
        title="Rotation (°) — U spins on the ground"
        value={t.rotation}
        step={5}
        toDisplay={(n) => n * RAD2DEG}
        fromDisplay={(n) => n * DEG2RAD}
        onInteractionStart={() => beginGesture('Edit rotation')}
        onCommit={(axis, v) => commit('rotation', axis, v)}
      />
      <UenRow
        title="Scale — colliders never scale"
        value={t.scale}
        step={0.1}
        onInteractionStart={() => beginGesture('Edit scale')}
        onCommit={(axis, v) => commit('scale', axis, v)}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => getScene()?.dropToGround([placement.instanceId])}
        >
          <ArrowDownToLine size={12} /> Ground
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => getScene()?.restOnTop([placement.instanceId])}
        >
          <Layers size={12} /> Rest on top
        </Button>
      </div>
      <ArrayPanel instanceId={placement.instanceId} />
    </div>
  );
}

function ObjectInspector() {
  const obj = useStore($activeObject);
  const meters: Array<{
    key: 'groundOffsetM' | 'surfaceHeightM' | 'footprintRadiusM';
    label: string;
    aria: string;
    suggest?: () => number | null;
  }> = [
    { key: 'groundOffsetM', label: 'G', aria: 'Ground offset (m)' },
    {
      key: 'surfaceHeightM',
      label: 'S',
      aria: 'Surface height (m)',
      suggest: () => getScene()?.suggestSurfaceHeightM() ?? null,
    },
    {
      key: 'footprintRadiusM',
      label: 'F',
      aria: 'Footprint radius (m)',
      suggest: () => getScene()?.suggestFootprintRadiusM() ?? null,
    },
  ];
  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {obj.name} · {obj.placements.length} placements
      </div>
      {meters.map((m) => (
        <div key={m.key} className="flex items-center gap-1">
          <div className="flex-1">
            <NumberField
              label={m.label}
              ariaLabel={m.aria}
              value={obj[m.key] ?? 0}
              step={0.1}
              onInteractionStart={() => beginGesture(`Edit ${m.aria}`)}
              onCommit={(v) => setObjectMeters(m.key, v)}
            />
          </div>
          {m.suggest && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Auto ${m.aria}`}
              onPress={() => {
                const v = m.suggest!();
                if (v !== null) {
                  beginGesture(`Auto ${m.aria}`);
                  setObjectMeters(m.key, v);
                  endGesture();
                }
              }}
            >
              auto
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-1">
        <span className="text-xs text-fg-muted">
          Object colliders: {obj.objectColliders.length}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            $selection.set([]);
            getScene()?.addManualCollider('Box');
          }}
        >
          + Add
        </Button>
      </div>
      <div className="text-[11px] text-fg-subtle">
        Ground offset lifts the whole object; surface height is where vessels spawn; footprint
        radius gates the spawn bump + clutter clearing (max 4 pads/body).
      </div>
    </div>
  );
}

export function DetailsPanel() {
  return (
    <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-panel">
      <div className="px-3 pt-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Details
      </div>
      <ColliderInspector />
      <SelectionInspector />
      <ColliderAuthoring />
      <ObjectInspector />
    </div>
  );
}
