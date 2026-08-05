import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import {
  Chip,
  GridList,
  GridListItem,
  ListBoxItem,
  SearchField,
  SectionTitle,
  Select,
  useIsPhone,
} from '../kit';
import { $catalog, $catalogLoading } from '../../state/catalogStore';
import type { CatalogSubPart } from '../../ksa/catalog';
import { addSubPart } from '../../state/editorStore';
import { closeBrowserPopup, openBrowserPopup } from '../../state/loadProgressStore';
import { SubPartPreview } from '../SubPartPreview';
import { PreviewLoadProgress } from '../LoadProgress';
import { BrowserLayout, BrowserPopup } from '../BrowserShell';
import { fuzzyFind } from '../fuzzyMatch';
import { toast } from '../toast';
import { BrowserCommitRow, MAX_RESULTS, ResultCapRow } from './browserCommon';

/** `Interior` facet — KSA's `<Internal>` flag, which decides whether a mesh draws in IVA only. */
type InteriorFilter = 'all' | 'only' | 'exclude';

const ALL_SOURCES = '__all__';

/**
 * **Add SubPart** (design: design-build-mode.md §6.2; foundation §10.10) — the catalog
 * browser, size L cover.
 *
 * What changed from v1, and why:
 * - **preview-first commit gestures** (the two-gesture fix): a row click used to add the
 *   SubPart AND close the dialog, so an exploratory click silently mutated the document.
 *   Selection now only drives the preview; committing takes a double-click, Enter, or one
 *   of the two footer buttons (see `browserCommon`);
 * - **fuzzy** id search over the shared `fuzzyMatch` subsequence matcher, replacing
 *   substring;
 * - **facets**: `Source` (one entry per Core `*Assets.xml`, the category axis the catalog
 *   already carries) and `Interior`, AND-composed with the search;
 * - a **result-cap row** instead of silently dropping matches past 200.
 *
 * Everything else is verbatim v1: the cover shell with its draggable splits resetting per
 * open, the fresh session every open (the body only mounts while open — a relied-upon
 * contract), the lighting-mirrored preview viewport, `PreviewLoadProgress` over it, the
 * `$browserPopupCount` workspace-progress suppression, and the details pane's fields.
 *
 * Undo enrollment: none here — every add is one discrete step inside `addSubPart`.
 */
export function SubPartBrowserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BrowserPopup title="Add SubPart" open={open} onOpenChange={onOpenChange}>
      <BrowserBody onClose={() => onOpenChange(false)} />
    </BrowserPopup>
  );
}

function BrowserBody({ onClose }: { onClose: () => void }) {
  const catalog = useStore($catalog);
  const loading = useStore($catalogLoading);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<string>(ALL_SOURCES);
  const [interior, setInterior] = useState<InteriorFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isPhone = useIsPhone();

  useEffect(() => {
    openBrowserPopup();
    return closeBrowserPopup;
  }, []);

  // One entry per distinct `*Assets.xml` the catalog was parsed from — the missing category
  // axis, for free, and always exactly the sources actually loaded.
  const sources = [...new Set(catalog.map((s) => s.sourceFile))].sort((a, b) => a.localeCompare(b));

  const matches = catalog.filter(
    (s) =>
      (source === ALL_SOURCES || s.sourceFile === source) &&
      (interior === 'all' || (interior === 'only') === (s.internal === true)) &&
      fuzzyFind(query, s.id).matched,
  );
  const filtered = matches.slice(0, MAX_RESULTS);

  const selected = selectedId ? (catalog.find((s) => s.id === selectedId) ?? null) : null;

  const onSelection = (keys: Selection) => {
    if (keys === 'all') return;
    setSelectedId(([...keys][0] as string) ?? null);
  };

  /** Origin, identity, unit scale, active layer, `<lastSegmentLower>_<n>` id, selected. */
  const add = (id: string) => {
    addSubPart(id);
    toast({ title: 'SubPart added', description: id });
  };

  const addSelected = () => {
    if (selectedId) add(selectedId);
  };

  const addAndClose = () => {
    if (!selectedId) return;
    add(selectedId);
    onClose();
  };

  const listPane = (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-panel-sunken">
      {loading ? (
        <div className="p-3 text-sm text-fg-subtle">Loading catalog…</div>
      ) : filtered.length === 0 ? (
        <div className="p-3 text-sm text-fg-subtle">No matches</div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <GridList
              aria-label="SubParts"
              selectionMode="single"
              // "replace": arrow keys move the actual selection (so keyboard navigation
              // drives the preview) and — with `onAction` present — react-aria routes a
              // MOUSE action to double-click and Enter only. That pairing is exactly the
              // preview-first gesture model; do not switch it to "toggle".
              selectionBehavior="replace"
              selectedKeys={selectedId ? [selectedId] : []}
              onSelectionChange={onSelection}
              // On touch react-aria performs the action on a single TAP, which would commit
              // before the preview is ever seen. Phone taps only select; the footer's [Add]
              // is the commit there (design §11.4).
              onAction={isPhone ? undefined : (key) => add(String(key))}
              items={filtered}
              dependencies={[query, source, interior]}
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
          </div>
          <ResultCapRow shown={filtered.length} total={matches.length} />
        </>
      )}
    </div>
  );

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
  );

  const detailsPane = (
    <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken p-3">
      {selected ? (
        <SubPartDetails subPart={selected} />
      ) : (
        <span className="text-sm text-fg-subtle">Select a SubPart to see its details.</span>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <SearchField
          size="sm"
          className="min-w-0 sm:flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search SubParts"
          aria-label="Search SubParts"
          // Autofocus raises the soft keyboard, which covers the preview on a
          // phone — only grab focus on desktop where typing-first is the norm.
          autoFocus={!isPhone}
        />
        <div className="flex items-center gap-2">
          <Select
            size="sm"
            aria-label="Source file"
            className="min-w-0 flex-1 sm:w-52 sm:flex-none"
            value={source}
            onChange={(k) => setSource(String(k))}
          >
            <ListBoxItem id={ALL_SOURCES}>All sources</ListBoxItem>
            {sources.map((file) => (
              <ListBoxItem key={file} id={file} textValue={file}>
                {file}
              </ListBoxItem>
            ))}
          </Select>
          <Select
            size="sm"
            aria-label="Interior filter"
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            value={interior}
            onChange={(k) => setInterior(String(k) as InteriorFilter)}
          >
            <ListBoxItem id="all">All</ListBoxItem>
            <ListBoxItem id="only">Interior only</ListBoxItem>
            <ListBoxItem id="exclude">Exclude interior</ListBoxItem>
          </Select>
        </div>
      </div>

      <BrowserLayout list={listPane} preview={previewPane} details={detailsPane} />

      <BrowserCommitRow isDisabled={!selectedId} onAdd={addSelected} onAddAndClose={addAndClose} />
    </div>
  );
}

/** Right-bottom panel on desktop: technical details for the highlighted SubPart. */
function SubPartDetails({ subPart }: { subPart: CatalogSubPart }) {
  const textures: { label: string; url?: string }[] = [
    { label: 'Diffuse', url: subPart.diffuseUrl },
    { label: 'Normal', url: subPart.normalUrl },
    { label: 'AO/Rough/Metal', url: subPart.aoRoughMetalUrl },
    { label: 'Emissive', url: subPart.emissiveUrl },
  ].filter((t) => t.url);

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
  );
}
