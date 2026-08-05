import { useStore } from '@nanostores/react';
import { MoreVertical } from 'lucide-react';
import {
  Button,
  Chip,
  Menu,
  MenuHeader,
  MenuItem,
  MenuTrigger,
  Popover,
  SubmenuTrigger,
} from '../kit';
import {
  $part,
  $selection,
  addKittenAtSeat,
  duplicatePlacement,
  duplicateSelected,
  entityIndexOf,
  isGlassTemplate,
  moveEntityToLayer,
  moveIvaSeat,
  refLayerId,
  removeSelected,
  select,
  setPlacementsInternal,
} from '../../state/editorStore';
import { $selectionByKind } from '../../state/selectors';
import { isLayerVisible, revealLayer } from '../../state/layerStore';
import { status, undoStatusAction } from '../../state/statusStore';
import { enterSeatView } from '../../state/ivaStore';
import { setManagingMeshId } from '../../state/customAssetStore';
import { requestColliderFit } from '../../state/colliderStore';
import { ENTITY_ONLY_LAYER_IDS, type LayerableKind } from '../../ksa/types';
import { KIND_ICONS } from './kindIcons';
import { openSubPartData } from './subPartData';
import type { OutlinerRow } from './outlinerTree';

/**
 * One entity row's CONTENT — icon, name (with search highlight), sub line, badges and the
 * per-kind ⋮ menu (design: design-build-mode.md §2.4). The surrounding `GridListItem` (keys,
 * selection, disabled/hidden state, the ⇧-range hook, the right-click-at-cursor plumbing)
 * belongs to {@link OutlinerPanel}, so this component stays reusable by the phone sheet.
 *
 * The menu is deliberately in this file rather than the panel: it is the row's own surface,
 * and {@link EntityMenu} is exported so the panel's ONE context-menu popover renders the
 * identical items at the cursor instead of synthesising a click on this button (the v1 hack).
 *
 * **React Compiler note**: every predicate in the menu (`isDisabled`, the glass gate, the
 * selection-aware Interior target list) is evaluated in {@link EntityMenu}'s render, and that
 * component is mounted by a react-aria `Popover` — which unmounts on close. A menu that stayed
 * mounted would freeze those predicates at their first-open values.
 */

export function EntityRow({
  row,
  tint,
  onDragStart,
  onPointerDown,
}: {
  row: OutlinerRow;
  tint?: string;
  /**
   * Native HTML5 drag start. It lives on THIS div rather than the surrounding
   * `GridListItem` because react-aria's `GridListItemProps` accepts no `draggable`/
   * `onDragStart` — see the DND note in `LayerHeaderRow`.
   */
  onDragStart?: (e: React.DragEvent) => void;
  /**
   * Fires BEFORE react-aria's row press handler (this div is the row's child, and React
   * bubbles from the child up), which is the only moment the pre-press selection can still
   * be read — the panel snapshots it there so a drag can carry a multi-selection.
   */
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const Icon = KIND_ICONS[row.kind];
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1.5"
      draggable={onDragStart !== undefined}
      onDragStart={onDragStart}
      onPointerDown={onPointerDown}
    >
      {/* The layer's color as a 2px left edge — editor chrome only, never a 3D material. */}
      {tint && (
        <span aria-hidden className="-ml-1 h-6 w-0.5 rounded-full" style={{ background: tint }} />
      )}
      <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-xs${row.kind === 'connector' ? ' font-mono' : ''}`}>
          <Highlighted text={row.name} ranges={row.matchRanges} />
        </span>
        <span className="truncate text-[11px] text-fg-subtle">{row.sub}</span>
      </div>
      {row.badges.interior && (
        <Chip
          className="shrink-0"
          title="This SubPart template is <Internal> — drawn only in the interior (IVA) view."
        >
          int
        </Chip>
      )}
      {row.badges.lightType && (
        <span className="shrink-0 text-[11px] text-fg-subtle">{row.badges.lightType}</span>
      )}
      {row.badges.colliderShape && (
        <span className="shrink-0 text-[11px] text-fg-subtle">{row.badges.colliderShape}</span>
      )}
      <MenuTrigger>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          aria-label={`${row.name} options`}
          className="size-5 shrink-0"
          // Keep the GridList row from treating the menu click as a row press.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-3.5" />
        </Button>
        <Popover placement="bottom end" className="w-56">
          <EntityMenu row={row} />
        </Popover>
      </MenuTrigger>
    </div>
  );
}

/**
 * The per-kind row menu (design §2.4's table, implemented exactly). Rendered inside a
 * `Popover` by both the ⋮ trigger above and the panel's context-menu popover.
 */
export function EntityMenu({ row }: { row: OutlinerRow }) {
  const part = useStore($part);
  const ref = { kind: row.kind, id: row.id };
  const index = entityIndexOf(part, row.kind, row.id);
  const layerId = refLayerId(part, ref);
  const layerName = part.layers.find((l) => l.id === layerId)?.name ?? layerId;

  // A row action whose result lands on a hidden layer would otherwise be silent — the action
  // still runs, it just says where the result went (design §2.4 fix, census pain 12).
  const flashIfHidden = (verb: string) => {
    if (!layerId || isLayerVisible(layerId)) return;
    status(`${verb} into hidden layer “${layerName}”`, {
      severity: 'info',
      action: { label: 'Show layer', run: () => revealLayer(layerId) },
    });
  };

  const duplicate = () => {
    if (index < 0) return;
    if (row.kind === 'subpart') {
      duplicatePlacement(index);
    } else {
      select([ref]);
      duplicateSelected();
    }
    flashIfHidden('Duplicated');
  };

  // ≤5 entities and fully undoable ⇒ no confirm dialog, just say what happened and offer the
  // takeback (foundation §14.3). A single row is always ≤5, so row deletes are confirm-free —
  // this is what replaced v1's per-row ConfirmDialog.
  //
  // A row menu acts on ITS row, so the rest of the selection has to survive: `removeSelected`
  // is the only per-kind removal path, so the selection is borrowed for the call and put
  // back. `select` drops refs whose entity is gone, which is what removes the deleted one —
  // and selection is never an undo step, so borrowing it costs no history.
  const remove = () => {
    if (index < 0) return;
    const prior = $selection.get();
    select([ref]);
    removeSelected();
    select(prior);
    // Same severity as `edit.delete`'s flash: `danger` is what the ONE severity→duration
    // table spells as the 10 s takeback window §14.3 asks for. One policy, one look.
    status(`Deleted ${row.name}`, { severity: 'danger', action: undoStatusAction() });
  };

  if (index < 0) return <Menu aria-label="Row options" />;

  return (
    <Menu aria-label={`${row.name} options`}>
      <MenuItem onAction={duplicate}>Duplicate</MenuItem>
      {row.kind === 'subpart' && <SubPartItems index={index} />}
      {row.kind === 'collider' && (
        <MenuItem
          onAction={() => {
            select([ref]);
            requestColliderFit(part.colliders[index].shape, { kind: 'existing', index });
          }}
        >
          Fit to Selection
        </MenuItem>
      )}
      {row.kind === 'ivaSeat' && (
        <>
          {/* Allowed on a locked layer — it only moves the camera (design §3.5). */}
          <MenuItem
            onAction={() => {
              select([ref]);
              enterSeatView(row.id);
            }}
          >
            Sit in This Seat
          </MenuItem>
          <MenuItem onAction={() => addKittenAtSeat(index)}>Add Kitten at Seat</MenuItem>
          {/* Seat order IS the game's IVA cycle order, and index 0 is the seat IVA opens on. */}
          <MenuItem isDisabled={index === 0} onAction={() => moveIvaSeat(index, -1)}>
            Move Up
          </MenuItem>
          <MenuItem
            isDisabled={index === part.ivaSeats.length - 1}
            onAction={() => moveIvaSeat(index, 1)}
          >
            Move Down
          </MenuItem>
        </>
      )}
      {(row.kind === 'subpart' || row.kind === 'connector' || row.kind === 'collider') && (
        <ChangeLayerItem kind={row.kind} index={index} layerId={layerId} />
      )}
      <MenuItem variant="danger" onAction={remove}>
        Delete…
      </MenuItem>
    </Menu>
  );
}

/** The SubPart-only middle of the menu: the two mode jumps and the Interior submenu. */
function SubPartItems({ index }: { index: number }) {
  const part = useStore($part);
  const byKind = useStore($selectionByKind);
  const placement = part.placements[index];
  const customMesh = part.customMeshes.find((m) => m.subPartId === placement.subPartTemplateId);

  // The one multi-selection-aware item: this row alone unless it is part of the current
  // SubPart selection, in which case the whole selection — KSA's <Internal> is per-TEMPLATE,
  // so a bulk toggle is exactly what it is for.
  const selectedSubIndices = byKind.subpart
    .map((r) => entityIndexOf(part, 'subpart', r.id))
    .filter((i) => i >= 0);
  const internalTargets = selectedSubIndices.includes(index) ? selectedSubIndices : [index];
  const internalTemplateIds = [
    ...new Set(
      internalTargets.flatMap((i) =>
        part.placements[i] ? [part.placements[i].subPartTemplateId] : [],
      ),
    ),
  ];
  // KSA's <PartModelGlass> has no <Internal> field, so the flag would be silently ignored.
  const glassOnly =
    internalTemplateIds.length > 0 && internalTemplateIds.every((id) => isGlassTemplate(part, id));

  return (
    <>
      {/* TODO(P6): replace with the Data-mode jump command (template scope). */}
      <MenuItem onAction={() => openSubPartData(placement.subPartTemplateId)}>
        SubPart Data →
      </MenuItem>
      {/* TODO(P8): replace with the Surface-mode jump command (mesh picked). */}
      {customMesh && (
        <MenuItem onAction={() => setManagingMeshId(customMesh.id)}>Edit Surface →</MenuItem>
      )}
      {glassOnly ? (
        <MenuItem isDisabled textValue="Interior (IVA only) — n/a for glass">
          <span title="KSA glass (<PartModelGlass>) has no <Internal> field, so the flag would be silently ignored.">
            Interior (IVA only) — n/a for glass
          </span>
        </MenuItem>
      ) : (
        <SubmenuTrigger>
          <MenuItem>
            {internalTargets.length > 1
              ? `Interior (IVA only) — ${internalTargets.length} selected`
              : 'Interior (IVA only)'}
          </MenuItem>
          <Popover className="w-64">
            <Menu onAction={(key) => setPlacementsInternal(internalTargets, key === 'on')}>
              {/* <Internal> lives on the template's <PartModel>, so this is never
                  per-placement — say so where the user clicks it. */}
              <MenuHeader>
                {internalTemplateIds.length === 1
                  ? 'Applies to every placement of this SubPart template'
                  : `Applies to every placement of ${internalTemplateIds.length} SubPart templates`}
              </MenuHeader>
              <MenuItem id="on">On — interior only (IVA)</MenuItem>
              <MenuItem id="off">Off — visible everywhere</MenuItem>
            </Menu>
          </Popover>
        </SubmenuTrigger>
      )}
    </>
  );
}

/**
 * "Change Layer" submenu — the shared surface for every kind that lives on an ordinary layer
 * (SubParts, connectors, colliders). The entity-only built-in layers are filtered out because
 * nothing else may live there, and the row's own layer is disabled.
 */
function ChangeLayerItem({
  kind,
  index,
  layerId,
}: {
  kind: LayerableKind;
  index: number;
  layerId: string;
}) {
  const part = useStore($part);
  const layers = part.layers.filter((l) => !ENTITY_ONLY_LAYER_IDS.includes(l.id));
  return (
    <SubmenuTrigger>
      <MenuItem>Change Layer</MenuItem>
      <Popover className="w-44">
        <Menu
          disabledKeys={[layerId]}
          onAction={(key) => moveEntityToLayer(kind, index, String(key))}
        >
          {layers.map((l) => (
            <MenuItem key={l.id} id={l.id}>
              {l.name}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </SubmenuTrigger>
  );
}

/**
 * The name with its fuzzy-match spans marked. `ranges` are half-open `[start, end)` indices
 * into `text` (the shared matcher's contract), ascending and non-overlapping, so a single
 * left-to-right walk renders them.
 */
export function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return text;
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  // Positional keys are correct here: the list IS the string, split in reading order.
  return parts.map((part, i) =>
    part.hit ? (
      <mark key={i} className="bg-transparent font-semibold text-accent">
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}
