/**
 * The RIGHT sidebar in COLLIDERS mode: EVERY collider in the object as a
 * selectable list — the "where are all my colliders?" answer. Three groups
 * matching the viewport color language: object-level (editable), per-placement
 * own (editable), and built-in templates (Core's, dimmed wires, read-only —
 * listed so their existence is discoverable, with the bake note).
 */
import { useStore } from '@nanostores/react';
import { Box, Circle, Cylinder, Pill, Trash2 } from 'lucide-react';
import { Button, Tooltip } from '../../../../src/ui/kit';
import {
  $activeObject,
  $colliderSelection,
  $selection,
  removeCollider,
  type ColliderRef,
} from '../state/docStore';
import { $pieceIndex } from '../state/catalogStore';
import { pieceShortName } from '../ksa/staticCatalog';
import type { ColliderShape, PartCollider } from '../../../../src/ksa/types';

function ShapeIcon({ shape }: { shape: ColliderShape }) {
  const cls = 'size-3.5 shrink-0 text-amber-500/80';
  if (shape === 'Cylinder') return <Cylinder className={cls} aria-hidden />;
  if (shape === 'Sphere') return <Circle className={cls} aria-hidden />;
  if (shape === 'Capsule') return <Pill className={cls} aria-hidden />;
  return <Box className={cls} aria-hidden />;
}

function ColliderRow(props: { collider: PartCollider; refValue: ColliderRef; ownerName: string }) {
  const selected = useStore($colliderSelection);
  const isSelected =
    selected !== null &&
    selected.owner === props.refValue.owner &&
    selected.colliderId === props.refValue.colliderId;
  return (
    <div
      className={`group flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
        isSelected ? 'bg-accent/20 text-fg' : 'text-fg-muted hover:bg-surface-2'
      }`}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
        aria-label={`Select collider ${props.collider.id} (${props.ownerName})`}
        onClick={() => {
          $selection.set([]);
          $colliderSelection.set(props.refValue);
        }}
      >
        <ShapeIcon shape={props.collider.shape} />
        <span className="truncate">{props.collider.id}</span>
        <span className="ml-auto shrink-0 text-[10px] text-fg-subtle">{props.ownerName}</span>
      </button>
      <Tooltip content="Delete this collider">
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Delete collider ${props.collider.id}`}
          className="opacity-0 group-hover:opacity-100 data-[focus-visible]:opacity-100"
          onPress={() => removeCollider(props.refValue)}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </Tooltip>
    </div>
  );
}

export function ColliderOutliner() {
  const obj = useStore($activeObject);
  const pieceIndex = useStore($pieceIndex);

  const objectRows = obj.objectColliders;
  const placementRows = obj.placements.filter((pl) => (pl.colliders?.length ?? 0) > 0);
  const templates = obj.placements
    .map((pl) => ({ pl, count: pieceIndex.get(pl.pieceId)?.colliders.length ?? 0 }))
    .filter((e) => e.count > 0);
  const templateTotal = templates.reduce((n, e) => n + e.count, 0);
  const editableTotal =
    objectRows.length + placementRows.reduce((n, pl) => n + (pl.colliders?.length ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
          Colliders
        </span>
        <span className="text-[10px] text-fg-subtle">
          {editableTotal} editable · {templateTotal} built-in
        </span>
      </div>

      {editableTotal === 0 && (
        <div className="px-3 pb-2 text-[11px] text-fg-subtle">
          No colliders of your own yet. Select pieces and use Add / Fit (left panel) — or click Add
          with nothing selected for an object-level collider.
        </div>
      )}

      {objectRows.length > 0 && (
        <div className="flex flex-col gap-0.5 px-1 pb-1">
          <div className="px-2 pt-1 text-[10px] font-semibold text-fg-subtle uppercase">
            Object level
          </div>
          {objectRows.map((c) => (
            <ColliderRow
              key={c.id}
              collider={c}
              refValue={{ owner: null, colliderId: c.id }}
              ownerName="object"
            />
          ))}
        </div>
      )}

      {placementRows.length > 0 && (
        <div className="flex flex-col gap-0.5 px-1 pb-1">
          <div className="px-2 pt-1 text-[10px] font-semibold text-fg-subtle uppercase">
            On pieces
          </div>
          {placementRows.map((pl) =>
            (pl.colliders ?? []).map((c) => (
              <ColliderRow
                key={`${pl.instanceId}:${c.id}`}
                collider={c}
                refValue={{ owner: pl.instanceId, colliderId: c.id }}
                ownerName={pieceShortName(pl.pieceId)}
              />
            )),
          )}
        </div>
      )}

      {templates.length > 0 && (
        <div className="flex flex-col gap-0.5 px-1 pb-2">
          <div className="px-2 pt-1 text-[10px] font-semibold text-fg-subtle uppercase">
            Built-in (Core, read-only)
          </div>
          {templates.map(({ pl, count }) => (
            <div
              key={pl.instanceId}
              className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-fg-subtle"
            >
              <Box className="size-3 shrink-0 opacity-50" aria-hidden />
              <span className="truncate">{pieceShortName(pl.pieceId)}</span>
              <span className="ml-auto shrink-0">{count}</span>
            </div>
          ))}
          <div className="px-2 pt-1 text-[10px] text-fg-subtle">
            Dimmed wires in the viewport. Scaled pieces get scaled copies baked automatically at
            export.
          </div>
        </div>
      )}
    </div>
  );
}
