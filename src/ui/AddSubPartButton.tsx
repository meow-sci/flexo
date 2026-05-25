import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  Button,
  List,
  ListButton,
  ListItem,
  Popup,
  PopupContent,
  SearchField,
  ToolbarButton,
  useToast,
} from '@cladd-ui/react'
import { $catalog, $catalogLoading } from '../state/catalogStore'
import { addSubPart } from '../state/editorStore'
import { SubPartPreview } from './SubPartPreview'

const MAX_RESULTS = 200

/**
 * Top-surface "+ SubPart" action: opens a full-screen browser Popup with a
 * searchable SubPart list (left) and a live 3D preview of the highlighted entry
 * (right). Selecting only previews — the user must click "Add SubPart to
 * Project" to place it, and the popup stays open so several can be added in a
 * row.
 */
export function AddSubPartButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <ToolbarButton onClick={() => setOpen(true)}>+ SubPart</ToolbarButton>
      <SubPartPopup open={open} onOpenChange={setOpen} />
    </>
  )
}

export function SubPartPopup({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Popup
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="max-w-5xl"
      headerLeft={<span className="px-2 pb-1 text-cladd-sm font-semibold">Add SubPart</span>}
    >
      {open && <BrowserBody onClose={() => onOpenChange(false)} />}
    </Popup>
  )
}

function BrowserBody({ onClose }: { onClose: () => void }) {
  const catalog = useStore($catalog)
  const loading = useStore($catalogLoading)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const toast = useToast()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q ? catalog.filter((s) => s.id.toLowerCase().includes(q)) : catalog
    return matches.slice(0, MAX_RESULTS)
  }, [catalog, query])

  const add = () => {
    if (!selectedId) return
    addSubPart(selectedId)
    toast({ title: 'SubPart Added', text: selectedId, timeout: 2500 })
  }

  return (
    <PopupContent contentClassName="!h-auto w-full p-3">
      <div className="flex h-[65vh] min-h-0 w-full gap-3">
      <div className="flex w-72 min-h-0 flex-col gap-2">
        <SearchField size="sm" value={query} onChange={setQuery} placeholder="Search SubParts" />
        <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-cladd-bg">
          <List>
            {loading ? (
              <ListItem className="text-cladd-fg-softer">Loading catalog…</ListItem>
            ) : filtered.length === 0 ? (
              <ListItem className="text-cladd-fg-softer">No matches</ListItem>
            ) : (
              filtered.map((s) => (
                <ListButton
                  key={s.id}
                  size="sm"
                  color="brand"
                  selected={s.id === selectedId}
                  onClick={() => setSelectedId(s.id)}
                  title={s.id}
                >
                  <span className="truncate">{s.id}</span>
                </ListButton>
              ))
            )}
          </List>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-cladd-bg">
          {selectedId ? (
            <SubPartPreview subPartId={selectedId} />
          ) : (
            <div className="flex h-full items-center justify-center text-cladd-fg-softer">
              Select a SubPart to preview
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="truncate font-mono text-xs text-cladd-fg-softer" title={selectedId ?? ''}>
            {selectedId ?? ''}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" color="brand" disabled={!selectedId} onClick={add}>
              Add SubPart to Project
            </Button>
          </div>
        </div>
      </div>
      </div>
    </PopupContent>
  )
}
