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
  SectionTitle,
  ToolbarButton,
  toast,
  useIsPhone,
} from './kit'
import { $catalog, $catalogLoading } from '../state/catalogStore'
import type { CatalogSubPart } from '../ksa/catalog'
import { addSubPart } from '../state/editorStore'
import { closeBrowserPopup, openBrowserPopup } from '../state/loadProgressStore'
import { SubPartPreview } from './SubPartPreview'
import { PreviewLoadProgress } from './LoadProgress'
import { VerticalSplit, HorizontalSplit } from './VerticalSplit'

const MAX_RESULTS = 200

/**
 * "+ SubPart" action: opens a full-viewport browser. Top row is search + Add.
 * On desktop the body is `list | (preview / details)` with two draggable
 * dividers; on phone it collapses to a vertically-split list-over-preview.
 * Both splits reset to 50/50 each time the modal opens.
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
    <Modal
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      variant="cover"
      className="sm:w-[95vw] sm:max-w-[75rem]"
    >
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
  const isPhone = useIsPhone()

  useEffect(() => {
    openBrowserPopup()
    return closeBrowserPopup
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q ? catalog.filter((s) => s.id.toLowerCase().includes(q)) : catalog
    return matches.slice(0, MAX_RESULTS)
  }, [catalog, query])

  const selected = useMemo(
    () => (selectedId ? (catalog.find((s) => s.id === selectedId) ?? null) : null),
    [catalog, selectedId],
  )

  const onSelection = (keys: Selection) => {
    if (keys === 'all') return
    setSelectedId((([...keys][0] as string) ?? null))
  }

  const add = () => {
    if (!selectedId) return
    addSubPart(selectedId)
    toast({ title: 'SubPart Added', description: selectedId }, { timeout: 2500 })
  }

  const listPane = (
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
  )

  const previewPane = (
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
  )

  const detailsPane = (
    <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken p-3">
      {selected ? <SubPartDetails subPart={selected} /> : (
        <span className="text-sm text-fg-subtle">Select a SubPart to see its details.</span>
      )}
    </div>
  )

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
        {isPhone ? (
          <VerticalSplit top={listPane} bottom={previewPane} />
        ) : (
          <HorizontalSplit
            left={listPane}
            right={<VerticalSplit top={previewPane} bottom={detailsPane} />}
          />
        )}
      </div>
    </div>
  )
}

/** Right-bottom panel on desktop: technical details for the highlighted SubPart. */
function SubPartDetails({ subPart }: { subPart: CatalogSubPart }) {
  const textures: { label: string; url?: string }[] = [
    { label: 'Diffuse', url: subPart.diffuseUrl },
    { label: 'Normal', url: subPart.normalUrl },
    { label: 'AO/Rough/Metal', url: subPart.aoRoughMetalUrl },
    { label: 'Emissive', url: subPart.emissiveUrl },
  ].filter((t) => t.url)

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-sm text-fg">{subPart.id}</span>
        <span className="text-fg-subtle">
          <span className="text-fg-subtle/70">Source:</span>{' '}
          <span className="font-mono text-fg-muted">{subPart.sourceFile}</span>
        </span>
      </div>

      <div>
        <SectionTitle>Mesh</SectionTitle>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-fg-subtle">Atlas</dt>
          <dd className="truncate font-mono text-fg-muted" title={subPart.atlasUrl}>
            {subPart.atlasUrl}
          </dd>
          <dt className="text-fg-subtle">Node</dt>
          <dd className="truncate font-mono text-fg-muted">
            {subPart.meshNodeName ?? <span className="italic">(whole scene)</span>}
          </dd>
        </dl>
      </div>

      {(subPart.materialId || textures.length > 0) && (
        <div>
          <SectionTitle>Material</SectionTitle>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {subPart.materialId && (
              <>
                <dt className="text-fg-subtle">ID</dt>
                <dd className="truncate font-mono text-fg-muted">{subPart.materialId}</dd>
              </>
            )}
            {textures.map((t) => (
              <div key={t.label} className="contents">
                <dt className="text-fg-subtle">{t.label}</dt>
                <dd className="truncate font-mono text-fg-muted" title={t.url}>
                  {t.url}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
