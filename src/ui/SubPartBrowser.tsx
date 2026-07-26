import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { Key, Selection } from 'react-aria-components'
import {
  Button,
  Chip,
  SearchField,
  GridList,
  GridListItem,
  SectionTitle,
  toast,
  useIsPhone,
} from './kit'
import { $catalog, $catalogLoading } from '../state/catalogStore'
import type { CatalogSubPart } from '../ksa/catalog'
import { addSubPart } from '../state/editorStore'
import { closeBrowserPopup, openBrowserPopup } from '../state/loadProgressStore'
import { SubPartPreview } from './SubPartPreview'
import { PreviewLoadProgress } from './LoadProgress'
import { BrowserLayout, BrowserPopup } from './BrowserShell'

const MAX_RESULTS = 200

/**
 * Full-viewport browser for adding a catalog SubPart (opened from the Add menu).
 * Top row is search + Add. On desktop the body is `list | (preview / details)`
 * with two draggable dividers; on phone it collapses to a vertically-split
 * list-over-preview. Both splits reset to 50/50 each time the modal opens.
 */
export function SubPartPopup({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <BrowserPopup title="Add SubPart" open={open} onOpenChange={onOpenChange}>
      <BrowserBody onClose={() => onOpenChange(false)} />
    </BrowserPopup>
  )
}

function BrowserBody({ onClose }: { onClose: () => void }) {
  const catalog = useStore($catalog)
  const loading = useStore($catalogLoading)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const isPhone = useIsPhone()

  useEffect(() => {
    openBrowserPopup()
    return closeBrowserPopup
  }, [])

  const q = query.trim().toLowerCase()
  const matches = q ? catalog.filter((s) => s.id.toLowerCase().includes(q)) : catalog
  const filtered = matches.slice(0, MAX_RESULTS)

  const selected = selectedId ? (catalog.find((s) => s.id === selectedId) ?? null) : null

  const onSelection = (keys: Selection) => {
    if (keys === 'all') return
    setSelectedId(([...keys][0] as string) ?? null)
  }

  const add = () => {
    if (!selectedId) return
    addSubPart(selectedId)
    toast({ title: 'SubPart Added', description: selectedId }, { timeout: 2500 })
  }

  const addAndClose = (key: Key) => {
    const id = String(key)
    addSubPart(id)
    toast({ title: 'SubPart Added', description: id }, { timeout: 2500 })
    onClose()
  }

  const listPane = (
    <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken">
      {loading ? (
        <div className="p-3 text-sm text-fg-subtle">Loading catalog…</div>
      ) : filtered.length === 0 ? (
        <div className="p-3 text-sm text-fg-subtle">No matches</div>
      ) : (
        <GridList
          aria-label="SubParts"
          selectionMode="single"
          // "replace" makes the arrow keys move selection (not just the focus
          // ring), so keyboard navigation drives the preview/Add target directly.
          selectionBehavior="replace"
          selectedKeys={selectedId ? [selectedId] : []}
          onSelectionChange={onSelection}
          // On touch a single tap fires onAction, which would add-and-close
          // before the preview is ever seen. On phone a tap only selects
          // (driving the preview); the explicit Add button is the commit.
          onAction={isPhone ? undefined : addAndClose}
          items={filtered}
        >
          {(s) => (
            <GridListItem id={s.id} textValue={s.id}>
              <span className="min-w-0 flex-1 truncate">{s.id}</span>
              {/* KSA renders an <Internal> SubPart in IVA camera mode and NOWHERE else — say
                  so BEFORE it is placed, so an interior-only prop is never a mystery. */}
              {s.internal && (
                <Chip
                  className="shrink-0"
                  title="Interior-only: KSA renders this SubPart in IVA camera mode and not outside it."
                >
                  interior
                </Chip>
              )}
            </GridListItem>
          )}
        </GridList>
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
      {selected ? (
        <SubPartDetails subPart={selected} />
      ) : (
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
          // Autofocus raises the soft keyboard, which covers the preview on a
          // phone — only grab focus on desktop where typing-first is the norm.
          autoFocus={!isPhone}
        />
        <Button size="sm" variant="primary" isDisabled={!selectedId} onPress={add}>
          Add
        </Button>
      </div>

      <BrowserLayout list={listPane} preview={previewPane} details={detailsPane} />
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
