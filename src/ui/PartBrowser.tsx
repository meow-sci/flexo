import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { Key, Selection } from 'react-aria-components'
import {
  Button,
  SearchField,
  Select,
  ListBoxItem,
  GridList,
  GridListItem,
  SectionTitle,
  toast,
  useIsPhone,
} from './kit'
import type { CatalogPart } from '../ksa/partCatalog'
import type { Layer } from '../ksa/types'
import { $catalogIndex } from '../state/catalogStore'
import { $partCatalog, $partCatalogLoading } from '../state/partCatalogStore'
import { $part, createLayer } from '../state/editorStore'
import { importBuiltInPart } from '../state/partImport'
import { revealLayer } from '../state/layerStore'
import { closeBrowserPopup, openBrowserPopup } from '../state/loadProgressStore'
import { PartPreview } from './PartPreview'
import { PreviewLoadProgress } from './LoadProgress'
import { BrowserLayout, BrowserPopup } from './BrowserShell'

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
 * Full-viewport browser for importing a built-in Part (opened from the Add menu).
 * Top row is search + destination-layer Select + Add. On desktop the body is
 * `list | (preview / details)` with two draggable dividers; on phone it collapses
 * to a vertically-split list-over-preview. Both splits reset to 50/50 each open.
 */
export function PartPopup({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <BrowserPopup title="Add Part" open={open} onOpenChange={onOpenChange}>
      <BrowserBody onClose={() => onOpenChange(false)} />
    </BrowserPopup>
  )
}

function BrowserBody({ onClose }: { onClose: () => void }) {
  const catalog = useStore($partCatalog)
  const loading = useStore($partCatalogLoading)
  const subPartIndex = useStore($catalogIndex)
  const part = useStore($part)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [targetLayer, setTargetLayer] = useState<string>(NEW_LAYER)
  const isPhone = useIsPhone()

  useEffect(() => {
    openBrowserPopup()
    return closeBrowserPopup
  }, [])

  const q = query.trim().toLowerCase()
  const matches = q
    ? catalog.filter(
        (p) =>
          p.id.toLowerCase().includes(q) || p.editorTags.some((t) => t.toLowerCase().includes(q)),
      )
    : catalog
  const filtered = matches.slice(0, MAX_RESULTS)

  const selected = selectedId ? (catalog.find((p) => p.id === selectedId) ?? null) : null

  const onSelection = (keys: Selection) => {
    if (keys === 'all') return
    setSelectedId(([...keys][0] as string) ?? null)
  }

  const resolveLayerId = () =>
    targetLayer === NEW_LAYER
      ? createLayer(nextNewLayerName(part.layers))
      : targetLayer === CURRENT_LAYER
        ? undefined
        : targetLayer

  const add = async () => {
    if (!selected) return
    // importBuiltInPart imports the SubParts + any keyframe animations, selects the
    // imported SubParts, and returns the layer they landed on; reveal it (visible + in
    // the Assets list) so the import is never hidden.
    revealLayer(await importBuiltInPart(selected, resolveLayerId()))
    toast({ title: 'Part Added', description: selected.id }, { timeout: 2500 })
  }

  const addAndClose = async (key: Key) => {
    const p = catalog.find((c) => c.id === String(key))
    if (!p) return
    revealLayer(await importBuiltInPart(p, resolveLayerId()))
    toast({ title: 'Part Added', description: p.id }, { timeout: 2500 })
    onClose()
  }

  const listPane = (
    <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken">
      {loading ? (
        <div className="p-3 text-sm text-fg-subtle">Loading parts…</div>
      ) : filtered.length === 0 ? (
        <div className="p-3 text-sm text-fg-subtle">No matches</div>
      ) : (
        <GridList
          aria-label="Parts"
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
          {(p) => (
            <GridListItem id={p.id} textValue={p.id}>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{p.id}</span>
                <span className="shrink-0 text-xs text-fg-subtle">{p.placements.length}</span>
              </span>
            </GridListItem>
          )}
        </GridList>
      )}
    </div>
  )

  const previewPane = (
    <div className="relative h-full overflow-hidden rounded-lg border border-border bg-panel-sunken">
      {selected ? (
        <PartPreview part={selected} />
      ) : (
        <div className="flex h-full items-center justify-center text-fg-subtle">
          Select a Part to preview
        </div>
      )}
      <PreviewLoadProgress />
    </div>
  )

  const detailsPane = (
    <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken p-3">
      {selected ? (
        <PartDetails part={selected} subPartIndex={subPartIndex} />
      ) : (
        <span className="text-sm text-fg-subtle">Select a Part to see its details.</span>
      )}
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
      {/*
        Phone stacks search on its own full-width row (so it isn't squeezed
        beside the 176px layer Select) with Select + Add on a second row; sm+
        keeps the original single search | select | add row.
      */}
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <SearchField
          size="sm"
          className="min-w-0 sm:flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search Parts"
          aria-label="Search Parts"
          // Autofocus raises the soft keyboard, which covers the preview on a
          // phone — only grab focus on desktop where typing-first is the norm.
          autoFocus={!isPhone}
        />
        <div className="flex items-center gap-2">
          <Select
            size="sm"
            aria-label="Import into layer"
            className="min-w-0 flex-1 sm:w-44 sm:flex-none"
            value={targetLayer}
            onChange={(k) => setTargetLayer(String(k))}
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
      </div>

      <BrowserLayout
        list={listPane}
        preview={previewPane}
        details={detailsPane}
        // Phone: compact summary strip above the preview (no room for full details).
        phoneBottom={
          <div className="flex h-full flex-col gap-1.5 overflow-hidden">
            {selected && <CompactPartSummary part={selected} subPartIndex={subPartIndex} />}
            <div className="min-h-0 flex-1">{previewPane}</div>
          </div>
        }
      />
    </div>
  )
}

/**
 * Compact horizontal strip used on phone (above the preview) — counts + source
 * + tags in one wrappable row. Desktop uses the richer {@link PartDetails}.
 */
function CompactPartSummary({
  part,
  subPartIndex,
}: {
  part: CatalogPart
  subPartIndex: Map<string, unknown>
}) {
  const uniqueTypes = new Set(part.placements.map((p) => p.subPartTemplateId))
  const missing = [...uniqueTypes].filter((t) => !subPartIndex.has(t)).length

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
      {missing > 0 && (
        <span
          className="text-warning"
          title="These SubParts have no renderable mesh in the catalog and won't appear in the preview, but are still imported."
        >
          {missing} type{missing === 1 ? '' : 's'} not previewable
        </span>
      )}
    </div>
  )
}

/**
 * Full details panel shown in the desktop right-bottom split: id + counts +
 * source XML + editor tags + a per-template SubParts breakdown (with how many
 * instances and whether each is previewable).
 */
function PartDetails({
  part,
  subPartIndex,
}: {
  part: CatalogPart
  subPartIndex: Map<string, unknown>
}) {
  const counts = new Map<string, number>()
  for (const p of part.placements) {
    counts.set(p.subPartTemplateId, (counts.get(p.subPartTemplateId) ?? 0) + 1)
  }
  const breakdown = Array.from(counts, ([templateId, count]) => ({ templateId, count })).sort(
    (a, b) => b.count - a.count || a.templateId.localeCompare(b.templateId),
  )

  const missing = breakdown.filter((b) => !subPartIndex.has(b.templateId)).length

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-sm text-fg">{part.id}</span>
        <span className="text-fg-subtle">
          <span className="text-fg-subtle/70">Source:</span>{' '}
          <span className="font-mono text-fg-muted">{part.sourceFile}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-fg-muted">
          <span className="text-fg-subtle">SubParts:</span> {part.placements.length}
        </span>
        <span className="text-fg-muted">
          <span className="text-fg-subtle">Unique types:</span> {breakdown.length}
        </span>
        <span className="text-fg-muted">
          <span className="text-fg-subtle">Connectors:</span> {part.connectors.length}
        </span>
        <span className="text-fg-muted">
          <span className="text-fg-subtle">Animations:</span> {part.animationModules.length}
        </span>
        {missing > 0 && (
          <span
            className="text-warning"
            title="These SubParts have no renderable mesh in the catalog and won't appear in the preview, but are still imported."
          >
            {missing} type{missing === 1 ? '' : 's'} not previewable
          </span>
        )}
      </div>

      {part.editorTags.length > 0 && (
        <div>
          <SectionTitle>Editor Tags</SectionTitle>
          <div className="mt-1 flex flex-wrap gap-1">
            {part.editorTags.map((tag) => (
              <span key={tag} className="rounded border border-border px-1.5 py-0.5 text-fg-muted">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle>SubParts</SectionTitle>
        <ul className="mt-1 flex flex-col gap-0.5">
          {breakdown.map((b) => {
            const previewable = subPartIndex.has(b.templateId)
            return (
              <li key={b.templateId} className="flex items-center justify-between gap-2">
                <span
                  className={`truncate font-mono ${previewable ? 'text-fg-muted' : 'text-fg-subtle'}`}
                  title={b.templateId}
                >
                  {b.templateId}
                </span>
                <span className="shrink-0 text-fg-subtle">×{b.count}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
