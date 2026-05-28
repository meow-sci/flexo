import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Layers } from 'lucide-react'
import {
  Toolbar,
  Button,
  MenuTrigger,
  Menu,
  MenuItem,
  Popover,
  ConfirmDialog,
} from './kit'
import {
  $part,
  $selectedIndices,
  moveSelectedPlacementsToLayer,
  removeSelected,
} from '../state/editorStore'
import { $hasMultiSelection } from '../state/selectors'
import { CONNECTOR_LAYER_ID } from '../ksa/types'

/**
 * Floating toolbar stacked beneath {@link SelectionToolbar}, shown only when more
 * than one entity is selected. Holds actions that are specific to a multi-selection
 * (bulk layer move, bulk delete) and act on the whole selection at once.
 */
export function MultiSelectToolbar() {
  const hasMultiSelection = useStore($hasMultiSelection)
  const count = useStore($selectedIndices).length

  if (!hasMultiSelection) return null

  return (
    <Toolbar aria-label="Multi-selection actions">
      <ChangeLayerButton />
      <DeleteAllButton count={count} />
    </Toolbar>
  )
}

/** "Change Layer" menu: picks a destination layer for the whole selection. */
function ChangeLayerButton() {
  const part = useStore($part)
  // SubParts never belong to the built-in Connectors layer.
  const layers = part.layers.filter((l) => l.id !== CONNECTOR_LAYER_ID)

  return (
    <MenuTrigger>
      <Button size="sm">
        <Layers className="size-4" />
        Change Layer
      </Button>
      <Popover placement="bottom start" className="w-48">
        <Menu onAction={(key) => moveSelectedPlacementsToLayer(String(key))}>
          {layers.map((l) => (
            <MenuItem key={l.id} id={l.id}>
              {l.name}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  )
}

/** "Delete All (N)" with a confirm dialog; clears the selection on confirm. */
function DeleteAllButton({ count }: { count: number }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <>
      <Button size="sm" variant="danger" onPress={() => setConfirmDelete(true)}>
        Delete All ({count})
      </Button>

      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete SubParts"
        text={`Delete all ${count} selected SubParts?`}
        confirmLabel="Delete All"
        confirmVariant="danger"
        onConfirm={() => removeSelected()}
      />
    </>
  )
}
