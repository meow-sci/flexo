import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { GridList, GridListItem, type Selection } from 'react-aria-components'
import { Button, Dialog, DialogHeader, Modal, SearchField } from './kit'
import { $part } from '../state/editorStore'
import {
  $activeAnimation,
  $activeJointId,
  attachToJoint,
} from '../state/animationStore'

/** One pickable SubPart row (a placed instance — the unit a joint drives). */
interface PickRow {
  id: string
  name: string
  sub: string
}

const rowClass = ({
  isSelected,
  isFocusVisible,
}: {
  isSelected: boolean
  isFocusVisible: boolean
}) =>
  [
    'flex cursor-default select-none items-center gap-1 rounded-md px-2 py-1.5 text-fg outline-none',
    isSelected ? 'bg-white/[0.08] ring-2 ring-inset ring-accent' : 'hover:bg-white/[0.06]',
    isFocusVisible && !isSelected ? 'ring-1 ring-inset ring-accent' : '',
  ].join(' ')

/**
 * A searchable, multi-select grid of placed SubParts for attaching to the active
 * animation joint. Opened from the {@link AnimToolbar} (the Assets list is hidden in
 * anim mode). SubParts only — connectors/kittens can't be driven by a joint. Picks
 * are local to the dialog; "Attach" calls {@link attachToJoint} and closes.
 */
export function MeshPickerModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const part = useStore($part)
  const anim = useStore($activeAnimation)
  const activeJointId = useStore($activeJointId)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const joint = anim?.joints.find((j) => j.id === activeJointId) ?? null

  const rows = useMemo<PickRow[]>(() => {
    const q = search.trim().toLowerCase()
    const match = (...vals: string[]) => q === '' || vals.some((v) => v.toLowerCase().includes(q))
    return part.placements.flatMap((p) =>
      match(p.instanceId, p.subPartTemplateId)
        ? [{ id: p.instanceId, name: p.instanceId, sub: p.subPartTemplateId }]
        : [],
    )
  }, [part.placements, search])

  const selectedKeys = useMemo<Selection>(() => new Set(picked), [picked])

  const onSelectionChange = (keys: Selection) => {
    if (keys === 'all') {
      setPicked(new Set(rows.map((r) => r.id)))
      return
    }
    setPicked(new Set([...keys].map(String)))
  }

  const attach = () => {
    if (!anim || !joint || picked.size === 0) return
    attachToJoint(anim.id, joint.id, [...picked])
    onOpenChange(false)
  }

  // Reset picks each time the dialog is reopened.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setPicked(new Set())
      setSearch('')
    }
    onOpenChange(open)
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange} isDismissable variant="fullscreen" className="max-w-2xl">
      <Dialog>
        <DialogHeader title="Mesh Picker" onClose={() => handleOpenChange(false)} />
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
          <SearchField
            size="sm"
            aria-label="Filter parts"
            placeholder="Filter parts…"
            value={search}
            onChange={setSearch}
          />
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-panel-sunken p-1">
            <GridList
              aria-label="Parts"
              selectionMode="multiple"
              items={rows}
              selectedKeys={selectedKeys}
              onSelectionChange={onSelectionChange}
              dependencies={[search]}
              renderEmptyState={() => (
                <span className="block px-2 py-2 text-sm text-fg-subtle">
                  {search.trim() ? 'No matching parts' : 'No parts in the scene'}
                </span>
              )}
              className="flex flex-col gap-1 outline-none"
            >
              {(row: PickRow) => (
                <GridListItem id={row.id} textValue={row.name} className={rowClass}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{row.name}</span>
                    <span className="truncate text-xs text-fg-subtle">{row.sub}</span>
                  </div>
                </GridListItem>
              )}
            </GridList>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {!joint && (
              <span className="mr-auto text-xs text-warning">Select a joint first to attach.</span>
            )}
            <Button variant="ghost" onPress={() => handleOpenChange(false)}>
              Close
            </Button>
            <Button isDisabled={!joint || picked.size === 0} onPress={attach}>
              Attach {picked.size || ''} to {joint?.name ?? 'joint'}
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  )
}
