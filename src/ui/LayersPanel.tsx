import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Button as DragButton, GridList, GridListItem, useDragAndDrop, type Selection } from 'react-aria-components'
import { Button, Chip, Dialog, Input, ListTitle, Segmented, SegmentedButton, Select, Tooltip } from '@cladd-ui/react'
import {
  $activeLayerId,
  createLayer,
  deleteLayer,
  renameLayer,
  reorderLayers,
  selectLayerEntities,
  setActiveLayer,
  type DeleteLayerOptions,
} from '../state/editorStore'
import { $layerView, layerViewState, toggleLayerLocked, toggleLayerVisible } from '../state/layerStore'
import { $layerSummaries, type LayerSummary } from '../state/selectors'
import { BUILT_IN_LAYER_IDS, DEFAULT_LAYER_ID, type Layer } from '../ksa/types'
import { EyeIcon, EyeOffIcon, GripVerticalIcon, LockIcon, PencilIcon, SaveIcon, SelectAllIcon, TrashIcon, UnlockIcon } from './layerIcons'

/** Moves the dragged keys to before/after the target id within `ids`. */
function computeReorder(
  ids: readonly string[],
  movingKeys: Set<string>,
  targetId: string,
  position: 'before' | 'after',
): string[] {
  const moving = ids.filter((id) => movingKeys.has(id))
  const rest = ids.filter((id) => !movingKeys.has(id))
  const idx = rest.indexOf(targetId)
  if (idx < 0) return [...ids]
  const insertAt = position === 'before' ? idx : idx + 1
  return [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)]
}

/**
 * The layers list shown inside the sidebar's Layers popover. A react-aria
 * GridList (rather than ListBox) so each row can embed interactive controls —
 * an inline rename input, eye/lock toggles, "select all", and delete. The single
 * selection IS the active layer (new items land there), with drag-and-drop
 * reorder. Each row carries a SubPart+connector count chip; delete is disabled
 * for the built-in Default layer. Visibility/lock are persisted view state
 * (layerStore); creation/rename/reorder/delete mutate the document and are
 * undoable (editorStore).
 */
export function LayersPanel({ onLayerSelected }: { onLayerSelected?: () => void } = {}) {
  const summaries = useStore($layerSummaries)
  const activeId = useStore($activeLayerId)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const orderedIds = summaries.map((s) => s.layer.id)

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder(e) {
      const position = e.target.dropPosition === 'before' ? 'before' : 'after'
      const keys = new Set([...e.keys].map(String))
      reorderLayers(computeReorder(orderedIds, keys, String(e.target.key), position))
    },
  })

  const onSelectionChange = (keys: Selection) => {
    if (keys === 'all') return
    const [first] = [...keys]
    if (first != null) {
      setActiveLayer(String(first))
      onLayerSelected?.()
    }
  }

  const createFromInput = () => {
    if (!newName.trim()) return
    createLayer(newName)
    setNewName('')
  }

  const pendingLayer = summaries.find((s) => s.layer.id === pendingDeleteId)

  return (
    <div className="flex w-full flex-col gap-2">
      <ListTitle>Layers</ListTitle>
      <div className="flex items-center gap-1">
        <Input
          size="sm"
          className="min-w-0 flex-1"
          value={newName}
          onChange={setNewName}
          placeholder="New layer name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') createFromInput()
          }}
        />
        <Button size="sm" onClick={createFromInput} disabled={!newName.trim()}>
          Add
        </Button>
      </div>

      <GridList
        aria-label="Layers"
        selectionMode="single"
        selectionBehavior="replace"
        disallowEmptySelection
        items={summaries}
        selectedKeys={new Set([activeId])}
        onSelectionChange={onSelectionChange}
        dragAndDropHooks={dragAndDropHooks}
        // editingId is read by the row render fn but isn't part of `items`, so the
        // collection cache must be invalidated explicitly when it changes.
        dependencies={[editingId]}
        className="flex max-h-[50vh] flex-col gap-0.5 overflow-auto outline-none"
      >
        {(summary: LayerSummary) => (
          <GridListItem
            id={summary.layer.id}
            textValue={summary.layer.name}
            className={({ isSelected, isFocusVisible }) =>
              [
                'flex min-w-0 cursor-default select-none items-center gap-1 rounded-md px-2 py-1 text-cladd-fg outline-none',
                // Keep text/icons in the normal foreground (so the transparent icon
                // buttons stay legible); mark the active layer with a soft fill + ring.
                isSelected ? 'bg-cladd-surface-press ring-2 ring-inset ring-cladd-primary' : 'hover:bg-cladd-surface-hover',
                isFocusVisible && !isSelected ? 'ring-1 ring-inset ring-cladd-primary' : '',
              ].join(' ')
            }
          >
            <LayerRow
              summary={summary}
              isEditing={editingId === summary.layer.id}
              onStartRename={() => setEditingId(summary.layer.id)}
              onEndRename={() => setEditingId(null)}
              onRequestDelete={() => setPendingDeleteId(summary.layer.id)}
            />
          </GridListItem>
        )}
      </GridList>

      {pendingLayer && (
        <DeleteLayerDialog
          summary={pendingLayer}
          others={summaries.map((s) => s.layer).filter((l) => l.id !== pendingLayer.layer.id)}
          onClose={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  )
}

function LayerRow({
  summary,
  isEditing,
  onStartRename,
  onEndRename,
  onRequestDelete,
}: {
  summary: LayerSummary
  isEditing: boolean
  onStartRename: () => void
  onEndRename: () => void
  onRequestDelete: () => void
}) {
  const { layer, subParts, connectors } = summary
  const total = subParts + connectors
  const layerView = useStore($layerView)
  const view = layerViewState(layerView, layer.id)
  const locked = view.locked
  const isBuiltIn = BUILT_IN_LAYER_IDS.includes(layer.id)

  // Stops react-aria's row press (pointerdown-based) from firing when the user
  // interacts with the row's controls, so they don't change the active layer.
  const stopRowPress = (e: React.PointerEvent) => e.stopPropagation()

  return (
    <>
      <DragButton
        slot="drag"
        className="flex shrink-0 cursor-grab items-center text-cladd-fg-softer outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cladd-primary"
        aria-label="Drag to reorder layer"
      >
        <GripVerticalIcon />
      </DragButton>
      {isEditing ? (
        <div className="min-w-0 flex-1" onPointerDown={stopRowPress}>
          <RenameInput layer={layer} onDone={onEndRename} />
        </div>
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-sm"
          title="Double-click to rename"
          onDoubleClick={onStartRename}
        >
          {layer.name}
        </span>
      )}

      <Chip size="md" className="shrink-0 opacity-80" title={`${subParts} SubParts, ${connectors} connectors`}>
        {total}
      </Chip>

      <div className="flex shrink-0 items-center gap-1" onPointerDown={stopRowPress}>
        {!isEditing && (
          <Tooltip tooltip="Rename layer">
            <Button
              square
              size="sm"
              variant="transparent"
              aria-label="Rename layer"
              onClick={onStartRename}
            >
              <PencilIcon />
            </Button>
          </Tooltip>
        )}
        <Tooltip tooltip={view.visible ? 'Hide layer' : 'Show layer'}>
          <Button
            square
            size="sm"
            variant="transparent"
            aria-label={view.visible ? 'Hide layer' : 'Show layer'}
            onClick={() => toggleLayerVisible(layer.id)}
          >
            {view.visible ? <EyeIcon /> : <EyeOffIcon />}
          </Button>
        </Tooltip>
        <Tooltip tooltip={locked ? 'Unlock layer' : 'Lock layer'}>
          <Button
            square
            size="sm"
            variant="transparent"
            aria-label={locked ? 'Unlock layer' : 'Lock layer'}
            onClick={() => toggleLayerLocked(layer.id)}
          >
            {locked ? <LockIcon /> : <UnlockIcon />}
          </Button>
        </Tooltip>
        <Tooltip tooltip={locked ? 'Layer locked' : 'Select all in layer'}>
          <Button
            square
            size="sm"
            variant="transparent"
            aria-label="Select all in layer"
            disabled={locked || total === 0}
            onClick={() => selectLayerEntities(layer.id)}
          >
            <SelectAllIcon />
          </Button>
        </Tooltip>
        <Tooltip tooltip={isBuiltIn ? 'Built-in layer cannot be deleted' : 'Delete layer'}>
          <Button
            square
            size="sm"
            variant="transparent"
            color="red"
            aria-label="Delete layer"
            disabled={isBuiltIn}
            onClick={onRequestDelete}
          >
            <TrashIcon />
          </Button>
        </Tooltip>
      </div>
    </>
  )
}

function RenameInput({ layer, onDone }: { layer: Layer; onDone: () => void }) {
  const [draft, setDraft] = useState(layer.name)
  const commit = () => {
    renameLayer(layer.id, draft)
    onDone()
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        size="sm"
        autoFocus
        className="min-w-0 flex-1"
        value={draft}
        onChange={setDraft}
        // Keep grid typeahead/selection keys from stealing the keystrokes.
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') onDone()
        }}
      />
      <Tooltip tooltip="Save name">
        <Button square size="xs" variant="transparent" aria-label="Save name" onClick={commit}>
          <SaveIcon />
        </Button>
      </Tooltip>
    </div>
  )
}

function DeleteLayerDialog({
  summary,
  others,
  onClose,
}: {
  summary: LayerSummary
  others: Layer[]
  onClose: () => void
}) {
  const { layer, subParts, connectors } = summary
  const total = subParts + connectors
  const [mode, setMode] = useState<DeleteLayerOptions['mode']>('move-items')
  const [targetId, setTargetId] = useState(others[0]?.id ?? DEFAULT_LAYER_ID)
  const targetLayer = others.find((l) => l.id === targetId) ?? others[0]

  const confirm = () => {
    deleteLayer(layer.id, { mode, targetLayerId: targetId })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={`Delete layer “${layer.name}”`}
      text={
        total === 0
          ? 'This layer is empty.'
          : `This layer has ${subParts} SubPart${subParts === 1 ? '' : 's'} and ${connectors} connector${connectors === 1 ? '' : 's'}.`
      }
      cancelButtonText="Cancel"
      confirmButtonText="Delete layer"
      confirmButtonColor="red"
      onConfirm={confirm}
    >
      {total > 0 && (
        <div className="flex flex-col gap-3">
          <Segmented>
            <SegmentedButton active={mode === 'move-items'} onClick={() => setMode('move-items')}>
              Move items
            </SegmentedButton>
            <SegmentedButton active={mode === 'delete-items'} onClick={() => setMode('delete-items')}>
              Delete items
            </SegmentedButton>
          </Segmented>

          {mode === 'move-items' ? (
            <label className="flex items-center justify-between gap-2 text-cladd-sm text-cladd-fg-soft">
              <span>Move items to</span>
              <Select
                size="sm"
                options={others}
                value={targetId}
                getOptionValue={(l) => l.id}
                onChange={(v) => setTargetId(v as string)}
                renderOption={({ value }) => value.name}
              >
                {targetLayer?.name}
              </Select>
            </label>
          ) : (
            <span className="text-cladd-sm text-cladd-fg-softer">
              The {total} item{total === 1 ? '' : 's'} in this layer will be permanently removed.
            </span>
          )}
        </div>
      )}
    </Dialog>
  )
}
