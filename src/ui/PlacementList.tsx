import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { GridList, GridListItem, type Selection } from 'react-aria-components'
import { ChevronRight, MoreVertical } from 'lucide-react'
import { Button, Dialog, List, ListButton, Popover, PopoverRoot, PopoverTrigger, Surface } from '@cladd-ui/react'
import {
  $activeLayerId,
  $part,
  $selectedConnectorIndex,
  $selectedIndices,
  duplicateSelected,
  movePlacementToLayer,
  removePlacement,
  removeSelected,
  selectConnector,
  setSelectedPlacements,
} from '../state/editorStore'
import { CONNECTOR_LAYER_ID, type SubPartPlacement } from '../ksa/types'

/**
 * Lists the placed SubPart instances and connectors. The SubPart list is a
 * react-aria GridList supporting multi-select (click to replace, Ctrl/Cmd to
 * toggle, Shift to range-select), kept in sync with 3D selection via the shared
 * store. GridList (rather than ListBox) is used so each row can embed interactive
 * controls — here a per-row context menu (Delete / Change Layer). Connectors
 * remain a single-select cladd list. The top Delete / Duplicate buttons act on
 * the current selection (all selected SubParts, or the selected connector).
 */
export function PlacementList() {
  const part = useStore($part)
  const selectedIndices = useStore($selectedIndices)
  const selectedCon = useStore($selectedConnectorIndex)
  const activeLayerId = useStore($activeLayerId)
  const hasSelection = selectedIndices.length > 0 || selectedCon >= 0

  // GridList items need a stable `id`; SubPart placements key on `instanceId`.
  // Only show placements belonging to the active layer, but preserve real indices
  // into part.placements so selection/deletion/etc still address the right element.
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

  // Connectors filtered to the active layer (only non-empty when the Connectors layer is active).
  const connectorItems = useMemo(
    () =>
      part.connectors
        .map((connector, index) => ({ connector, index }))
        .filter(({ connector }) => connector.layerId === activeLayerId),
    [part.connectors, activeLayerId],
  )

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

  const activeSelectedCount = items.filter((item) => selectedIndices.includes(item.index)).length
  const selectedLabel = activeSelectedCount > 0 ? ` · ${activeSelectedCount} selected` : ''

  return (
    <Surface outline className="flex h-full min-h-0 flex-col rounded-xl" contentClassName="flex min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs uppercase tracking-wide text-cladd-fg-softer">
          Placed ({items.length}){selectedLabel}
        </span>
        <div className="flex gap-1">
          <Button size="xs" disabled={!hasSelection} onClick={() => duplicateSelected()}>
            Duplicate
          </Button>
          <Button size="xs" color="red" disabled={!hasSelection} onClick={() => removeSelected()}>
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
            <span className="block px-1 py-1 text-sm text-cladd-fg-softer">No SubParts placed</span>
          )}
          className="flex flex-col gap-0.5 outline-none"
        >
          {(item) => (
            <GridListItem
              id={item.id}
              textValue={item.placement.instanceId}
              className={({ isSelected, isFocusVisible }) =>
                [
                  'flex cursor-default select-none items-center gap-1 rounded-md px-2 py-1 text-cladd-fg outline-none',
                  isSelected
                    ? 'bg-cladd-surface-press ring-2 ring-inset ring-cladd-primary'
                    : 'hover:bg-cladd-surface-hover',
                  isFocusVisible && !isSelected ? 'ring-1 ring-inset ring-cladd-primary' : '',
                ].join(' ')
              }
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{item.placement.instanceId}</span>
                <span className="truncate text-xs opacity-70">{item.placement.subPartTemplateId}</span>
              </div>
              <SubPartMenu index={item.index} placement={item.placement} />
            </GridListItem>
          )}
        </GridList>

        {connectorItems.length > 0 && (
          <>
            <span className="mt-2 block px-1 text-xs uppercase tracking-wide text-cladd-fg-softer">
              Connectors ({connectorItems.length})
            </span>
            <List>
              {connectorItems.map(({ connector, index }) => (
                <ListButton
                  key={connector.id}
                  size="sm"
                  selected={index === selectedCon}
                  color="brand"
                  onClick={() => selectConnector(index)}
                  footer={connector.flags === 'None' ? 'no flags' : connector.flags}
                >
                  <span className="truncate font-mono">{connector.id}</span>
                </ListButton>
              ))}
            </List>
          </>
        )}
      </div>
    </Surface>
  )
}

/**
 * Per-row context menu for a placed SubPart: a "⋮" button opening a popover with
 * "Change Layer" (a submenu of layer buttons) and "Delete" (guarded by a confirm
 * dialog). Acts on this row's SubPart by index, independent of the multi-selection.
 */
function SubPartMenu({ index, placement }: { index: number; placement: SubPartPlacement }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <>
      <PopoverRoot open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger>
          <Button
            square
            size="xs"
            variant="transparent"
            aria-label="SubPart options"
            className="shrink-0"
            // Keep the GridList row from treating the menu click as a row press.
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreVertical className="size-4" />
          </Button>
        </PopoverTrigger>
        <Popover position="bottom-end" className="w-44 rounded-lg" contentClassName="p-1">
          <div className="flex flex-col gap-0.5">
            <ChangeLayerSubmenu
              index={index}
              currentLayerId={placement.layerId}
              onMoved={() => setMenuOpen(false)}
            />
            <Button
              size="sm"
              color="red"
              variant="transparent"
              className="justify-start"
              onClick={() => {
                setMenuOpen(false)
                setConfirmDelete(true)
              }}
            >
              Delete
            </Button>
          </div>
        </Popover>
      </PopoverRoot>

      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(false)
        }}
        title="Delete SubPart"
        text={`Delete “${placement.instanceId}”?`}
        cancelButtonText="Cancel"
        confirmButtonText="Delete"
        confirmButtonColor="red"
        onConfirm={() => {
          removePlacement(index)
          setConfirmDelete(false)
        }}
      />
    </>
  )
}

/** "Change Layer" entry that opens a nested popover of layer buttons. */
function ChangeLayerSubmenu({
  index,
  currentLayerId,
  onMoved,
}: {
  index: number
  currentLayerId: string
  onMoved: () => void
}) {
  const part = useStore($part)
  const [open, setOpen] = useState(false)
  // SubParts don't belong in the built-in Connectors layer.
  const layers = part.layers.filter((l) => l.id !== CONNECTOR_LAYER_ID)

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button size="sm" variant="transparent" className="w-full justify-between">
          Change Layer
          <ChevronRight className="size-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <Popover position="right-start" offset={4} className="w-44 rounded-lg" contentClassName="p-1">
        <div className="flex flex-col gap-0.5">
          {layers.map((l) => (
            <Button
              key={l.id}
              size="sm"
              variant="transparent"
              className="justify-start"
              disabled={l.id === currentLayerId}
              onClick={() => {
                movePlacementToLayer(index, l.id)
                setOpen(false)
                onMoved()
              }}
            >
              {l.name}
            </Button>
          ))}
        </div>
      </Popover>
    </PopoverRoot>
  )
}
