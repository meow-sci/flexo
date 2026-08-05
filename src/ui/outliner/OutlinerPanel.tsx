import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Collection,
  GridList,
  GridListHeader,
  GridListItem,
  GridListSection,
  MenuTrigger,
  type Selection,
} from 'react-aria-components';
import { EyeOff, Search } from 'lucide-react';
import { Button, Popover, SearchField, TextField, cn, gridRowClass } from '../kit';
import {
  $part,
  $revealEntity,
  $selection,
  createLayer,
  refLayerId,
  select,
  type EntityKind,
  type SelectionRef,
} from '../../state/editorStore';
import { $catalogIndex } from '../../state/catalogStore';
import { $layerView, expandLayer, toggleLayerCollapsed } from '../../state/layerStore';
import { $kindVisibility, isKindVisible } from '../../state/viewStore';
import { runCommand } from '../../state/commandStore';
import { focusViewport } from '../../three/viewportFocus';
import { useShiftRangeSelect } from '../rangeSelect';
import { LAYER_COLOR_HEX } from './layerColors';
import { DND_ENTITY, LayerHeaderRow } from './LayerHeaderRow';
import { AidsSection } from './AidsSection';
import { EntityMenu, EntityRow } from './EntityRow';
import { $outlinerSearchFocus } from './outlinerSearch';
import { buildOutlinerTree, type OutlinerLayerSection, type OutlinerRow } from './outlinerTree';

/**
 * **The Outliner** — Build mode's right sidebar (design: design-build-mode.md §1.3, §2;
 * foundation §8.1). One tree replacing v1's Assets list + Assets toolbar + the Layers
 * button/popover + the opacity popover-in-a-popover.
 *
 * The row model is the pure {@link buildOutlinerTree}; this component only renders it and
 * owns the gestures:
 * - ONE react-aria `GridList` spans every layer, so a multi-select — and a ⇧-range — crosses
 *   layers and kinds exactly as it did in v1;
 * - row keys ARE `kind:id`, i.e. `SelectionRef`s, so `onSelectionChange` parses instead of
 *   partitioning six index maps;
 * - locked-layer rows are disabled; hidden-layer rows stay listed but refuse selection
 *   (mirroring 3D, where hidden means unpickable);
 * - `⇧-click` ranges run through {@link useShiftRangeSelect} (grow-only, nearest-anchor,
 *   holes preserved) because react-aria's own extension cannot survive a store-controlled
 *   list;
 * - right-click opens the row's own menu AT THE CURSOR through one controlled popover
 *   anchored to a 0×0 fixed div — real context-menu positioning, replacing v1's
 *   synthetic-click-on-the-⋮-button hack;
 * - dragging entity rows onto a layer header moves the whole movable selection there.
 *
 * Undo enrollment: NONE. Selection, search text and the collapsed flags are all view state;
 * the document mutations reachable from here (layer edits, row menu actions) each push their
 * own undo step inside their store mutator.
 */
export function OutlinerPanel() {
  const part = useStore($part);
  const layerView = useStore($layerView);
  const selection = useStore($selection);
  const catalogIndex = useStore($catalogIndex);
  // Only to re-render the kind subheaders' crossed-eye glyph; the predicate reads the
  // merge helper, never this raw value (a stored object may be missing a kind).
  const kindVisibility = useStore($kindVisibility);
  const reveal = useStore($revealEntity);
  const searchFocusNonce = useStore($outlinerSearchFocus);
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  /** The selection as it stood the instant a row was pressed — see the row's `onDragStart`. */
  const pressSelection = useRef<readonly SelectionRef[]>([]);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [contextRow, setContextRow] = useState<{ row: OutlinerRow; x: number; y: number } | null>(
    null,
  );
  const [creating, setCreating] = useState(false);

  const query = search.trim();
  const filtering = query.length > 0;
  const tree = buildOutlinerTree(part, layerView, query, catalogIndex);

  // While filtering, layers auto-expand so a match is never hidden behind a chevron — the
  // STORED collapsed flags are left alone, so clearing the query restores the user's shape.
  // An unlisted layer collapses to its ghost header (design §2.2) but keeps its counts.
  const sections = tree.map((section) => ({
    section,
    rowsVisible:
      section.view.listed && (filtering || !section.view.collapsed) && section.groups.length > 0,
  }));

  const rowsOf = (section: OutlinerLayerSection): OutlinerRow[] =>
    section.groups.flatMap((group) => group.rows);

  // Every row currently rendered, in display order — the ⇧-range's universe.
  const orderedKeys: string[] = [];
  const disabledKeys = new Set<string>();
  const hiddenKeys = new Set<string>();
  const liveKeys = new Set<string>();
  for (const { section, rowsVisible } of sections) {
    if (!rowsVisible) continue;
    for (const row of rowsOf(section)) {
      orderedKeys.push(row.key);
      liveKeys.add(row.key);
      if (section.view.locked) disabledKeys.add(row.key);
      if (row.hidden) hiddenKeys.add(row.key);
    }
  }
  // Kind subheaders ride the collection as non-selectable rows (the plan's sanctioned
  // alternative to a second section level, which react-aria has no notion of).
  for (const { section, rowsVisible } of sections) {
    if (!rowsVisible || !showsSubheaders(section)) continue;
    for (const group of section.groups) disabledKeys.add(subheaderKey(section, group.kind));
  }

  // Controlled selection, filtered to what is actually on screen: react-aria rejects keys
  // it cannot find, and a selected entity can be filtered out by the search at any moment.
  const selectedKeys = new Set(selection.map(refKey).filter((key) => liveKeys.has(key)));

  const range = useShiftRangeSelect({
    orderedKeys,
    selectedKeys,
    isSelectable: (key) => !disabledKeys.has(key) && !hiddenKeys.has(key),
  });

  const onSelectionChange = (reported: Selection) => {
    const keys = range.resolveSelection(reported);
    if (keys === 'all') {
      // ⌘A — every ENABLED row (visible + unlocked), all kinds, all layers. Same rule the
      // Select ▸ All command uses, applied to what this list is currently showing.
      const refs: SelectionRef[] = [];
      for (const { section, rowsVisible } of sections) {
        if (!rowsVisible || section.view.locked || !section.view.visible) continue;
        for (const row of rowsOf(section)) refs.push({ kind: row.kind, id: row.id });
      }
      select(refs);
      return;
    }
    const next = [...keys].map(String);
    // Clicking a hidden-layer row may not select it (matches the 3D visible rule); ignore
    // the whole event so the current selection is preserved.
    const added = next.find((key) => !selectedKeys.has(key));
    if (added != null && hiddenKeys.has(added)) return;
    select(next.flatMap((key) => (hiddenKeys.has(key) ? [] : [parseRefKey(key)])));
  };

  // `⌘F` (and the header's 🔍 button) focuses the field. A nonce, so pressing it again
  // while focused still re-selects the text.
  useEffect(() => {
    if (searchFocusNonce === 0) return;
    const input = searchRef.current?.querySelector('input');
    input?.focus();
    input?.select();
  }, [searchFocusNonce]);

  // A 3D-viewport click can't tell the list to scroll; it signals via $revealEntity. Expand
  // the entity's layer FIRST (a collapsed layer has no row to scroll to), then scroll and
  // flash. The DOM query is v1's, kept deliberately — the behavior contract is the scroll.
  useEffect(() => {
    if (!reveal) return;
    const key = `${reveal.kind}:${reveal.id}`;
    const layerId = refLayerId($part.get(), reveal);
    if (layerId) expandLayer(layerId);
    // One frame later, so the expand above has actually rendered the row. The atom is
    // consumed INSIDE the callback, not before it: nulling it early re-runs this effect,
    // whose cleanup would then cancel the very frame it just scheduled.
    const raf = requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-outliner-key="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
      setFlashKey(key);
      $revealEntity.set(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [reveal]);

  // Drop the flash ~800ms after it lands (design §2.4 "scrolls + flashes the row").
  useEffect(() => {
    if (flashKey === null) return;
    const timer = setTimeout(() => setFlashKey(null), 800);
    return () => clearTimeout(timer);
  }, [flashKey]);

  const isEmpty = tree.every((section) => section.total === 0);
  // The GridList always has section items (every layer renders a header), so "no matches"
  // can never come from `renderEmptyState` — it is a branch of its own.
  const noMatches = filtering && !isEmpty && tree.every((section) => section.shown === 0);

  const createFrom = (name: string) => {
    setCreating(false);
    const id = createLayer(name);
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-outliner-layer="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  };

  return (
    // `data-surface="outliner"` puts the panel in the `surface:outliner` hotkey scope
    // (`src/state/hotkeyStore.ts`): ⌘F lives there, and so do the ⌘C/⌘X/⌘V/⌘D/⌫/⇧⌘I edit
    // mirrors that keep working after range-selecting rows (foundation §11.1).
    <div
      data-surface="outliner"
      className="flex h-full min-h-0 flex-col gap-1 rounded-xl border border-border bg-panel p-(--density-panel-p)"
    >
      <div className="flex items-center gap-1 px-1">
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Outliner
        </span>
        <Button
          iconOnly
          size="sm"
          variant="ghost"
          className="size-6"
          aria-label="Search the Outliner"
          onPress={() => {
            const input = searchRef.current?.querySelector('input');
            input?.focus();
            input?.select();
          }}
        >
          <Search className="size-3.5" />
        </Button>
      </div>

      <div ref={searchRef} className="px-1">
        <SearchField
          size="sm"
          aria-label="Filter entities"
          placeholder="Filter entities…"
          value={search}
          onChange={setSearch}
          // First Escape clears the field (react-aria's own SearchField behavior); a second
          // one, with nothing left to clear, hands focus back to the viewport (design §2.5).
          // react-aria already stops propagation by default, so the Esc ladder never sees
          // this key — which is what we want: the field owns Escape while it has focus.
          onKeyDown={(e) => {
            if (e.key === 'Escape' && search.length === 0) focusViewport();
          }}
        />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {/* The mode empty state is a BANNER, not a replacement: the layer list has to stay
            reachable or a layer created from ＋ Layer would have nowhere to appear. */}
        {isEmpty && <EmptyWorkspace />}
        {noMatches ? (
          <NoMatches query={query} onClear={() => setSearch('')} />
        ) : (
          <GridList
            aria-label="Outliner"
            selectionMode="multiple"
            selectionBehavior="replace"
            items={sections}
            selectedKeys={selectedKeys}
            disabledKeys={disabledKeys}
            onSelectionChange={onSelectionChange}
            dependencies={[search, layerView, part]}
            className="flex flex-col gap-0.5 outline-none"
          >
            {({ section, rowsVisible }: (typeof sections)[number]) => (
              <GridListSection id={section.layer.id} className="flex flex-col">
                <GridListHeader>
                  <LayerHeaderRow
                    section={section}
                    collapsed={!filtering && section.view.collapsed}
                    onToggleCollapsed={() => toggleLayerCollapsed(section.layer.id)}
                  />
                </GridListHeader>
                <Collection
                  items={rowsVisible ? itemsFor(section) : []}
                  dependencies={[search, flashKey, kindVisibility]}
                >
                  {(item: Item) =>
                    item.kind === 'subheader' ? (
                      <GridListItem
                        id={item.key}
                        textValue={item.label}
                        className="flex cursor-default items-center gap-1 px-2 pt-1 text-[11px] uppercase tracking-wide text-fg-subtle outline-none"
                      >
                        <span>
                          {item.label} ({item.count})
                        </span>
                        {/* View ▸ Display Filters hid this kind: say so where the rows are,
                            so "my connectors vanished" is never a mystery (design §5.4). */}
                        {item.filteredOff && (
                          <EyeOff
                            size={11}
                            className="shrink-0"
                            aria-label="Hidden by View ▸ Display Filters"
                          />
                        )}
                      </GridListItem>
                    ) : (
                      <GridListItem
                        id={item.key}
                        // Mirrors the key onto the DOM (react-aria strips `id`) so the
                        // $revealEntity scroll can find this row.
                        data-outliner-key={item.key}
                        textValue={item.row.name}
                        {...range.rowProps(item.key)}
                        // Real context-menu positioning: record the cursor, let the ONE
                        // controlled popover below open there. ⇧-right-click never ranges —
                        // `useShiftRangeSelect` ignores non-primary buttons.
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextRow({ row: item.row, x: e.clientX, y: e.clientY });
                        }}
                        className={(rp) =>
                          cn(
                            gridRowClass(rp),
                            'py-(--density-row-py)',
                            item.row.hidden && 'opacity-40',
                            flashKey === item.key && 'row-flash',
                          )
                        }
                      >
                        <EntityRow
                          row={item.row}
                          tint={
                            section.layer.color ? LAYER_COLOR_HEX[section.layer.color] : undefined
                          }
                          onPointerDown={() => {
                            pressSelection.current = $selection.get();
                          }}
                          // Dragging a row drags the SELECTION (design §2.4). The selection
                          // read here is the PRE-PRESS one: react-aria replaces the selection
                          // on press-down, so by the time `dragstart` fires the other rows
                          // are already gone. A row that was not in it becomes the selection
                          // instead, so the gesture reads the same for one row or five.
                          onDragStart={(e) => {
                            const prior = pressSelection.current;
                            select(
                              prior.some((r) => refKey(r) === item.key)
                                ? prior
                                : [parseRefKey(item.key)],
                            );
                            e.dataTransfer.setData(DND_ENTITY, item.key);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                        />
                      </GridListItem>
                    )
                  }
                </Collection>
              </GridListSection>
            )}
          </GridList>
        )}

        {!noMatches && (
          <div className="px-1 pt-1">
            {creating ? (
              <NewLayerInput onCommit={createFrom} onCancel={() => setCreating(false)} />
            ) : (
              <Button
                size="xs"
                variant="ghost"
                className="w-full justify-start text-fg-subtle"
                onPress={() => setCreating(true)}
              >
                ＋ Layer
              </Button>
            )}
          </div>
        )}
      </div>

      <AidsSection />

      {/* The context menu: a 0×0 anchor pinned at the cursor, driving the same per-kind menu
          the row's ⋮ button opens. Both mount their items inside a `Popover`, so every
          predicate in them re-evaluates on each open (React Compiler). */}
      <MenuTrigger
        isOpen={contextRow !== null}
        onOpenChange={(open) => {
          if (!open) setContextRow(null);
        }}
      >
        <Button
          aria-label="Row context menu"
          className="pointer-events-none fixed size-0 min-h-0 overflow-hidden border-0 p-0 opacity-0"
          style={{ left: contextRow?.x ?? 0, top: contextRow?.y ?? 0 }}
        />
        <Popover placement="bottom start" className="w-56">
          {contextRow && <EntityMenu row={contextRow.row} />}
        </Popover>
      </MenuTrigger>
    </div>
  );
}

/** A collection entry: either a kind subheader (inert) or an entity row. */
type Item =
  | { kind: 'subheader'; key: string; label: string; count: number; filteredOff: boolean }
  | { kind: 'row'; key: string; row: OutlinerRow };

/**
 * Is this kind currently hidden by **View ▸ Display Filters**? Drives the subheader's
 * crossed-eye glyph (design-build-mode.md §5.4: "state visible, rows untouched" — the rows
 * themselves keep their normal styling, because the entities still exist and are still
 * listed; only the viewport stops drawing them).
 */
function isKindFilteredOff(kind: EntityKind): boolean {
  return kind !== 'subpart' && !isKindVisible(kind);
}

/**
 * Whether a layer draws its kind subheaders. A pinned entity-only layer can only ever hold
 * ONE kind, so "IVA SEATS (2)" under a header already reading "IVA Seats 2" is pure noise —
 * design §2.1's wireframe shows those layers bare.
 */
function showsSubheaders(section: OutlinerLayerSection): boolean {
  return !(section.pinned && section.groups.length === 1);
}

/** Subheader keys are namespaced so they can never collide with a `kind:id` row key. */
function subheaderKey(section: OutlinerLayerSection, kind: EntityKind): string {
  return `header@${section.layer.id}@${kind}`;
}

/** A layer's rows, interleaved with their kind subheaders, in display order. */
function itemsFor(section: OutlinerLayerSection): Item[] {
  const withHeaders = showsSubheaders(section);
  return section.groups.flatMap((group): Item[] => [
    ...(withHeaders
      ? [
          {
            kind: 'subheader' as const,
            key: subheaderKey(section, group.kind),
            label: group.label,
            count: group.rows.length,
            filteredOff: isKindFilteredOff(group.kind),
          },
        ]
      : []),
    ...group.rows.map((row): Item => ({ kind: 'row', key: row.key, row })),
  ]);
}

const refKey = (ref: SelectionRef): string => `${ref.kind}:${ref.id}`;

/** `kind:id` → the ref it names. Split at the FIRST colon; ids may contain more. */
function parseRefKey(key: string): SelectionRef {
  const i = key.indexOf(':');
  return { kind: key.slice(0, i) as EntityKind, id: key.slice(i + 1) };
}

/** The ＋ Layer create row's inline field: Enter (or blur with text) creates, Esc cancels. */
function NewLayerInput({
  onCommit,
  onCancel,
}: {
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <TextField
      size="sm"
      autoFocus
      aria-label="New layer name"
      placeholder="Layer name (blank = Layer N)"
      value={draft}
      onChange={setDraft}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onCommit(draft);
        else if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

/** Nothing placed at all — first-run guidance doubling as the mode empty state (§2.7). */
function EmptyWorkspace() {
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-6">
      <p className="text-xs text-fg-subtle">Nothing placed yet.</p>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" onPress={() => void runCommand('add.subpart')}>
          Add SubPart…
        </Button>
        <Button size="sm" variant="secondary" onPress={() => void runCommand('add.importModel')}>
          Import Model…
        </Button>
        <Button size="sm" variant="secondary" onPress={() => void runCommand('file.projects')}>
          Open Projects…
        </Button>
      </div>
    </div>
  );
}

/** Search matched nothing (§2.7). */
function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 py-3 text-xs text-fg-subtle">
      <span className="min-w-0 truncate">No matches for “{query}”</span>
      <Button size="sm" variant="ghost" onPress={onClear}>
        Clear
      </Button>
    </div>
  );
}
