import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  Collection,
  GridList,
  GridListHeader,
  GridListItem,
  GridListSection,
  type Selection,
} from 'react-aria-components'
import { MoreVertical } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  SearchField,
  SubmenuTrigger,
  cn,
  gridRowClass,
} from './kit'
import {
  $part,
  $revealEntity,
  $selectedConnectorIndices,
  $selectedIndices,
  $selectedKittenIndices,
  duplicatePlacement,
  duplicateSelected,
  movePlacementToLayer,
  removePlacement,
  removeSelected,
  selectConnector,
  selectKitten,
  setSelection,
} from '../state/editorStore'
import { $layerView, layerViewState } from '../state/layerStore'
import { CONNECTOR_LAYER_ID, KITTEN_LAYER_ID, type Layer } from '../ksa/types'
import { setManagingMeshId } from '../state/customAssetStore'
import { ManageTanksModal } from './ManageTanksModal'

/** An entity kind that can appear as a row in the Assets list. */
type Kind = 'subpart' | 'connector' | 'kitten'

/** One asset row. `index` points into the matching `$part` array for its kind. */
interface Row {
  id: string
  kind: Kind
  index: number
  name: string
  sub: string
  /** True when the row's layer is hidden — listed but not selectable (matches 3D). */
  hidden: boolean
}

/** One Assets-list section: a layer plus its (search-filtered) rows. */
interface Section {
  id: string
  layer: Layer
  rows: Row[]
  count: number
  hidden: boolean
  locked: boolean
}

const PREFIX: Record<Kind, string> = { subpart: 'sp', connector: 'con', kitten: 'kit' }
const keyOf = (kind: Kind, raw: string) => `${PREFIX[kind]}:${raw}`
function parseKey(key: string): { kind: Kind; raw: string } {
  const i = key.indexOf(':')
  const p = key.slice(0, i)
  return {
    kind: p === 'sp' ? 'subpart' : p === 'con' ? 'connector' : 'kitten',
    raw: key.slice(i + 1),
  }
}

/**
 * The unified inspector "Assets" list: one section per layer (filtered by each
 * layer's "in asset list" toggle), with normal layers listing SubParts, the
 * Connectors layer listing connectors, and the Kittens layer listing kittens.
 *
 * It is a single react-aria GridList so multi-select spans layers. Because the
 * three selection stores are mutually exclusive, row keys are kind-prefixed and
 * `onSelectionChange` collapses the resulting set to whichever kind the user just
 * touched. Rows on locked layers are disabled; rows on hidden layers stay listed
 * (so they remain manageable via the row menu) but can't be selected — mirroring
 * the 3D rule that selection works only for visible + unlocked entities.
 */
export function AssetsList() {
  const part = useStore($part)
  const layerView = useStore($layerView)
  const selSub = useStore($selectedIndices)
  const selCon = useStore($selectedConnectorIndices)
  const selKit = useStore($selectedKittenIndices)
  const reveal = useStore($revealEntity)
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fast key → store-index lookups for onSelectionChange.
  const subIdx = new Map(part.placements.map((p, i) => [p.instanceId, i]))
  const conIdx = new Map(part.connectors.map((c, i) => [c.id, i]))
  const kitIdx = new Map(part.kittens.map((k, i) => [k.id, i]))

  const q = search.trim().toLowerCase()
  const match = (...vals: string[]) => q === '' || vals.some((v) => v.toLowerCase().includes(q))
  const sections: Section[] = part.layers
    .filter((l) => layerViewState(layerView, l.id).listed)
    .map((l) => {
      const view = layerViewState(layerView, l.id)
      const hidden = !view.visible
      let rows: Row[]
      if (l.id === CONNECTOR_LAYER_ID) {
        rows = part.connectors.flatMap((c, i) =>
          c.layerId === l.id && match(c.id, ...c.flags, ...c.capabilities)
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
        )
      } else if (l.id === KITTEN_LAYER_ID) {
        rows = part.kittens.flatMap((k, i) =>
          k.layerId === l.id && match(k.id, k.kind)
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
        )
      } else {
        rows = part.placements.flatMap((p, i) =>
          p.layerId === l.id && match(p.instanceId, p.subPartTemplateId)
            ? [
                {
                  id: keyOf('subpart', p.instanceId),
                  kind: 'subpart' as const,
                  index: i,
                  name: p.instanceId,
                  sub: p.subPartTemplateId,
                  hidden,
                },
              ]
            : [],
        )
      }
      return { id: l.id, layer: l, rows, count: rows.length, hidden, locked: view.locked }
    })
    .filter((s) => s.rows.length > 0)

  // Locked-layer rows are fully disabled (non-selectable, non-focusable).
  const disabledKeys = new Set<string>()
  for (const s of sections) if (s.locked) for (const r of s.rows) disabledKeys.add(r.id)

  // Hidden-layer rows are blocked from selection but not disabled (keep their menu).
  const hiddenKeys = new Set<string>()
  for (const s of sections) if (s.hidden) for (const r of s.rows) hiddenKeys.add(r.id)

  // Controlled selection — the UNION of all three stores, so a selection can span
  // SubParts, connectors, and kittens at once (native react-aria multi-select).
  const selectedKeys = new Set<string>()
  for (const i of selSub) {
    const p = part.placements[i]
    if (p) selectedKeys.add(keyOf('subpart', p.instanceId))
  }
  for (const i of selCon) {
    const c = part.connectors[i]
    if (c) selectedKeys.add(keyOf('connector', c.id))
  }
  for (const i of selKit) {
    const k = part.kittens[i]
    if (k) selectedKeys.add(keyOf('kitten', k.id))
  }

  const onSelectionChange = (keys: Selection) => {
    const sub: number[] = []
    const con: number[] = []
    const kit: number[] = []
    if (keys === 'all') {
      // Select-all (Cmd/Ctrl+A): every enabled (visible + unlocked) row, all kinds.
      for (const s of sections) {
        if (s.locked || s.hidden) continue
        for (const r of s.rows) {
          if (r.kind === 'subpart') sub.push(r.index)
          else if (r.kind === 'connector') con.push(r.index)
          else kit.push(r.index)
        }
      }
      setSelection(sub, con, kit)
      return
    }
    const next = new Set([...keys].map(String))
    // Clicking a hidden-layer row may not select it (matches the 3D visible rule);
    // ignore the event so the current selection is preserved.
    const added = [...next].find((id) => !selectedKeys.has(id))
    if (added != null && hiddenKeys.has(added)) return
    // Partition the (possibly cross-kind) key set into the three stores; drop any
    // hidden-layer rows that a range selection may have swept in.
    for (const id of next) {
      if (hiddenKeys.has(id)) continue
      const { kind, raw } = parseKey(id)
      if (kind === 'subpart') {
        const i = subIdx.get(raw)
        if (i != null) sub.push(i)
      } else if (kind === 'connector') {
        const i = conIdx.get(raw)
        if (i != null) con.push(i)
      } else {
        const i = kitIdx.get(raw)
        if (i != null) kit.push(i)
      }
    }
    setSelection(sub, con, kit)
  }

  // A 3D-viewport click can't tell the list to scroll; it signals via $revealEntity
  // instead. When that fires, scroll the matching row into view (no-op if filtered
  // out by search), then consume the signal so it doesn't re-trigger on later renders.
  useEffect(() => {
    if (!reveal) return
    const key = keyOf(reveal.kind, reveal.id)
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-asset-key="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
    $revealEntity.set(null)
  }, [reveal])

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
                    // Right-click opens the same menu as the ⋮ button by triggering
                    // a click on it — reusing react-aria's trigger so positioning and
                    // dismissal behave identically.
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.currentTarget
                        .querySelector<HTMLButtonElement>('button[aria-label="Asset options"]')
                        ?.click()
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
  )
}

/** Routes to the kind-specific row menu. */
function AssetRowMenu({ row }: { row: Row }) {
  if (row.kind === 'subpart') return <SubPartRowMenu index={row.index} />
  return <SimpleRowMenu row={row} />
}

/**
 * Per-row menu for a placed SubPart: Duplicate, Manage Textures (custom meshes
 * only), Manage Tanks, Change Layer (a submenu of layers, excluding the special
 * Connectors/Kittens layers SubParts can't live on), and Delete (confirmed).
 * Acts on this row by index, independent of the multi-selection.
 */
function SubPartRowMenu({ index }: { index: number }) {
  const part = useStore($part)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [managingTanks, setManagingTanks] = useState(false)
  const placement = part.placements[index]
  if (!placement) return null
  const layers = part.layers.filter((l) => l.id !== CONNECTOR_LAYER_ID && l.id !== KITTEN_LAYER_ID)
  const customMesh = part.customMeshes.find((m) => m.subPartId === placement.subPartTemplateId)

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
              <MenuItem onAction={() => setManagingMeshId(customMesh.id)}>Manage Textures</MenuItem>
            )}
            <MenuItem onAction={() => setManagingTanks(true)}>SubPart Data</MenuItem>
            <SubmenuTrigger>
              <MenuItem>Change Layer</MenuItem>
              <Popover className="w-44">
                <Menu
                  disabledKeys={[placement.layerId]}
                  onAction={(key) => movePlacementToLayer(index, String(key))}
                >
                  {layers.map((l) => (
                    <MenuItem key={l.id} id={l.id}>
                      {l.name}
                    </MenuItem>
                  ))}
                </Menu>
              </Popover>
            </SubmenuTrigger>
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
  )
}

/**
 * Per-row menu for a connector or kitten: Duplicate + Delete. These act via the
 * shared selection-based store actions (which branch by kind), so the row is
 * selected first — natural for a single-row action.
 */
function SimpleRowMenu({ row }: { row: Row }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const label = row.kind === 'connector' ? 'connector' : 'kitten'
  const select = () =>
    row.kind === 'connector' ? selectConnector(row.index) : selectKitten(row.index)

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
            <MenuItem
              onAction={() => {
                select()
                duplicateSelected()
              }}
            >
              Duplicate
            </MenuItem>
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
          select()
          removeSelected()
        }}
      />
    </>
  )
}
