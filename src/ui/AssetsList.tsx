import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Collection,
  GridList,
  GridListHeader,
  GridListItem,
  GridListSection,
  type Selection,
} from 'react-aria-components';
import { MoreVertical } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  Menu,
  MenuHeader,
  MenuItem,
  MenuTrigger,
  Popover,
  SearchField,
  SubmenuTrigger,
  cn,
  gridRowClass,
} from './kit';
import {
  $part,
  $revealEntity,
  $selectedConnectorIndices,
  $selectedIndices,
  $selectedColliderIndices,
  $selectedIvaSeatIndices,
  $selectedKittenIndices,
  $selectedLightIndices,
  duplicatePlacement,
  duplicateSelected,
  isGlassTemplate,
  moveEntityToLayer,
  removePlacement,
  removeSelected,
  selectCollider,
  selectConnector,
  selectIvaSeat,
  selectKitten,
  selectLight,
  setPlacementsInternal,
  setSelection,
} from '../state/editorStore';
import { $catalogIndex } from '../state/catalogStore';
import { resolveInternal } from '../ksa/modExport';
import { $layerView, layerViewState } from '../state/layerStore';
import { ENTITY_ONLY_LAYER_IDS, meshKind, type Layer, type LayerableKind } from '../ksa/types';
import { seatAxesFromRotation } from '../ksa/ivaSeatAxes';
import { enterSeatView } from '../state/ivaStore';
import { formatG6 } from '../ksa/formatG6';
import { setManagingMeshId } from '../state/customAssetStore';
import { ManageTanksModal } from './ManageTanksModal';
import { useShiftRangeSelect } from './rangeSelect';

/** Trailing `_Subpart_Foo` segment of a template id — the part users actually read. */
function lastSegment(id: string): string {
  return id.split('_').pop() || id;
}

/** An entity kind that can appear as a row in the Assets list. */
type Kind = 'subpart' | 'connector' | 'collider' | 'ivaSeat' | 'kitten' | 'light';

/** One asset row. `index` points into the matching `$part` array for its kind. */
interface Row {
  id: string;
  kind: Kind;
  index: number;
  name: string;
  sub: string;
  /** True when the row's layer is hidden — listed but not selectable (matches 3D). */
  hidden: boolean;
}

/** One Assets-list section: a layer plus its (search-filtered) rows. */
interface Section {
  id: string;
  layer: Layer;
  rows: Row[];
  count: number;
  hidden: boolean;
  locked: boolean;
}

const PREFIX: Record<Kind, string> = {
  subpart: 'sp',
  connector: 'con',
  collider: 'col',
  ivaSeat: 'iva',
  kitten: 'kit',
  light: 'lig',
};
const keyOf = (kind: Kind, raw: string) => `${PREFIX[kind]}:${raw}`;
function parseKey(key: string): { kind: Kind; raw: string } {
  const i = key.indexOf(':');
  const p = key.slice(0, i);
  return {
    kind:
      p === 'sp'
        ? 'subpart'
        : p === 'con'
          ? 'connector'
          : p === 'col'
            ? 'collider'
            : p === 'iva'
              ? 'ivaSeat'
              : p === 'lig'
                ? 'light'
                : 'kitten',
    raw: key.slice(i + 1),
  };
}

/**
 * The unified inspector "Assets" list: one section per layer (filtered by each layer's
 * "in asset list" toggle), listing everything that layer holds. SubParts, connectors and
 * colliders are ordinary layer citizens and freely mix within a section (grouped by kind
 * for readability); the pinned kinds — IVA seats, lights, kittens — only ever appear
 * under their own built-in layer.
 *
 * It is a single react-aria GridList so multi-select spans layers. Because the
 * per-kind selection stores are mutually exclusive, row keys are kind-prefixed and
 * `onSelectionChange` collapses the resulting set to whichever kind the user just
 * touched. Rows on locked layers are disabled; rows on hidden layers stay listed
 * (so they remain manageable via the row menu) but can't be selected — mirroring
 * the 3D rule that selection works only for visible + unlocked entities.
 *
 * Selection gestures are the usual list conventions: click replaces, Cmd/Ctrl+click
 * toggles one row, Cmd/Ctrl+A takes everything selectable, and **Shift+click extends
 * across the rows in between** — the last one through {@link useShiftRangeSelect},
 * because react-aria's own range extension can't survive a store-controlled list.
 */
export function AssetsList() {
  const part = useStore($part);
  const layerView = useStore($layerView);
  const selSub = useStore($selectedIndices);
  const selCon = useStore($selectedConnectorIndices);
  const selKit = useStore($selectedKittenIndices);
  const selCol = useStore($selectedColliderIndices);
  const selSeat = useStore($selectedIvaSeatIndices);
  const selLig = useStore($selectedLightIndices);
  const catalogIndex = useStore($catalogIndex);
  const reveal = useStore($revealEntity);
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fast key → store-index lookups for onSelectionChange.
  const subIdx = new Map(part.placements.map((p, i) => [p.instanceId, i]));
  const conIdx = new Map(part.connectors.map((c, i) => [c.id, i]));
  const kitIdx = new Map(part.kittens.map((k, i) => [k.id, i]));
  const colIdx = new Map(part.colliders.map((c, i) => [c.id, i]));
  const seatIdx = new Map(part.ivaSeats.map((s, i) => [s.id, i]));
  const ligIdx = new Map(part.lights.map((l, i) => [l.id, i]));

  const q = search.trim().toLowerCase();
  const match = (...vals: string[]) => q === '' || vals.some((v) => v.toLowerCase().includes(q));
  // Row builders, one per kind, each filtering to the layer being rendered. A layer holds
  // whatever was put on it — a mix of SubParts, connectors and colliders is the normal
  // case — so every builder runs for every layer and the kinds simply come out grouped.
  const subPartRows = (layerId: string, hidden: boolean): Row[] =>
    part.placements.flatMap((p, i) => {
      if (p.layerId !== layerId) return [];
      // The resolved <Internal> flag (document override → the built-in's catalogued value)
      // is shown on the row: it now defaults to the game's own value instead of being
      // normalised away on export, so it has to be visible — and searchable.
      const interior = resolveInternal(
        part,
        p.subPartTemplateId,
        catalogIndex.get(p.subPartTemplateId),
      );
      if (!match(p.instanceId, p.subPartTemplateId, interior ? 'interior' : '')) return [];
      return [
        {
          id: keyOf('subpart', p.instanceId),
          kind: 'subpart' as const,
          index: i,
          name: p.instanceId,
          sub: interior ? `${p.subPartTemplateId} · interior` : p.subPartTemplateId,
          hidden,
        },
      ];
    });
  const connectorRows = (layerId: string, hidden: boolean): Row[] =>
    part.connectors.flatMap((c, i) =>
      c.layerId === layerId && match(c.id, ...c.flags, ...c.capabilities)
        ? [
            {
              id: keyOf('connector', c.id),
              kind: 'connector' as const,
              index: i,
              name: c.id,
              // Flags (how it orients) and capabilities (what may flow across it)
              // are independent axes — show both, e.g. "ToSurface · BulkFluid".
              sub: [...c.flags, ...c.capabilities].join(' · ') || 'no flags',
              hidden,
            },
          ]
        : [],
    );
  const colliderRows = (layerId: string, hidden: boolean): Row[] =>
    part.colliders.flatMap((c, i) =>
      c.layerId === layerId && match(c.id, c.shape, c.ownerTemplateId ?? '')
        ? [
            {
              id: keyOf('collider', c.id),
              kind: 'collider' as const,
              index: i,
              name: c.id,
              // Shape plus its owner — a SubPart-owned collider behaves very
              // differently (one per placement, follows animation), so say so.
              sub: `${c.shape} · ${c.ownerTemplateId ? lastSegment(c.ownerTemplateId) : 'Part'}`,
              hidden,
            },
          ]
        : [],
    );
  // Seats have no user-facing name of their own (their document id is never exported),
  // so the row IS the ordinal — and the order is the game's seat cycle order, with
  // index 0 the seat IVA opens on.
  const ivaSeatRows = (layerId: string, hidden: boolean): Row[] =>
    part.ivaSeats.flatMap((s, i) => {
      const name = `Seat ${i + 1}`;
      const isDefault = i === 0;
      if (!(s.layerId === layerId && match(s.id, name, isDefault ? 'default' : ''))) return [];
      // The derived <ForwardAxis> — the vector that actually ships in the XML.
      const { forward } = seatAxesFromRotation(s.rotation);
      const aim = `${formatG6(forward.x)}, ${formatG6(forward.y)}, ${formatG6(forward.z)}`;
      return [
        {
          id: keyOf('ivaSeat', s.id),
          kind: 'ivaSeat' as const,
          index: i,
          name,
          sub: `→ ${aim}${isDefault ? ' · default' : ''}`,
          hidden,
        },
      ];
    });
  const lightRows = (layerId: string, hidden: boolean): Row[] =>
    part.lights.flatMap((li, i) =>
      li.layerId === layerId && match(li.id, li.type, li.ownerTemplateId ?? '')
        ? [
            {
              id: keyOf('light', li.id),
              kind: 'light' as const,
              index: i,
              name: li.id,
              // Type plus its owner — a SubPart-owned light behaves very differently
              // (one marker per placement, edits affect all), so say so; a part-level
              // light just shows its type.
              sub: li.ownerTemplateId
                ? `${li.type} · via ${lastSegment(li.ownerTemplateId)}`
                : li.type,
              hidden,
            },
          ]
        : [],
    );
  const kittenRows = (layerId: string, hidden: boolean): Row[] =>
    part.kittens.flatMap((k, i) =>
      k.layerId === layerId && match(k.id, k.kind)
        ? [
            {
              id: keyOf('kitten', k.id),
              kind: 'kitten' as const,
              index: i,
              name: k.id,
              sub: k.kind,
              hidden,
            },
          ]
        : [],
    );

  const sections: Section[] = part.layers
    .filter((l) => layerViewState(layerView, l.id).listed)
    .map((l) => {
      const view = layerViewState(layerView, l.id);
      const hidden = !view.visible;
      const rows = [
        ...subPartRows(l.id, hidden),
        ...connectorRows(l.id, hidden),
        ...colliderRows(l.id, hidden),
        ...ivaSeatRows(l.id, hidden),
        ...lightRows(l.id, hidden),
        ...kittenRows(l.id, hidden),
      ];
      return { id: l.id, layer: l, rows, count: rows.length, hidden, locked: view.locked };
    })
    .filter((s) => s.rows.length > 0);

  // Locked-layer rows are fully disabled (non-selectable, non-focusable).
  const disabledKeys = new Set<string>();
  for (const s of sections) if (s.locked) for (const r of s.rows) disabledKeys.add(r.id);

  // Hidden-layer rows are blocked from selection but not disabled (keep their menu).
  const hiddenKeys = new Set<string>();
  for (const s of sections) if (s.hidden) for (const r of s.rows) hiddenKeys.add(r.id);

  // Controlled selection — the UNION of every kind store, so a selection can span
  // SubParts, connectors, colliders, IVA seats and kittens at once (native
  // react-aria multi-select).
  const selectedKeys = new Set<string>();
  for (const i of selSub) {
    const p = part.placements[i];
    if (p) selectedKeys.add(keyOf('subpart', p.instanceId));
  }
  for (const i of selCon) {
    const c = part.connectors[i];
    if (c) selectedKeys.add(keyOf('connector', c.id));
  }
  for (const i of selKit) {
    const k = part.kittens[i];
    if (k) selectedKeys.add(keyOf('kitten', k.id));
  }
  for (const i of selCol) {
    const c = part.colliders[i];
    if (c) selectedKeys.add(keyOf('collider', c.id));
  }
  for (const i of selSeat) {
    const s = part.ivaSeats[i];
    if (s) selectedKeys.add(keyOf('ivaSeat', s.id));
  }
  for (const i of selLig) {
    const l = part.lights[i];
    if (l) selectedKeys.add(keyOf('light', l.id));
  }

  // Shift+click ranges run over the displayed row order, which is the sections
  // flattened — a range can therefore span layers, exactly like a plain multi-select.
  const range = useShiftRangeSelect({
    orderedKeys: sections.flatMap((s) => s.rows.map((r) => r.id)),
    selectedKeys,
    isSelectable: (key) => !disabledKeys.has(key) && !hiddenKeys.has(key),
  });

  const onSelectionChange = (reported: Selection) => {
    const keys = range.resolveSelection(reported);
    const sub: number[] = [];
    const con: number[] = [];
    const kit: number[] = [];
    const col: number[] = [];
    const seat: number[] = [];
    const lig: number[] = [];
    if (keys === 'all') {
      // Select-all (Cmd/Ctrl+A): every enabled (visible + unlocked) row, all kinds.
      for (const s of sections) {
        if (s.locked || s.hidden) continue;
        for (const r of s.rows) {
          if (r.kind === 'subpart') sub.push(r.index);
          else if (r.kind === 'connector') con.push(r.index);
          else if (r.kind === 'collider') col.push(r.index);
          else if (r.kind === 'ivaSeat') seat.push(r.index);
          else if (r.kind === 'light') lig.push(r.index);
          else kit.push(r.index);
        }
      }
      setSelection(sub, con, kit, col, seat, lig);
      return;
    }
    const next = new Set([...keys].map(String));
    // Clicking a hidden-layer row may not select it (matches the 3D visible rule);
    // ignore the event so the current selection is preserved.
    const added = [...next].find((id) => !selectedKeys.has(id));
    if (added != null && hiddenKeys.has(added)) return;
    // Partition the (possibly cross-kind) key set into the per-kind stores; drop any
    // hidden-layer rows that a range selection may have swept in.
    for (const id of next) {
      if (hiddenKeys.has(id)) continue;
      const { kind, raw } = parseKey(id);
      if (kind === 'subpart') {
        const i = subIdx.get(raw);
        if (i != null) sub.push(i);
      } else if (kind === 'connector') {
        const i = conIdx.get(raw);
        if (i != null) con.push(i);
      } else if (kind === 'collider') {
        const i = colIdx.get(raw);
        if (i != null) col.push(i);
      } else if (kind === 'ivaSeat') {
        const i = seatIdx.get(raw);
        if (i != null) seat.push(i);
      } else if (kind === 'light') {
        const i = ligIdx.get(raw);
        if (i != null) lig.push(i);
      } else {
        const i = kitIdx.get(raw);
        if (i != null) kit.push(i);
      }
    }
    setSelection(sub, con, kit, col, seat, lig);
  };

  // A 3D-viewport click can't tell the list to scroll; it signals via $revealEntity
  // instead. When that fires, scroll the matching row into view (no-op if filtered
  // out by search), then consume the signal so it doesn't re-trigger on later renders.
  useEffect(() => {
    if (!reveal) return;
    const key = keyOf(reveal.kind, reveal.id);
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-asset-key="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
    $revealEntity.set(null);
  }, [reveal]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 rounded-xl border border-border bg-panel p-2">
      <div className="px-1">
        <SearchField
          size="sm"
          aria-label="Filter assets"
          placeholder="Filter assets…"
          value={search}
          onChange={setSearch}
        />
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <GridList
          aria-label="Assets"
          selectionMode="multiple"
          selectionBehavior="replace"
          items={sections}
          selectedKeys={selectedKeys}
          disabledKeys={disabledKeys}
          onSelectionChange={onSelectionChange}
          dependencies={[search, layerView]}
          renderEmptyState={() => (
            <span className="block px-1 py-1 text-sm text-fg-subtle">
              {search.trim() ? 'No matching assets' : 'No assets'}
            </span>
          )}
          className="flex flex-col gap-1 outline-none"
        >
          {(section: Section) => (
            <GridListSection id={section.id} className="flex flex-col gap-0.5">
              <GridListHeader className="flex items-center gap-1 px-1 pt-1 text-xs uppercase tracking-wide text-fg-subtle">
                <span className="min-w-0 truncate">{section.layer.name}</span>
                <span className="text-fg-subtle/70">({section.count})</span>
                {section.hidden && <span className="text-fg-subtle/70">· hidden</span>}
                {section.locked && <span className="text-fg-subtle/70">· locked</span>}
              </GridListHeader>
              <Collection items={section.rows} dependencies={[search]}>
                {(row: Row) => (
                  <GridListItem
                    id={row.id}
                    // Mirrors `id` onto the DOM (react-aria strips `id` from the rendered
                    // element) so the $revealEntity scroll-into-view effect can find this row.
                    data-asset-key={row.id}
                    textValue={row.name}
                    // Records a Shift+click before react-aria's own (anchorless, and so
                    // useless) range extension runs — see useShiftRangeSelect.
                    {...range.rowProps(row.id)}
                    // Right-click opens the same menu as the ⋮ button by triggering
                    // a click on it — reusing react-aria's trigger so positioning and
                    // dismissal behave identically.
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.currentTarget
                        .querySelector<HTMLButtonElement>('button[aria-label="Asset options"]')
                        ?.click();
                    }}
                    className={(rp) => cn(gridRowClass(rp), row.hidden && 'opacity-40')}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={`truncate text-sm${row.kind === 'connector' ? ' font-mono' : ''}`}
                      >
                        {row.name}
                      </span>
                      <span className="truncate text-xs text-fg-subtle">{row.sub}</span>
                    </div>
                    <AssetRowMenu row={row} />
                  </GridListItem>
                )}
              </Collection>
            </GridListSection>
          )}
        </GridList>
      </div>
    </div>
  );
}

/** Routes to the kind-specific row menu. */
function AssetRowMenu({ row }: { row: Row }) {
  if (row.kind === 'subpart') return <SubPartRowMenu index={row.index} />;
  return <SimpleRowMenu row={row} />;
}

/**
 * "Change Layer" submenu — the shared surface for every kind that lives on an ordinary
 * layer (SubParts, connectors, colliders). The entity-only built-in layers (IVA seats,
 * lights, kittens) are filtered out because nothing else may live there, and the row's
 * own layer is disabled.
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
 * Per-row menu for a placed SubPart: Duplicate, Manage Textures (custom meshes
 * only), Manage Tanks, Interior (IVA only), Change Layer, and Delete (confirmed).
 *
 * Every item acts on THIS row by index, independent of the multi-selection —
 * with ONE exception: `Interior (IVA only)` applies to the whole SubPart
 * selection when this row is part of it (and says so in its label), because
 * KSA's `<Internal>` is per-TEMPLATE, so a bulk toggle is what it is for.
 */
function SubPartRowMenu({ index }: { index: number }) {
  const part = useStore($part);
  const selected = useStore($selectedIndices);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [managingTanks, setManagingTanks] = useState(false);
  const placement = part.placements[index];
  if (!placement) return null;
  const customMesh = part.customMeshes.find((m) => m.subPartId === placement.subPartTemplateId);

  // The one multi-selection-aware item: this row alone unless it is part of the current
  // SubPart selection, in which case the whole selection (see the docstring).
  const internalTargets = selected.includes(index) ? selected : [index];
  const internalTemplateIds = [
    ...new Set(
      internalTargets.flatMap((i) => {
        const p = part.placements[i];
        return p ? [p.subPartTemplateId] : [];
      }),
    ),
  ];
  // KSA's <PartModelGlass> has no <Internal> field, so the flag would be silently ignored.
  const glassOnly =
    internalTemplateIds.length > 0 && internalTemplateIds.every((id) => isGlassTemplate(part, id));

  return (
    <>
      <MenuTrigger>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          aria-label="Asset options"
          className="shrink-0"
          // Keep the GridList row from treating the menu click as a row press.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" />
        </Button>
        <Popover placement="bottom end" className="w-48">
          <Menu>
            <MenuItem onAction={() => duplicatePlacement(index)}>Duplicate</MenuItem>
            {customMesh && (
              <MenuItem onAction={() => setManagingMeshId(customMesh.id)}>
                {/* An imported SubPart has no per-face texture grid — one glTF primitive means
                    one KSA material — so the panel it opens is a material/glow panel. */}
                {meshKind(customMesh) === 'imported' ? 'Manage Material' : 'Manage Textures'}
              </MenuItem>
            )}
            <MenuItem onAction={() => setManagingTanks(true)}>SubPart Data</MenuItem>
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
            <ChangeLayerItem kind="subpart" index={index} layerId={placement.layerId} />
            <MenuItem variant="danger" onAction={() => setConfirmDelete(true)}>
              Delete
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>

      {managingTanks && (
        <ManageTanksModal
          subPartTemplateId={placement.subPartTemplateId}
          onClose={() => setManagingTanks(false)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete SubPart"
        text={`Delete "${placement.instanceId}"?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => removePlacement(index)}
      />
    </>
  );
}

/**
 * Per-row menu for a connector, collider, IVA seat, light or kitten: Duplicate +
 * Delete, plus Change Layer for the two kinds that live on ordinary layers. Duplicate
 * and Delete act via the shared selection-based store actions (which branch by kind),
 * so the row is selected first — natural for a single-row action.
 */
function SimpleRowMenu({ row }: { row: Row }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const part = useStore($part);
  // Only connectors and colliders can change layer; the rest are pinned to their own.
  const layerable: LayerableKind | null =
    row.kind === 'connector' ? 'connector' : row.kind === 'collider' ? 'collider' : null;
  const rowLayerId =
    row.kind === 'connector'
      ? part.connectors[row.index]?.layerId
      : row.kind === 'collider'
        ? part.colliders[row.index]?.layerId
        : undefined;
  const label =
    row.kind === 'connector'
      ? 'connector'
      : row.kind === 'collider'
        ? 'collider'
        : row.kind === 'ivaSeat'
          ? 'IVA seat'
          : row.kind === 'light'
            ? 'light'
            : 'kitten';
  const select = () =>
    row.kind === 'connector'
      ? selectConnector(row.index)
      : row.kind === 'collider'
        ? selectCollider(row.index)
        : row.kind === 'ivaSeat'
          ? selectIvaSeat(row.index)
          : row.kind === 'light'
            ? selectLight(row.index)
            : selectKitten(row.index);

  return (
    <>
      <MenuTrigger>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          aria-label="Asset options"
          className="shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" />
        </Button>
        <Popover placement="bottom end" className="w-48">
          <Menu>
            {/* Seats only: put the camera at this eye point (see SeatViewBar). Selecting
                first keeps the inspector on the seat you are sitting in. */}
            {row.kind === 'ivaSeat' && (
              <MenuItem
                onAction={() => {
                  const seat = part.ivaSeats[row.index];
                  if (!seat) return;
                  select();
                  enterSeatView(seat.id);
                }}
              >
                Sit in this seat
              </MenuItem>
            )}
            <MenuItem
              onAction={() => {
                select();
                duplicateSelected();
              }}
            >
              Duplicate
            </MenuItem>
            {layerable && rowLayerId != null && (
              <ChangeLayerItem kind={layerable} index={row.index} layerId={rowLayerId} />
            )}
            <MenuItem variant="danger" onAction={() => setConfirmDelete(true)}>
              Delete
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${label}`}
        text={`Delete "${row.name}"?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          select();
          removeSelected();
        }}
      />
    </>
  );
}
