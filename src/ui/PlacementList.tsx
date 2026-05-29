import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { GridList, GridListItem, type Selection } from 'react-aria-components'
import { MoreVertical } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  MenuTrigger,
  Menu,
  MenuItem,
  SubmenuTrigger,
  Popover,
} from './kit'
import {
  $activeLayerId,
  $part,
  $selectedConnectorIndices,
  $selectedIndices,
  duplicateSelected,
  movePlacementToLayer,
  removePlacement,
  removeSelected,
  setSelectedConnectors,
  setSelectedPlacements,
} from '../state/editorStore'
import { CONNECTOR_LAYER_ID, type SubPartPlacement } from '../ksa/types'

const rowClass = ({ isSelected, isFocusVisible }: { isSelected: boolean; isFocusVisible: boolean }) =>
  [
    'flex cursor-default select-none items-center gap-1 rounded-md px-2 py-1 text-fg outline-none',
    isSelected ? 'bg-white/[0.08] ring-2 ring-inset ring-accent' : 'hover:bg-white/[0.06]',
    isFocusVisible && !isSelected ? 'ring-1 ring-inset ring-accent' : '',
  ].join(' ')

/**
 * Lists the placed SubPart instances and connectors. The SubPart list is a
 * react-aria GridList supporting multi-select, kept in sync with 3D selection via
 * the shared store. Each row embeds a per-row menu (Delete / Change Layer).
 * Connectors are a single-select GridList. The top Delete / Duplicate buttons
 * act on the current selection.
 */
export function PlacementList() {
  const part = useStore($part)
  const selectedIndices = useStore($selectedIndices)
  const selectedConIndices = useStore($selectedConnectorIndices)
  const activeLayerId = useStore($activeLayerId)
  const hasSelection = selectedIndices.length > 0 || selectedConIndices.length > 0

  const items = useMemo(
    () =>
      part.placements
        .map((placement, index) => ({ id: placement.instanceId, index, placement }))
        .filter((item) => item.placement.layerId === activeLayerId),
    [part.placements, activeLayerId],
  )
  const indexByInstanceId = useMemo(
    () => new Map(part.placements.map((p, i) => [p.instanceId, i])),
    [part.placements],
  )
  const selectedKeys = useMemo<Selection>(
    () => new Set(selectedIndices.flatMap((i) => (part.placements[i] ? [part.placements[i].instanceId] : []))),
    [selectedIndices, part.placements],
  )

  const connectorItems = useMemo(
    () =>
      part.connectors
        .map((connector, index) => ({ id: connector.id, connector, index }))
        .filter(({ connector }) => connector.layerId === activeLayerId),
    [part.connectors, activeLayerId],
  )
  const connectorSelectedKeys = useMemo<Selection>(
    () => new Set(selectedConIndices.flatMap((i) => (part.connectors[i] ? [part.connectors[i].id] : []))),
    [selectedConIndices, part.connectors],
  )

  const onConnectorSelectionChange = (keys: Selection) => {
    if (keys === 'all') {
      setSelectedConnectors(connectorItems.map((item) => item.index))
      return
    }
    setSelectedConnectors(
      [...keys].flatMap((key) => {
        const i = part.connectors.findIndex((c) => c.id === String(key))
        return i >= 0 ? [i] : []
      }),
    )
  }

  const onSelectionChange = (keys: Selection) => {
    if (keys === 'all') {
      setSelectedPlacements(items.map((item) => item.index))
      return
    }
    setSelectedPlacements(
      [...keys].flatMap((key) => {
        const i = indexByInstanceId.get(String(key))
        return i == null ? [] : [i]
      }),
    )
  }

  const isConnectorLayer = activeLayerId === CONNECTOR_LAYER_ID
  const activeSelectedCount = isConnectorLayer
    ? selectedConIndices.length
    : items.filter((item) => selectedIndices.includes(item.index)).length
  const listCount = isConnectorLayer ? connectorItems.length : items.length
  const selectedLabel = activeSelectedCount > 0 ? ` · ${activeSelectedCount} selected` : ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 rounded-xl border border-border bg-panel p-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs uppercase tracking-wide text-fg-subtle">
          {isConnectorLayer ? 'Connectors' : 'SubParts'} ({listCount}){selectedLabel}
        </span>
        <div className="flex gap-1">
          <Button size="sm" isDisabled={!hasSelection} onPress={() => duplicateSelected()}>
            Duplicate
          </Button>
          <Button size="sm" variant="danger-ghost" isDisabled={!hasSelection} onPress={() => removeSelected()}>
            Delete
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <GridList
          aria-label="Placed SubParts"
          selectionMode="multiple"
          selectionBehavior="replace"
          items={items}
          selectedKeys={selectedKeys}
          onSelectionChange={onSelectionChange}
          renderEmptyState={() => (
            <span className="block px-1 py-1 text-sm text-fg-subtle">No SubParts placed</span>
          )}
          className="flex flex-col gap-0.5 outline-none"
        >
          {(item) => (
            <GridListItem id={item.id} textValue={item.placement.instanceId} className={rowClass}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{item.placement.instanceId}</span>
                <span className="truncate text-xs text-fg-subtle">{item.placement.subPartTemplateId}</span>
              </div>
              <SubPartMenu index={item.index} placement={item.placement} />
            </GridListItem>
          )}
        </GridList>

        {connectorItems.length > 0 && (
          <GridList
            aria-label="Connectors"
            selectionMode="multiple"
            selectionBehavior="replace"
            items={connectorItems}
            selectedKeys={connectorSelectedKeys}
            onSelectionChange={onConnectorSelectionChange}
            className="flex flex-col gap-0.5 outline-none"
          >
            {(item) => (
              <GridListItem id={item.id} textValue={item.connector.id} className={rowClass}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-sm">{item.connector.id}</span>
                  <span className="truncate text-xs text-fg-subtle">
                    {item.connector.flags.length === 0 ? 'no flags' : item.connector.flags.join(', ')}
                  </span>
                </div>
              </GridListItem>
            )}
          </GridList>
        )}
      </div>
    </div>
  )
}

/**
 * Per-row menu for a placed SubPart: a "⋮" button opening a menu with "Change
 * Layer" (a submenu of layers) and "Delete" (guarded by a confirm dialog). Acts
 * on this row's SubPart by index, independent of the multi-selection.
 */
function SubPartMenu({ index, placement }: { index: number; placement: SubPartPlacement }) {
  const part = useStore($part)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // SubParts don't belong in the built-in Connectors layer.
  const layers = part.layers.filter((l) => l.id !== CONNECTOR_LAYER_ID)

  return (
    <>
      <MenuTrigger>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          aria-label="SubPart options"
          className="shrink-0"
          // Keep the GridList row from treating the menu click as a row press.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" />
        </Button>
        <Popover placement="bottom end" className="w-44">
          <Menu>
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

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete SubPart"
        text={`Delete “${placement.instanceId}”?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => removePlacement(index)}
      />
    </>
  )
}
