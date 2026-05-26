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
  SectionTitle,
  Select,
  ToolbarButton,
  useToast,
} from '@cladd-ui/react'
import type { CatalogPart } from '../ksa/partCatalog'
import type { Layer } from '../ksa/types'
import { $catalogIndex } from '../state/catalogStore'
import { $partCatalog, $partCatalogLoading } from '../state/partCatalogStore'
import { $part, addPart, createLayer } from '../state/editorStore'
import { PartPreview } from './PartPreview'

const MAX_RESULTS = 200

const NEW_LAYER = '__new_layer__'
const CURRENT_LAYER = '__current_layer__'

type LayerChoice = Pick<Layer, 'id' | 'name'>

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
 * Top-surface "+ Part" action: opens a full-screen browser Popup with a
 * searchable list of pre-assembled Core Parts (left), a live 3D preview of the
 * highlighted Part plus a details panel (right). Selecting only previews — the
 * user clicks "Add Part to Project" to drop every SubPart of the Part into the
 * current project at its original transform, and the popup stays open so several
 * Parts can be added in a row.
 */
export function AddPartButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <ToolbarButton onClick={() => setOpen(true)}>+ Part</ToolbarButton>
      <PartPopup open={open} onOpenChange={setOpen} />
    </>
  )
}

export function PartPopup({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Popup
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="max-w-5xl [&>.rounded-cladd-popup]:rounded-lg"
      headerLeft={<span className="px-2 pb-1 text-cladd-sm font-semibold">Add Part</span>}
    >
      {open && <BrowserBody onClose={() => onOpenChange(false)} />}
    </Popup>
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
  const toast = useToast()

  const layerOptions = useMemo<LayerChoice[]>(
    () => [
      { id: NEW_LAYER, name: 'New Layer' },
      { id: CURRENT_LAYER, name: 'Current Layer' },
      ...part.layers.map((l) => ({ id: l.id, name: l.name })),
    ],
    [part.layers],
  )

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

  const add = () => {
    if (!selected) return
    const layerId =
      targetLayer === NEW_LAYER
        ? createLayer(nextNewLayerName(part.layers))
        : targetLayer === CURRENT_LAYER
          ? undefined
          : targetLayer
    addPart(selected.placements, selected.connectors, selected.editorTags, layerId)
    toast({ title: 'Part Added', text: selected.id, timeout: 2500 })
  }

  return (
    <PopupContent contentClassName="!h-auto w-full p-3">
      <div className="flex h-[65vh] min-h-0 w-full gap-3">
        <div className="flex w-72 min-h-0 flex-col gap-2">
          <SearchField size="sm" value={query} onChange={setQuery} placeholder="Search Parts" />
          <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-cladd-bg">
            <List>
              {loading ? (
                <ListItem className="text-cladd-fg-softer">Loading parts…</ListItem>
              ) : filtered.length === 0 ? (
                <ListItem className="text-cladd-fg-softer">No matches</ListItem>
              ) : (
                filtered.map((p) => (
                  <ListButton
                    key={p.id}
                    size="sm"
                    color="brand"
                    selected={p.id === selectedId}
                    onClick={() => setSelectedId(p.id)}
                    title={p.id}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate">{p.id}</span>
                      <span className="shrink-0 text-xs text-cladd-fg-softer">
                        {p.placements.length}
                      </span>
                    </span>
                  </ListButton>
                ))
              )}
            </List>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-cladd-bg">
            {selected ? (
              <PartPreview part={selected} />
            ) : (
              <div className="flex h-full items-center justify-center text-cladd-fg-softer">
                Select a Part to preview
              </div>
            )}
          </div>

          {selected && <PartDetails part={selected} subPartIndex={subPartIndex} />}

          <div className="flex shrink-0 items-center justify-between gap-2">
            <span
              className="truncate font-mono text-xs text-cladd-fg-softer"
              title={selectedId ?? ''}
            >
              {selectedId ?? ''}
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Select
                size="sm"
                title="Import into layer"
                className="min-w-0 flex-1"
                options={layerOptions}
                value={targetLayer}
                getOptionValue={(l) => l.id}
                onChange={(v) => setTargetLayer(v as string)}
                renderOption={({ value }) => value.name}
                renderBeforeOption={(_value, index) =>
                  index === 2 ? <div className="my-1 border-t border-cladd-outline" /> : null
                }
              >
                {layerOptions.find((l) => l.id === targetLayer)?.name}
              </Select>
              <Button size="sm" color="brand" disabled={!selected} onClick={add} className="shrink-0">
                Import Part
              </Button>
              <Button size="sm" onClick={onClose} className="shrink-0">
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PopupContent>
  )
}

function PartDetails({
  part,
  subPartIndex,
}: {
  part: CatalogPart
  subPartIndex: Map<string, unknown>
}) {
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of part.placements) {
      counts.set(p.subPartTemplateId, (counts.get(p.subPartTemplateId) ?? 0) + 1)
    }
    return Array.from(counts, ([templateId, count]) => ({ templateId, count })).sort(
      (a, b) => b.count - a.count || a.templateId.localeCompare(b.templateId),
    )
  }, [part])

  const missing = breakdown.filter((b) => !subPartIndex.has(b.templateId)).length

  return (
    <div className="shrink-0 rounded-lg bg-cladd-bg p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="text-cladd-fg-soft">
          <span className="text-cladd-fg-softer">SubParts:</span> {part.placements.length}
        </span>
        <span className="text-cladd-fg-soft">
          <span className="text-cladd-fg-softer">Unique types:</span> {breakdown.length}
        </span>
        <span className="text-cladd-fg-soft">
          <span className="text-cladd-fg-softer">Connectors:</span> {part.connectors.length}
        </span>
        <span className="text-cladd-fg-soft">
          <span className="text-cladd-fg-softer">Source:</span>{' '}
          <span className="font-mono">{part.sourceFile}</span>
        </span>
        {missing > 0 && (
          <span className="text-amber-400" title="These SubParts have no renderable mesh in the catalog and won't appear in the preview, but are still imported.">
            {missing} type{missing === 1 ? '' : 's'} not previewable
          </span>
        )}
      </div>

      {part.editorTags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {part.editorTags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-cladd-outline px-1.5 py-0.5 text-xs text-cladd-fg-soft"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <SectionTitle className="mt-3">SubParts</SectionTitle>
      <div className="mt-1 max-h-28 overflow-auto">
        <ul className="flex flex-col gap-0.5 text-xs">
          {breakdown.map((b) => {
            const previewable = subPartIndex.has(b.templateId)
            return (
              <li key={b.templateId} className="flex items-center justify-between gap-2">
                <span
                  className={`truncate font-mono ${previewable ? 'text-cladd-fg-soft' : 'text-cladd-fg-softer'}`}
                  title={b.templateId}
                >
                  {b.templateId}
                </span>
                <span className="shrink-0 text-cladd-fg-softer">×{b.count}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
