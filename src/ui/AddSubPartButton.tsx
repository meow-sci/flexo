import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { Selection } from 'react-aria-components'
import {
  Modal,
  Dialog,
  DialogHeader,
  Button,
  SearchField,
  ListBox,
  ListBoxItem,
  ToolbarButton,
  toast,
} from './kit'
import { $catalog, $catalogLoading } from '../state/catalogStore'
import { addSubPart } from '../state/editorStore'
import { closeBrowserPopup, openBrowserPopup } from '../state/loadProgressStore'
import { SubPartPreview } from './SubPartPreview'
import { PreviewLoadProgress } from './LoadProgress'
import { VerticalSplit } from './VerticalSplit'

const MAX_RESULTS = 200

/**
 * "+ SubPart" action: opens a full-viewport browser. The top row is search +
 * Add. Below it a vertically-split list and live 3D preview (50/50 by default,
 * draggable divider, resets each open).
 */
export function AddSubPartButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <ToolbarButton onPress={() => setOpen(true)}>+ SubPart</ToolbarButton>
      <SubPartPopup open={open} onOpenChange={setOpen} />
    </>
  )
}

export function SubPartPopup({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal isOpen={open} onOpenChange={onOpenChange} isDismissable variant="cover">
      <Dialog className="h-full">
        <DialogHeader title="Add SubPart" onClose={() => onOpenChange(false)} />
        {open && <BrowserBody />}
      </Dialog>
    </Modal>
  )
}

function BrowserBody() {
  const catalog = useStore($catalog)
  const loading = useStore($catalogLoading)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    openBrowserPopup()
    return closeBrowserPopup
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q ? catalog.filter((s) => s.id.toLowerCase().includes(q)) : catalog
    return matches.slice(0, MAX_RESULTS)
  }, [catalog, query])

  const onSelection = (keys: Selection) => {
    if (keys === 'all') return
    setSelectedId((([...keys][0] as string) ?? null))
  }

  const add = () => {
    if (!selectedId) return
    addSubPart(selectedId)
    toast({ title: 'SubPart Added', description: selectedId }, { timeout: 2500 })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
      <div className="flex shrink-0 items-center gap-2">
        <SearchField
          size="sm"
          className="min-w-0 flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search SubParts"
          aria-label="Search SubParts"
        />
        <Button size="sm" variant="primary" isDisabled={!selectedId} onPress={add}>
          Add
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <VerticalSplit
          top={
            <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken">
              {loading ? (
                <div className="p-3 text-sm text-fg-subtle">Loading catalog…</div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-sm text-fg-subtle">No matches</div>
              ) : (
                <ListBox
                  aria-label="SubParts"
                  selectionMode="single"
                  selectedKeys={selectedId ? [selectedId] : []}
                  onSelectionChange={onSelection}
                  items={filtered}
                >
                  {(s) => (
                    <ListBoxItem id={s.id} textValue={s.id}>
                      {s.id}
                    </ListBoxItem>
                  )}
                </ListBox>
              )}
            </div>
          }
          bottom={
            <div className="relative h-full overflow-hidden rounded-lg border border-border bg-panel-sunken">
              {selectedId ? (
                <SubPartPreview subPartId={selectedId} />
              ) : (
                <div className="flex h-full items-center justify-center text-fg-subtle">
                  Select a SubPart to preview
                </div>
              )}
              <PreviewLoadProgress />
            </div>
          }
        />
      </div>
    </div>
  )
}
