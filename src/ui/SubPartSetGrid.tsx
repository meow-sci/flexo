import { useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  Collection,
  GridList,
  GridListHeader,
  GridListItem,
  GridListSection,
  type Selection,
} from 'react-aria-components';
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, TriangleAlert } from 'lucide-react';
import { Button, Checkbox, Chip, Tooltip, cn, gridRowClass } from './kit';
import { useShiftRangeSelect } from './rangeSelect';
import {
  buildSubPartSetSections,
  enabledRowIds,
  sectionCheckState,
  type SubPartOwner,
  type SubPartSetFilter,
  type SubPartSetSection,
} from './subPartSetModel';
import { $part } from '../state/editorStore';
import { $layerView, toggleLayerVisible } from '../state/layerStore';

/**
 * **The shared SubPart Set Picker** (foundation §10.11; design-animation-mode.md §7.3): a
 * layer-sectioned, checkbox-model grid of the part's placed SubParts with live viewport
 * linkage hooks.
 *
 * Host-agnostic by construction — every piece of state is a prop, so the SAME component is
 * the docked Members view today (design D1) and the M overlay dialog for any future
 * pick-a-set-of-SubParts caller. The only stores it touches are the two the picker is
 * *about*: the document (which SubParts exist, on which layer) and the layer VIEW map, whose
 * eye it toggles so the viewport matches what you are picking.
 *
 * What it fixes versus `MeshPickerModal`: layers are visible and switchable, ownership is on
 * every row, hidden layers are dimmed rather than absent, locked layers refuse instead of
 * lying, and the search is fuzzy.
 *
 * **Undo enrollment: NONE.** Checking rows is view state; the host's Assign/Unassign buttons
 * push the document steps. The layer eye is view state too (never undoable, foundation §13).
 */
export interface SubPartSetGridProps {
  /** The checked instance ids — the host owns them (they survive a target-joint switch). */
  checked: ReadonlySet<string>;
  onCheckedChange: (next: Set<string>) => void;
  /** instanceId → the joint of the active clip that already drives it. */
  ownership: ReadonlyMap<string, SubPartOwner>;
  /** The joint an assign would write to: its members wear the accent chip. */
  targetJointId: string | null;
  /** instanceId → the name of ANOTHER clip that also drives it (amber ⚠ chip). */
  conflictClips: ReadonlyMap<string, string>;
  search: string;
  filter: SubPartSetFilter;
  /** Desktop hover → pulse that placement in the viewport. */
  onRowHover?: (instanceId: string | null) => void;
  /** Touch equivalent: a toggle (or a long-press) flashes the placement (§7.3). */
  onRowFlash?: (instanceId: string) => void;
  /** The empty-result "clear filters?" action. */
  onClearFilters?: () => void;
  /** Section collapse is host state so it survives a target switch, like the checked set. */
  collapsedLayers: ReadonlySet<string>;
  onToggleLayerCollapsed: (layerId: string) => void;
}

/** Long-press that pulses a row's placement WITHOUT toggling it (touch hover-preview, §7.3). */
const LONG_PRESS_MS = 250;

export function SubPartSetGrid(props: SubPartSetGridProps) {
  const {
    checked,
    onCheckedChange,
    ownership,
    targetJointId,
    conflictClips,
    search,
    filter,
    onRowHover,
    onRowFlash,
    onClearFilters,
    collapsedLayers,
    onToggleLayerCollapsed,
  } = props;
  const part = useStore($part);
  const layerView = useStore($layerView);
  /** The long-press timer + whether it fired (a fired press must not also toggle). */
  const longPress = useRef<{ timer: number; fired: boolean } | null>(null);

  const sections = buildSubPartSetSections({
    part,
    layerView,
    ownership,
    conflictClips,
    targetJointId,
    search,
    filter,
  });
  const visibleSections = sections.map((section) => ({
    section,
    rowsVisible: !collapsedLayers.has(section.layer.id),
  }));

  const shown = visibleSections.filter((v) => v.rowsVisible).map((v) => v.section);
  const orderedKeys = shown.flatMap((s) => s.rows.map((r) => r.instanceId));
  const disabledKeys = new Set(
    shown.flatMap((s) => s.rows.filter((r) => r.disabled).map((r) => r.instanceId)),
  );
  const liveKeys = new Set(orderedKeys);
  // react-aria rejects keys it cannot find, and a checked row can be filtered out at any
  // moment — the host's set stays whole, the list only shows the part of it on screen.
  const selectedKeys = new Set([...checked].filter((id) => liveKeys.has(id)));

  const range = useShiftRangeSelect({
    orderedKeys,
    selectedKeys,
    isSelectable: (key) => !disabledKeys.has(key),
  });

  const setChecked = (next: Set<string>) => {
    // Rows filtered off screen keep their checkmark: react-aria only ever reports what it
    // renders, so the off-screen part of the host's set is re-added here.
    const offscreen = [...checked].filter((id) => !liveKeys.has(id));
    onCheckedChange(new Set([...next, ...offscreen]));
  };

  const onSelectionChange = (reported: Selection) => {
    const keys = range.resolveSelection(reported);
    if (keys === 'all') {
      // ⌘A — every ENABLED row currently rendered (foundation §11.1: a list's own ⌘A keeps
      // precedence over the viewport's while it has focus).
      setChecked(new Set(enabledRowIds(shown)));
      return;
    }
    const next = new Set([...keys].map(String));
    const added = [...next].find((id) => !selectedKeys.has(id));
    if (added && onRowFlash) onRowFlash(added);
    setChecked(next);
  };

  const rowPointerHandlers = (instanceId: string, disabled: boolean) => ({
    onPointerDown: (e: React.PointerEvent) => {
      range.rowProps(instanceId).onPointerDown(e);
      if (disabled || e.button !== 0) return;
      const timer = window.setTimeout(() => {
        longPress.current = { timer, fired: true };
        onRowHover?.(instanceId);
        onRowFlash?.(instanceId);
      }, LONG_PRESS_MS);
      longPress.current = { timer, fired: false };
    },
    onPointerUp: () => {
      const press = longPress.current;
      longPress.current = null;
      if (press) window.clearTimeout(press.timer);
    },
    onPointerCancel: () => {
      const press = longPress.current;
      longPress.current = null;
      if (press) window.clearTimeout(press.timer);
    },
    onPointerEnter: () => onRowHover?.(instanceId),
    onPointerLeave: () => onRowHover?.(null),
  });

  const nothingShown = sections.every((s) => s.rows.length === 0);
  if (sections.length === 0) {
    return <p className="px-2 py-3 text-xs text-fg-subtle">No SubParts placed yet.</p>;
  }
  if (nothingShown) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-fg-subtle">
        <span className="min-w-0 flex-1">No SubParts match — clear filters?</span>
        <Button size="xs" variant="ghost" onPress={() => onClearFilters?.()}>
          Clear
        </Button>
      </div>
    );
  }

  return (
    <GridList
      aria-label="SubParts"
      selectionMode="multiple"
      items={visibleSections}
      selectedKeys={selectedKeys}
      disabledKeys={disabledKeys}
      disabledBehavior="all"
      onSelectionChange={onSelectionChange}
      dependencies={[search, filter, targetJointId, ownership, checked, collapsedLayers, part]}
      className="flex flex-col gap-0.5 outline-none"
    >
      {({ section, rowsVisible }: (typeof visibleSections)[number]) => (
        <GridListSection id={section.layer.id} className="flex flex-col">
          <GridListHeader>
            <SectionHeader
              section={section}
              checked={checked}
              collapsed={!rowsVisible}
              onToggleCollapsed={() => onToggleLayerCollapsed(section.layer.id)}
              onCheckAll={(ids, on) => {
                const next = new Set(checked);
                for (const id of ids) {
                  if (on) next.add(id);
                  else next.delete(id);
                }
                onCheckedChange(next);
              }}
            />
          </GridListHeader>
          <Collection items={rowsVisible ? section.rows : []} dependencies={[checked, search]}>
            {(row: SubPartSetSection['rows'][number]) => (
              <GridListItem
                id={row.instanceId}
                textValue={row.instanceId}
                {...rowPointerHandlers(row.instanceId, row.disabled)}
                className={(rp) =>
                  cn(gridRowClass(rp), 'gap-1.5 py-(--density-row-py)', row.dimmed && 'opacity-40')
                }
              >
                <Checkbox
                  slot="selection"
                  aria-label={`Select ${row.instanceId}`}
                  isDisabled={row.disabled}
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={row.instanceId}>
                  {row.instanceId}
                </span>
                <span
                  className="min-w-0 shrink truncate text-[11px] text-fg-subtle"
                  title={row.templateId}
                >
                  {row.templateCaption}
                </span>
                {row.disabled && (
                  <Tooltip content="Layer is locked">
                    <Lock className="size-3 shrink-0 text-fg-subtle" aria-label="Layer is locked" />
                  </Tooltip>
                )}
                {row.conflictClip && (
                  <Tooltip
                    content={`Also a member in "${row.conflictClip}" — KSA modules will fight over it`}
                  >
                    <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-warning">
                      <TriangleAlert className="size-3" aria-hidden />
                      also in “{row.conflictClip}”
                    </span>
                  </Tooltip>
                )}
                <span
                  className={cn(
                    'shrink-0 text-[11px]',
                    row.owner
                      ? row.owner.jointId === targetJointId
                        ? 'text-accent'
                        : 'text-fg-muted'
                      : 'text-fg-subtle',
                  )}
                >
                  {row.owner ? `→ ${row.owner.jointName}` : '—'}
                </span>
              </GridListItem>
            )}
          </Collection>
        </GridListSection>
      )}
    </GridList>
  );
}

/** One layer header: collapse · name · count · "N assigned" · the REAL eye · tri-state all. */
function SectionHeader({
  section,
  checked,
  collapsed,
  onToggleCollapsed,
  onCheckAll,
}: {
  section: SubPartSetSection;
  checked: ReadonlySet<string>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCheckAll: (ids: string[], on: boolean) => void;
}) {
  const state = sectionCheckState(section, checked);
  return (
    <div className="flex items-center gap-1 px-1 py-0.5 text-xs">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
      >
        {collapsed ? (
          <ChevronRight className="size-3 shrink-0" />
        ) : (
          <ChevronDown className="size-3 shrink-0" />
        )}
        <span className="min-w-0 truncate font-medium text-fg">{section.layer.name}</span>
        <span className="shrink-0 tabular-nums text-fg-subtle">({section.total})</span>
        {!section.view.visible && <span className="shrink-0 text-fg-subtle">— hidden</span>}
      </button>
      {section.assigned > 0 && <Chip className="shrink-0">{section.assigned} assigned</Chip>}
      <Tooltip content={section.view.visible ? 'Hide this layer' : 'Show this layer'}>
        <Button
          iconOnly
          size="xs"
          variant="ghost"
          className="size-5 shrink-0"
          aria-label={section.view.visible ? 'Hide this layer' : 'Show this layer'}
          onPress={() => toggleLayerVisible(section.layer.id)}
        >
          {section.view.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
        </Button>
      </Tooltip>
      <Checkbox
        aria-label={`Check every SubPart on ${section.layer.name}`}
        isDisabled={state.enabledIds.length === 0}
        isSelected={state.checked}
        isIndeterminate={state.indeterminate}
        onChange={(on) => onCheckAll(state.enabledIds, on)}
      />
    </div>
  );
}
