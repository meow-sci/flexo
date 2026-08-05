import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { Copy, Eye, Layers, Trash2, Workflow } from 'lucide-react';
import {
  Button,
  InlineConfirmStrip,
  Menu,
  MenuHeader,
  MenuItem,
  MenuTrigger,
  Popover,
  Switch,
} from '../kit';
import { VectorApply } from './VectorApply';
import {
  $bulkScaleMode,
  $part,
  duplicateSelected,
  entityIndexOf,
  isGlassTemplate,
  moveSelectionToLayer,
  pushUndo,
  removeSelected,
  setPlacementsInternal,
} from '../../state/editorStore';
import { $selectedRefs, $selectionByKind } from '../../state/selectors';
import { $layerView, isLayerLocked } from '../../state/layerStore';
import { liftedSelectionRefs, writeBackLifted } from '../../three/selectionTransform';
import {
  centroidOf,
  groupScaledTransform,
  quatFromEulerDeg,
  rotatedAroundOriginTransform,
  translatedTransform,
} from '../../three/bulkTransform';
import { beginActionChain } from '../chain/openChainPalette';
import { ENTITY_ONLY_LAYER_IDS } from '../../ksa/types';

/**
 * The 2+ selection focus card (design: design-build-mode.md §3.8) — v1's
 * `BulkTransformPanel` plus the actions `MultiSelectToolbar` used to float.
 *
 * **THE FIX (census pain 4).** v1's numeric appliers iterated the RAW `$selectedRefs`, whose
 * transforms are OWNER-local for SubPart-owned colliders and lights — so "Move by 1 m X" on a
 * selection containing an owned light moved it along the *owner's* X, scaled by owner scale,
 * silently differently from dragging the same selection with the gizmo. The appliers below
 * iterate {@link liftedSelectionRefs} and write through {@link writeBackLifted}: the SAME
 * shared lift the gizmo and the keyboard nudge/rotate tools use, so all three now agree
 * frame-for-frame. That shared-ness IS the fix — never re-implement the lift here.
 *
 * **Undo enrollment**: each Apply and each action is ONE discrete step. The appliers push
 * explicitly (the write-back deliberately does not); `moveSelectionToLayer`,
 * `setPlacementsInternal`, `duplicateSelected` and `removeSelected` push their own.
 */
export function MultiSelectPanel() {
  const refs = useStore($selectedRefs);
  const scaleMode = useStore($bulkScaleMode);
  useStore($layerView); // re-render when lock state changes
  const anyLocked = refs.some((r) => isLayerLocked(r.layerId));

  const bulkDetail = refs.length === 1 ? refs[0].name : `${refs.length} items`;

  const applyMove = (delta: [number, number, number]) => {
    const lifted = liftedSelectionRefs();
    if (lifted.length === 0) return;
    pushUndo('move', bulkDetail);
    const d = { x: delta[0], y: delta[1], z: delta[2] };
    writeBackLifted(
      lifted.map((r) => ({
        kind: r.kind,
        id: r.id,
        transform: translatedTransform(r.transform, d),
      })),
    );
  };

  const applyRotate = (deg: [number, number, number]) => {
    const lifted = liftedSelectionRefs();
    if (lifted.length === 0) return;
    pushUndo('rotate', bulkDetail);
    const deltaQuat = quatFromEulerDeg({ x: deg[0], y: deg[1], z: deg[2] });
    const origin = centroidOf(lifted.map((r) => r.transform.position));
    writeBackLifted(
      lifted.map((r) => ({
        kind: r.kind,
        id: r.id,
        transform: rotatedAroundOriginTransform(r.transform, deltaQuat, origin),
      })),
    );
  };

  const applyScale = (factor: [number, number, number]) => {
    const lifted = liftedSelectionRefs();
    if (lifted.length === 0) return;
    pushUndo('scale', bulkDetail);
    const f = { x: factor[0], y: factor[1], z: factor[2] };
    const origin =
      scaleMode === 'smart' ? centroidOf(lifted.map((r) => r.transform.position)) : null;
    writeBackLifted(
      lifted.map((r) => ({
        kind: r.kind,
        id: r.id,
        transform: groupScaledTransform(r.kind, r.transform, f, origin),
      })),
    );
  };

  return (
    <>
      <VectorApply
        title="Move by (m)"
        defaultValue={[0, 0, 0]}
        isDisabled={anyLocked}
        onApply={applyMove}
      />
      <VectorApply
        title="Rotate by (°) around centroid"
        defaultValue={[0, 0, 0]}
        isDisabled={anyLocked}
        onApply={applyRotate}
      />
      <div className="flex flex-col gap-1">
        <VectorApply
          title={scaleMode === 'smart' ? 'Scale by (×) around centroid' : 'Scale by (×) in place'}
          defaultValue={[1, 1, 1]}
          isDisabled={anyLocked}
          onApply={applyScale}
        />
        <Switch
          isSelected={scaleMode === 'smart'}
          isDisabled={anyLocked}
          onChange={(on) => $bulkScaleMode.set(on ? 'smart' : 'inPlace')}
        >
          Scale positions too (smart)
        </Switch>
      </div>

      <ActionsRow count={refs.length} isDisabled={anyLocked} />
    </>
  );
}

/**
 * The actions row (design §3.8.6) — everything `MultiSelectToolbar` floated, plus the two
 * buttons `SelectionToolbar` carried for a multi-selection (Duplicate, Chain…).
 */
function ActionsRow({ count, isDisabled }: { count: number; isDisabled: boolean }) {
  const byKind = useStore($selectionByKind);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const movable = byKind.subpart.length + byKind.connector.length + byKind.collider.length > 0;

  if (confirmDelete) {
    return (
      <InlineConfirmStrip
        size="xs"
        label={`Delete all ${count} selected items?`}
        confirmLabel="Delete All"
        onConfirm={() => {
          setConfirmDelete(false);
          removeSelected();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-1 border-t border-border pt-2">
      {/* SubParts, connectors and colliders can change layer; seats/lights/kittens are
          pinned to their own built-ins, and are simply left where they are. */}
      {movable && <ChangeLayerButton isDisabled={isDisabled} />}
      {byKind.subpart.length > 0 && <InteriorButton isDisabled={isDisabled} />}
      <Button size="sm" isDisabled={isDisabled} onPress={() => duplicateSelected()}>
        <Copy className="size-3.5" />
        Duplicate
      </Button>
      {/* Opens the action-chain session over the current SubPart selection; the open guards
          re-check that it holds unlocked placements. */}
      <Button size="sm" isDisabled={isDisabled} onPress={() => beginActionChain()}>
        <Workflow className="size-3.5" />
        Chain…
      </Button>
      {/* Always confirmed: "Delete All (N)" is named in the §14.3 confirm policy, and the
          strip is inline so a panel never opens a modal (design-system-services §7.5). */}
      <Button
        size="sm"
        variant="danger"
        isDisabled={isDisabled}
        onPress={() => setConfirmDelete(true)}
      >
        <Trash2 className="size-3.5" />
        Delete All ({count})
      </Button>
    </div>
  );
}

/** "Change Layer ▸": picks a destination layer for the whole selection (one undo step). */
function ChangeLayerButton({ isDisabled }: { isDisabled: boolean }) {
  return (
    <MenuTrigger>
      <Button size="sm" isDisabled={isDisabled}>
        <Layers className="size-3.5" />
        Change Layer
      </Button>
      <Popover placement="bottom start" className="w-48">
        {/* Mounted by the Popover, so the layer list is rebuilt on every open instead of
            being frozen into one render by React Compiler. */}
        <ChangeLayerMenu />
      </Popover>
    </MenuTrigger>
  );
}

function ChangeLayerMenu() {
  const part = useStore($part);
  // Nothing may be moved ONTO the entity-only built-in layers (seats/lights/kittens).
  const layers = part.layers.filter((l) => !ENTITY_ONLY_LAYER_IDS.includes(l.id));
  return (
    <Menu aria-label="Change layer" onAction={(key) => moveSelectionToLayer(String(key))}>
      {layers.map((l) => (
        <MenuItem key={l.id} id={l.id}>
          {l.name}
        </MenuItem>
      ))}
    </Menu>
  );
}

/**
 * "Interior (IVA only) ▸ On/Off" for the whole SubPart selection.
 *
 * KSA's `<Internal>` lives on the template's `<PartModel>`, so this is per-TEMPLATE, never
 * per-placement: it hits the distinct templates behind the selection, and the menu says so.
 * Disabled when every selected template exports through `<PartModelGlass>` (KSA glass has no
 * `<Internal>` field, so the flag would be silently ignored).
 */
function InteriorButton({ isDisabled }: { isDisabled: boolean }) {
  const part = useStore($part);
  const subRefs = useStore($selectionByKind).subpart;

  const templateIds = [
    ...new Set(
      subRefs.flatMap((ref) => {
        const p = part.placements.find((q) => q.instanceId === ref.id);
        return p ? [p.subPartTemplateId] : [];
      }),
    ),
  ];
  const glassOnly = templateIds.length > 0 && templateIds.every((id) => isGlassTemplate(part, id));

  return (
    <MenuTrigger>
      <Button size="sm" isDisabled={isDisabled || glassOnly}>
        <Eye className="size-3.5" />
        {glassOnly ? 'Interior — n/a for glass' : 'Interior (IVA only)'}
      </Button>
      <Popover placement="bottom start" className="w-64">
        <Menu
          aria-label="Interior (IVA only)"
          onAction={(key) =>
            // `setPlacementsInternal` keeps its index signature (it is per-template, not
            // per-entity); the caller resolves refs → live indices.
            setPlacementsInternal(
              subRefs.map((ref) => entityIndexOf(part, 'subpart', ref.id)),
              key === 'on',
            )
          }
        >
          <MenuHeader>
            {templateIds.length === 1
              ? 'Applies to every placement of this SubPart template'
              : `Applies to every placement of ${templateIds.length} SubPart templates`}
          </MenuHeader>
          <MenuItem id="on">On — interior only (IVA)</MenuItem>
          <MenuItem id="off">Off — visible everywhere</MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
