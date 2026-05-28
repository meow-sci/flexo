import { useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  Button as DragButton,
  GridList,
  GridListItem,
  useDragAndDrop,
  type Selection,
} from 'react-aria-components'
import {
  Button,
  Chip,
  ConfirmDialog,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  ListBoxItem,
  Tooltip,
  SectionTitle,
} from './kit'
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

const rowClass = ({ isSelected, isFocusVisible }: { isSelected: boolean; isFocusVisible: boolean }) =>
  [
    'flex min-w-0 cursor-default select-none items-center gap-1 rounded-md px-2 py-1 text-fg outline-none',
    isSelected ? 'bg-white/[0.08] ring-2 ring-inset ring-accent' : 'hover:bg-white/[0.06]',
    isFocusVisible && !isSelected ? 'ring-1 ring-inset ring-accent' : '',
  ].join(' ')

/**
 * The layers list shown inside the Layers popover. A react-aria GridList so each
 * row can embed interactive controls — inline rename, eye/lock toggles, select-all,
 * delete. The single selection IS the active layer (new items land there), with
 * drag-and-drop reorder. Visibility/lock are persisted view state; creation/
 * rename/reorder/delete mutate the document and are undoable.
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
      <SectionTitle>Layers</SectionTitle>
      <div className="flex items-center gap-1">
        <TextField
          size="sm"
          aria-label="New layer name"
          className="min-w-0 flex-1"
          value={newName}
          onChange={setNewName}
          placeholder="New layer name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') createFromInput()
          }}
        />
        <Button size="sm" onPress={createFromInput} isDisabled={!newName.trim()}>
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
        dependencies={[editingId]}
        className="flex max-h-[50vh] flex-col gap-0.5 overflow-auto outline-none"
      >
        {(summary: LayerSummary) => (
          <GridListItem id={summary.layer.id} textValue={summary.layer.name} className={rowClass}>
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

  // Stops react-aria's row press from firing when interacting with row controls.
  const stopRowPress = (e: React.PointerEvent) => e.stopPropagation()

  return (
    <>
      <DragButton
        slot="drag"
        className="flex shrink-0 cursor-grab items-center text-fg-subtle outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
        aria-label="Drag to reorder layer"
      >
        <GripVerticalIcon />
      </DragButton>
      {isEditing ? (
        <div className="min-w-0 flex-1" onPointerDown={stopRowPress}>
          <RenameInput layer={layer} onDone={onEndRename} />
        </div>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm" title="Double-click to rename" onDoubleClick={onStartRename}>
          {layer.name}
        </span>
      )}

      <Chip className="shrink-0" title={`${subParts} SubParts, ${connectors} connectors`}>
        {total}
      </Chip>

      <div className="flex shrink-0 items-center gap-0.5" onPointerDown={stopRowPress}>
        {!isEditing && (
          <Tooltip content="Rename layer">
            <Button iconOnly size="sm" variant="ghost" aria-label="Rename layer" onPress={onStartRename}>
              <PencilIcon />
            </Button>
          </Tooltip>
        )}
        <Tooltip content={view.visible ? 'Hide layer' : 'Show layer'}>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            aria-label={view.visible ? 'Hide layer' : 'Show layer'}
            onPress={() => toggleLayerVisible(layer.id)}
          >
            {view.visible ? <EyeIcon /> : <EyeOffIcon />}
          </Button>
        </Tooltip>
        <Tooltip content={locked ? 'Unlock layer' : 'Lock layer'}>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            aria-label={locked ? 'Unlock layer' : 'Lock layer'}
            onPress={() => toggleLayerLocked(layer.id)}
          >
            {locked ? <LockIcon /> : <UnlockIcon />}
          </Button>
        </Tooltip>
        <Tooltip content={locked ? 'Layer locked' : 'Select all in layer'}>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            aria-label="Select all in layer"
            isDisabled={locked || total === 0}
            onPress={() => selectLayerEntities(layer.id)}
          >
            <SelectAllIcon />
          </Button>
        </Tooltip>
        <Tooltip content={isBuiltIn ? 'Built-in layer cannot be deleted' : 'Delete layer'}>
          <Button
            iconOnly
            size="sm"
            variant="danger-ghost"
            aria-label="Delete layer"
            isDisabled={isBuiltIn}
            onPress={onRequestDelete}
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
      <TextField
        size="sm"
        autoFocus
        aria-label="Layer name"
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
      <Tooltip content="Save name">
        <Button iconOnly size="sm" variant="ghost" aria-label="Save name" onPress={commit}>
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

  return (
    <ConfirmDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Delete layer “${layer.name}”`}
      text={
        total === 0
          ? 'This layer is empty.'
          : `This layer has ${subParts} SubPart${subParts === 1 ? '' : 's'} and ${connectors} connector${connectors === 1 ? '' : 's'}.`
      }
      confirmLabel="Delete layer"
      confirmVariant="danger"
      onConfirm={() => deleteLayer(layer.id, { mode, targetLayerId: targetId })}
    >
      {total > 0 && (
        <div className="flex flex-col gap-3">
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[mode]}
            onSelectionChange={(keys) => {
              const next = [...keys][0]
              if (next) setMode(next as DeleteLayerOptions['mode'])
            }}
          >
            <ToggleButton id="move-items" size="sm">
              Move items
            </ToggleButton>
            <ToggleButton id="delete-items" size="sm">
              Delete items
            </ToggleButton>
          </ToggleButtonGroup>

          {mode === 'move-items' ? (
            <label className="flex items-center justify-between gap-2 text-sm text-fg-muted">
              <span>Move items to</span>
              <Select
                size="sm"
                aria-label="Move items to layer"
                selectedKey={targetId}
                onSelectionChange={(k) => setTargetId(String(k))}
                items={others}
              >
                {(l) => (
                  <ListBoxItem id={l.id} textValue={l.name}>
                    {l.name}
                  </ListBoxItem>
                )}
              </Select>
            </label>
          ) : (
            <span className="text-sm text-fg-subtle">
              The {total} item{total === 1 ? '' : 's'} in this layer will be permanently removed.
            </span>
          )}
        </div>
      )}
    </ConfirmDialog>
  )
}
