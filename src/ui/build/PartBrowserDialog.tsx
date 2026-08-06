import { useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import {
  GridList,
  GridListItem,
  ListBoxItem,
  SearchField,
  SectionTitle,
  Select,
  ToggleButton,
  useIsPhone,
} from '../kit';
import type { CatalogPart } from '../../ksa/partCatalog';
import { ENTITY_ONLY_LAYER_IDS, type Layer } from '../../ksa/types';
import { $catalogIndex } from '../../state/catalogStore';
import { $partCatalog, $partCatalogLoading } from '../../state/partCatalogStore';
import { $part, createLayer } from '../../state/editorStore';
import { importBuiltInPart } from '../../state/partImport';
import { revealLayer } from '../../state/layerStore';
import { PartPreview } from '../PartPreview';
import { PreviewLoadProgress } from '../LoadProgress';
import { BrowserLayout, BrowserPopup } from '../BrowserShell';
import { fuzzyAny } from '../fuzzyMatch';
import { toast } from '../toast';
import { BrowserCommitRow, MAX_RESULTS, ResultCapRow } from './browserCommon';

const NEW_LAYER = '__new_layer__';
const CURRENT_LAYER = '__current_layer__';

/** Next free "New Layer N" name (max existing numeric suffix + 1). */
function nextNewLayerName(layers: readonly Layer[]): string {
  let max = 0;
  for (const l of layers) {
    const m = /^New Layer (\d+)$/.exec(l.name);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `New Layer ${max + 1}`;
}

/**
 * **Add Built-in Part** (design: design-build-mode.md §6.3; foundation §10.10) — the same
 * cover shell and the same preview-first commit gestures as the SubPart browser
 * (`browserCommon`), over the Part catalog.
 *
 * What changed from v1:
 * - **preview-first**: a row click previews; double-click / Enter / `[Add]` import and stay,
 *   `[Add & Close]` imports and exits. An import is expensive and layer-creating, so an
 *   accidental row click committing one was the worst instance of the v1 gesture ambiguity;
 * - **fuzzy** search over id AND `<EditorTag>`s (was substring);
 * - a **tag chip row** — every distinct editor tag as a toggle; active chips AND-filter,
 *   which is the browsable facet the census asked for;
 * - a **result-cap row** instead of silently dropping matches past 200.
 *
 * Verbatim from v1: the destination-layer Select (New Layer / Current Layer / any ordinary
 * layer, pinned ones filtered), the whole `importBuiltInPart` pipeline (animation GLB decode
 * + easing fit + `restKeyframeId` deploy anchoring + GLB-faithful rest poses, id
 * regeneration with full reference remapping, ImportedGameData carried whole, ONE undo step
 * `'import'`, all geometry on ONE layer), the `revealLayer` afterwards so an import never
 * lands invisible, the details pane, and the phone `CompactPartSummary` strip.
 *
 * Undo enrollment: none here — `importBuiltInPart` owns its single `'import'` step.
 */
export function PartBrowserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BrowserPopup title="Add Part" open={open} onOpenChange={onOpenChange}>
      <BrowserBody onClose={() => onOpenChange(false)} />
    </BrowserPopup>
  );
}

function BrowserBody({ onClose }: { onClose: () => void }) {
  const catalog = useStore($partCatalog);
  const loading = useStore($partCatalogLoading);
  const subPartIndex = useStore($catalogIndex);
  const part = useStore($part);
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<readonly string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetLayer, setTargetLayer] = useState<string>(NEW_LAYER);
  const isPhone = useIsPhone();

  const allTags = [...new Set(catalog.flatMap((p) => p.editorTags))].sort((a, b) =>
    a.localeCompare(b),
  );

  // Chips AND-compose with each other and with the search: "Fuel Tanks" + "Large" means a
  // part carrying BOTH tags, not either.
  const matches = catalog.filter(
    (p) =>
      activeTags.every((tag) => p.editorTags.includes(tag)) &&
      fuzzyAny(query, p.id, ...p.editorTags),
  );
  const filtered = matches.slice(0, MAX_RESULTS);

  const selected = selectedId ? (catalog.find((p) => p.id === selectedId) ?? null) : null;

  const onSelection = (keys: Selection) => {
    if (keys === 'all') return;
    setSelectedId(([...keys][0] as string) ?? null);
  };

  const resolveLayerId = () =>
    targetLayer === NEW_LAYER
      ? createLayer(nextNewLayerName(part.layers))
      : targetLayer === CURRENT_LAYER
        ? undefined
        : targetLayer;

  // `importBuiltInPart` imports the SubParts + any keyframe animations, selects what it
  // imported, and returns the layer it landed on; reveal it (visible + listed) so the import
  // is never hidden.
  const importPart = async (p: CatalogPart) => {
    revealLayer(await importBuiltInPart(p, resolveLayerId()));
    toast({ title: 'Part added', description: p.id });
  };

  const add = () => {
    if (selected) void importPart(selected);
  };

  const addAndClose = () => {
    if (!selected) return;
    void importPart(selected).then(onClose);
  };

  const listPane = (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-panel-sunken">
      {loading ? (
        <div className="p-3 text-sm text-fg-subtle">Loading parts…</div>
      ) : filtered.length === 0 ? (
        <div className="p-3 text-sm text-fg-subtle">No matches</div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <GridList
              aria-label="Parts"
              selectionMode="single"
              // "replace": arrow keys move the actual selection (so keyboard navigation
              // drives the preview) and — with `onAction` present — react-aria routes a
              // MOUSE action to double-click and Enter only. That pairing IS the
              // preview-first gesture model.
              selectionBehavior="replace"
              selectedKeys={selectedId ? [selectedId] : []}
              onSelectionChange={onSelection}
              // On touch react-aria performs the action on a single TAP, which would import
              // before the preview is ever seen. Phone taps only select; the footer's [Add]
              // is the commit there (design §11.4).
              onAction={
                isPhone
                  ? undefined
                  : (key) => {
                      const p = catalog.find((c) => c.id === String(key));
                      if (p) void importPart(p);
                    }
              }
              items={filtered}
              dependencies={[query, activeTags]}
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
          </div>
          <ResultCapRow shown={filtered.length} total={matches.length} />
        </>
      )}
    </div>
  );

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
  );

  const detailsPane = (
    <div className="h-full overflow-auto rounded-lg border border-border bg-panel-sunken p-3">
      {selected ? (
        <PartDetails part={selected} subPartIndex={subPartIndex} />
      ) : (
        <span className="text-sm text-fg-subtle">Select a Part to see its details.</span>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5">
      {/*
        Phone stacks search on its own full-width row (so it isn't squeezed
        beside the 176px layer Select) with the Select on a second row; sm+
        keeps the single search | select row.
      */}
      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <SearchField
          size="sm"
          className="min-w-0 sm:flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search Parts and tags"
          aria-label="Search Parts"
          // Autofocus raises the soft keyboard, which covers the preview on a
          // phone — only grab focus on desktop where typing-first is the norm.
          autoFocus={!isPhone}
        />
        <Select
          size="sm"
          aria-label="Import into layer"
          className="min-w-0 sm:w-44 sm:flex-none"
          value={targetLayer}
          onChange={(k) => setTargetLayer(String(k))}
        >
          <ListBoxItem id={NEW_LAYER}>New Layer</ListBoxItem>
          <ListBoxItem id={CURRENT_LAYER}>Current Layer</ListBoxItem>
          {/* Only ordinary layers: the pinned ones (IVA seats / lights / kittens) hold
              their own kind exclusively and would reject the import. */}
          {part.layers
            .filter((l) => !ENTITY_ONLY_LAYER_IDS.includes(l.id))
            .map((l) => (
              <ListBoxItem key={l.id} id={l.id} textValue={l.name}>
                {l.name}
              </ListBoxItem>
            ))}
        </Select>
      </div>

      {allTags.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1">
          {allTags.map((tag) => (
            <ToggleButton
              key={tag}
              size="xs"
              className="flex-none"
              isSelected={activeTags.includes(tag)}
              onChange={(on) =>
                setActiveTags(on ? [...activeTags, tag] : activeTags.filter((t) => t !== tag))
              }
            >
              {tag}
            </ToggleButton>
          ))}
        </div>
      )}

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

      <BrowserCommitRow isDisabled={!selected} onAdd={add} onAddAndClose={addAndClose} />
    </div>
  );
}

/**
 * Compact horizontal strip used on phone (above the preview) — counts + source
 * + tags in one wrappable row. Desktop uses the richer {@link PartDetails}.
 */
function CompactPartSummary({
  part,
  subPartIndex,
}: {
  part: CatalogPart;
  subPartIndex: Map<string, unknown>;
}) {
  const uniqueTypes = new Set(part.placements.map((p) => p.subPartTemplateId));
  const missing = [...uniqueTypes].filter((t) => !subPartIndex.has(t)).length;

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
  );
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
  part: CatalogPart;
  subPartIndex: Map<string, unknown>;
}) {
  const counts = new Map<string, number>();
  for (const p of part.placements) {
    counts.set(p.subPartTemplateId, (counts.get(p.subPartTemplateId) ?? 0) + 1);
  }
  const breakdown = Array.from(counts, ([templateId, count]) => ({ templateId, count })).sort(
    (a, b) => b.count - a.count || a.templateId.localeCompare(b.templateId),
  );

  const missing = breakdown.filter((b) => !subPartIndex.has(b.templateId)).length;

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
            const previewable = subPartIndex.has(b.templateId);
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
            );
          })}
        </ul>
      </div>
    </div>
  );
}
