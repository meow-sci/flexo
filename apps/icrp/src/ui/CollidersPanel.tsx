/**
 * The LEFT sidebar in COLLIDERS mode: authoring (add a primitive at the
 * selection, or auto-fit one around the selected pieces' geometry) plus the
 * inspector for the selected collider. Split out of DetailsPanel when workspace
 * modes landed — collider editing is a mode, not a details footnote.
 */
import { useStore } from '@nanostores/react';
import { Button, Tooltip } from '../../../../src/ui/kit';
import { NumberField } from '../../../../src/ui/NumberField';
import {
  $activeObject,
  $colliderSelection,
  $selection,
  beginGesture,
  duplicateColliderRef,
  findCollider,
  removeCollider,
  updateCollider,
} from '../state/docStore';
import { colliderSizeLabels, setColliderSizeAxis } from '../../../../src/ksa/colliderSize';
import type { ColliderShape } from '../../../../src/ksa/types';
import { $pieceIndex } from '../state/catalogStore';
import { getScene } from '../three/sceneHandle';
import { DEG2RAD, RAD2DEG, UenRow } from './DetailsPanel';

const SHAPES: ColliderShape[] = ['Box', 'Cylinder', 'Sphere', 'Capsule'];

function shapeShort(shape: ColliderShape): string {
  return shape === 'Cylinder' ? 'Cyl' : shape === 'Capsule' ? 'Cap' : shape;
}

function ColliderInspector() {
  const ref = useStore($colliderSelection);
  // Derive from the SUBSCRIBED object (not a getCollider() side-read): React
  // Compiler memoizes on visible dependencies, and a side-band read left the
  // inspector frozen while the gizmo resized the collider.
  const obj = useStore($activeObject);
  if (!ref) return null;
  const collider = findCollider(obj, ref);
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
        <Tooltip content="Copy this collider next to itself">
          <Button size="sm" variant="ghost" onPress={() => duplicateColliderRef(ref)}>
            Duplicate
          </Button>
        </Tooltip>
        <Tooltip content="Delete this collider">
          <Button size="sm" variant="ghost" onPress={() => removeCollider(ref)}>
            Delete
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

/** Add/fit collider buttons — for the piece selection, or object-level with none. */
function ColliderAuthoring() {
  const selection = useStore($selection);
  const obj = useStore($activeObject);
  const pieceIndex = useStore($pieceIndex);
  const onPieces = selection.length > 0;
  let templateCount = 0;
  let ownCount = 0;
  for (const id of selection) {
    const pl = obj.placements.find((p) => p.instanceId === id);
    if (!pl) continue;
    templateCount += pieceIndex.get(pl.pieceId)?.colliders.length ?? 0;
    ownCount += pl.colliders?.length ?? 0;
  }
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      <div className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        {onPieces ? `Selection · ${templateCount} built-in · ${ownCount} own` : 'Object level'}
      </div>
      <div className="flex items-center gap-1">
        <span className="w-8 text-xs text-fg-muted">Add</span>
        {SHAPES.map((shape) => (
          <Tooltip
            key={shape}
            content={
              onPieces
                ? `Add a ${shape.toLowerCase()} collider on the first selected piece`
                : `Add an object-level ${shape.toLowerCase()} collider at the origin`
            }
          >
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Add ${shape} collider`}
              onPress={() => getScene()?.addManualCollider(shape)}
            >
              {shapeShort(shape)}
            </Button>
          </Tooltip>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <span className="w-8 text-xs text-fg-muted">Fit</span>
        {SHAPES.map((shape) => (
          <Tooltip
            key={shape}
            content={
              onPieces
                ? `Auto-fit a ${shape.toLowerCase()} around the selected pieces' geometry`
                : 'Select pieces first (click in the viewport or the Layers panel)'
            }
          >
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Fit ${shape} collider`}
              isDisabled={!onPieces}
              onPress={() => getScene()?.addFittedCollider(shape)}
            >
              {shapeShort(shape)}
            </Button>
          </Tooltip>
        ))}
      </div>
      <div className="text-[11px] text-fg-subtle">
        {onPieces
          ? "Fit wraps the selected pieces' geometry; the collider attaches to the first selected piece and follows it. Built-in (dimmed) colliders are Core's — scaling a piece bakes scaled copies automatically at export."
          : 'Nothing selected: Add creates an object-level collider (it stays put when pieces move). Select pieces to add or fit colliders that follow them.'}
      </div>
    </div>
  );
}

export function CollidersPanel() {
  const ref = useStore($colliderSelection);
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <ColliderAuthoring />
      <ColliderInspector />
      {!ref && (
        <div className="border-t border-border px-3 py-2 text-[11px] text-fg-subtle">
          Click a collider wire in the viewport or a row in the Colliders panel to inspect it. Move
          it with the gizmo (W/E/R switch tools); the scale tool resizes its dimensions.
        </div>
      )}
    </div>
  );
}
