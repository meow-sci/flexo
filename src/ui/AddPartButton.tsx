import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { Selection } from 'react-aria-components'
import {
  Modal,
  Dialog,
  DialogHeader,
  Button,
  SearchField,
  Select,
  ListBox,
  ListBoxItem,
  ToolbarButton,
  toast,
} from './kit'
import type { CatalogPart } from '../ksa/partCatalog'
import type { Layer } from '../ksa/types'
import { $catalogIndex } from '../state/catalogStore'
import { $partCatalog, $partCatalogLoading } from '../state/partCatalogStore'
import { $part, addPart, createLayer } from '../state/editorStore'
import { closeBrowserPopup, openBrowserPopup } from '../state/loadProgressStore'
import { PartPreview } from './PartPreview'
import { PreviewLoadProgress } from './LoadProgress'
import { VerticalSplit } from './VerticalSplit'

const MAX_RESULTS = 200
const NEW_LAYER = '__new_layer__'
const CURRENT_LAYER = '__current_layer__'

/** Next free "New Layer N" name (max existing numeric suffix + 1). */
function nextNewLayerName(layers: readonly Layer[]): string {
  let max = 0
  for (const l of layers) {
    const m = /^New Layer (\d+)$/.exec(l.name)
    if (m) max = Math.max(max, Number.parseInt(m[1], 10))
  }
  return `New Layer ${max + 1}`
}

/**
 * "+ Part" action: opens a full-viewport browser. The top row is search +
 * destination-layer Select + Add. Below it a vertically-split list and 3D
 * preview (50/50 by default, draggable divider, resets each open).
 */
export function AddPartButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ToolbarButton onPress={() => setOpen(true)}>+ Part</ToolbarButton>
      <PartPopup open={open} onOpenChange={setOpen} />
    </>
  )
}

export function PartPopup({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal isOpen={open} onOpenChange={onOpenChange} isDismissable variant="cover">
      <Dialog className="h-full">
        <DialogHeader title="Add Part" onClose={() => onOpenChange(false)} />
        {open && <BrowserBody />}
      </Dialog>
    </Modal>
  )
}

function BrowserBody() {
  const catalog = useStore($partCatalog)
  const loading = useStore($partCatalogLoading)
  const subPartIndex = useStore($catalogIndex)
  const part = useStore($part)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [targetLayer, setTargetLayer] = useState<string>(NEW_LAYER)

  useEffect(() => {
    openBrowserPopup()
    return closeBrowserPopup
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? catalog.filter(
          (p) =>
            p.id.toLowerCase().includes(q) ||
            p.editorTags.some((t) => t.toLowerCase().includes(q)),
        )
      : catalog
    return matches.slice(0, MAX_RESULTS)
  }, [catalog, query])

  const selected = useMemo(
    () => (selectedId ? (catalog.find((p) => p.id === selectedId) ?? null) : null),
    [catalog, selectedId],
  )

  const onSelection = (keys: Selection) => {
    if (keys === 'all') return
    setSelectedId((([...keys][0] as string) ?? null))
  }

  const add = () => {
    if (!selected) return
    const layerId =
      targetLayer === NEW_LAYER
        ? createLayer(nextNewLayerName(part.layers))
        : targetLayer === CURRENT_LAYER
          ? undefined
          : targetLayer
    addPart(selected.placements, selected.connectors, selected.editorTags, layerId)
    toast({ title: 'Part Added', description: selected.id }, { timeout: 2500 })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
      <div className="flex shrink-0 items-center gap-2">
        <SearchField
          size="sm"
          className="min-w-0 flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search Parts"
          aria-label="Search Parts"
        />
        <Select
          size="sm"
          aria-label="Import into layer"
          className="w-44 shrink-0"
          selectedKey={targetLayer}
          onSelectionChange={(k) => setTargetLayer(String(k))}
        >
          <ListBoxItem id={NEW_LAYER}>New Layer</ListBoxItem>
          <ListBoxItem id={CURRENT_LAYER}>Current Layer</ListBoxItem>
          {part.layers.map((l) => (
            <ListBoxItem key={l.id} id={l.id} textValue={l.name}>
              {l.name}
            </ListBoxItem>
          ))}
        </Select>
        <Button size="sm" variant="primary" isDisabled={!selected} onPress={add}>
          Add
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <VerticalSplit
          top={
            <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken">
              {loading ? (
                <div className="p-3 text-sm text-fg-subtle">Loading parts…</div>
              ) : filtered.length === 0 ? (
                <div className="p-3 text-sm text-fg-subtle">No matches</div>
              ) : (
                <ListBox
                  aria-label="Parts"
                  selectionMode="single"
                  selectedKeys={selectedId ? [selectedId] : []}
                  onSelectionChange={onSelection}
                  items={filtered}
                >
                  {(p) => (
                    <ListBoxItem id={p.id} textValue={p.id}>
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate">{p.id}</span>
                        <span className="shrink-0 text-xs text-fg-subtle">{p.placements.length}</span>
                      </span>
                    </ListBoxItem>
                  )}
                </ListBox>
              )}
            </div>
          }
          bottom={
            <div className="flex h-full flex-col gap-1.5 overflow-hidden">
              {selected && <PartSummary part={selected} subPartIndex={subPartIndex} />}
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-panel-sunken">
                {selected ? (
                  <PartPreview part={selected} />
                ) : (
                  <div className="flex h-full items-center justify-center text-fg-subtle">
                    Select a Part to preview
                  </div>
                )}
                <PreviewLoadProgress />
              </div>
            </div>
          }
        />
      </div>
    </div>
  )
}

/** Compact one-line summary above the 3D preview (counts + tags + warnings). */
function PartSummary({
  part,
  subPartIndex,
}: {
  part: CatalogPart
  subPartIndex: Map<string, unknown>
}) {
  const uniqueTypes = useMemo(() => {
    const set = new Set<string>()
    for (const p of part.placements) set.add(p.subPartTemplateId)
    return set
  }, [part])

  const missing = useMemo(
    () => [...uniqueTypes].filter((t) => !subPartIndex.has(t)).length,
    [uniqueTypes, subPartIndex],
  )

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-panel-sunken px-2 py-1 text-xs">
      <span className="truncate font-mono text-fg" title={part.id}>
        {part.id}
      </span>
      <span className="text-fg-muted">
        <span className="text-fg-subtle">SubParts:</span> {part.placements.length}
      </span>
      <span className="text-fg-muted">
        <span className="text-fg-subtle">Unique:</span> {uniqueTypes.size}
      </span>
      <span className="text-fg-muted">
        <span className="text-fg-subtle">Connectors:</span> {part.connectors.length}
      </span>
      <span className="text-fg-muted">
        <span className="text-fg-subtle">Source:</span>{' '}
        <span className="font-mono">{part.sourceFile}</span>
      </span>
      {missing > 0 && (
        <span className="text-warning" title="These SubParts have no renderable mesh in the catalog and won't appear in the preview, but are still imported.">
          {missing} type{missing === 1 ? '' : 's'} not previewable
        </span>
      )}
      {part.editorTags.length > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          {part.editorTags.map((tag) => (
            <span key={tag} className="rounded border border-border px-1.5 py-0.5 text-fg-muted">
              {tag}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
