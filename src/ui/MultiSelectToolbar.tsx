import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Eye, Layers } from 'lucide-react'
import {
  Toolbar,
  Button,
  MenuTrigger,
  Menu,
  MenuHeader,
  MenuItem,
  Popover,
  ConfirmDialog,
} from './kit'
import {
  $part,
  $selectedColliderIndices,
  $selectedConnectorIndices,
  $selectedIndices,
  isGlassTemplate,
  moveSelectionToLayer,
  removeSelected,
  setPlacementsInternal,
} from '../state/editorStore'
import { $hasMultiSelection, $selectionCount } from '../state/selectors'
import { ENTITY_ONLY_LAYER_IDS } from '../ksa/types'

/**
 * Floating toolbar stacked beneath {@link SelectionToolbar}, shown only when more
 * than one entity is selected. Holds actions that are specific to a multi-selection
 * (bulk layer move, bulk delete) and act on the whole selection at once.
 */
export function MultiSelectToolbar() {
  const hasMultiSelection = useStore($hasMultiSelection)
  const count = useStore($selectionCount)
  const subCount = useStore($selectedIndices).length
  const conCount = useStore($selectedConnectorIndices).length
  const colCount = useStore($selectedColliderIndices).length

  if (!hasMultiSelection) return null

  return (
    <Toolbar aria-label="Multi-selection actions">
      {/* SubParts, connectors and colliders can change layer; seats/lights/kittens are
          pinned to their own, and are simply left where they are. */}
      {subCount + conCount + colCount > 0 && <ChangeLayerButton />}
      {subCount > 0 && <InteriorButton />}
      <DeleteAllButton count={count} />
    </Toolbar>
  )
}

/** "Change Layer" menu: picks a destination layer for the whole selection. */
function ChangeLayerButton() {
  const part = useStore($part)
  // Nothing may be moved ONTO the entity-only built-in layers (seats/lights/kittens).
  const layers = part.layers.filter((l) => !ENTITY_ONLY_LAYER_IDS.includes(l.id))

  return (
    <MenuTrigger>
      <Button size="sm">
        <Layers className="size-4" />
        Change Layer
      </Button>
      <Popover placement="bottom start" className="w-48">
        <Menu onAction={(key) => moveSelectionToLayer(String(key))}>
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

/**
 * "Interior (IVA only)" On/Off for the whole SubPart selection — the same action as the
 * Assets-list row menu, surfaced here for discoverability when a big selection is live.
 *
 * KSA's `<Internal>` lives on the template's `<PartModel>`, so this is per-TEMPLATE, never
 * per-placement: it hits the distinct templates behind the selection, and the menu says so.
 * Disabled when every selected template exports through `<PartModelGlass>` (KSA glass has no
 * `<Internal>` field, so the flag would be silently ignored).
 */
function InteriorButton() {
  const part = useStore($part)
  const indices = useStore($selectedIndices)

  const templateIds = [
    ...new Set(
      indices.flatMap((i) => {
        const p = part.placements[i]
        return p ? [p.subPartTemplateId] : []
      }),
    ),
  ]
  const glassOnly = templateIds.length > 0 && templateIds.every((id) => isGlassTemplate(part, id))

  return (
    <MenuTrigger>
      <Button size="sm" isDisabled={glassOnly}>
        <Eye className="size-4" />
        {glassOnly ? 'Interior — n/a for glass' : 'Interior (IVA only)'}
      </Button>
      <Popover placement="bottom start" className="w-64">
        <Menu onAction={(key) => setPlacementsInternal(indices, key === 'on')}>
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
        title="Delete selection"
        text={`Delete all ${count} selected items?`}
        confirmLabel="Delete All"
        confirmVariant="danger"
        onConfirm={() => removeSelected()}
      />
    </>
  )
}
