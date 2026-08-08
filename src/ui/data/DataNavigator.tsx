import { useState } from 'react';
import { useStore } from '@nanostores/react';
import type { Selection } from 'react-aria-components';
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import {
  Button,
  Chip,
  GridList,
  GridListItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  SearchField,
  Tooltip,
  cn,
  isPhoneViewport,
  useIsPhone,
} from '../kit';
import { FindingsList } from './FindingsList';
import { buildDataNavigator, type DataNavEntityRow, type IssueLevel } from './dataNavigatorModel';
import {
  $dataScope,
  $dataSearch,
  $gameDataFindings,
  clearFlash,
  flashPlacements,
  focusFinding,
  jumpToSection,
  setDataScope,
  setDataSearch,
  type DataScope,
  type DataSectionId,
  type GameDataFinding,
} from '../../state/dataModeStore';
import {
  $part,
  addLight,
  addSubPartSolarPanel,
  addTank,
  revealEntity,
  select,
} from '../../state/editorStore';
import { setMode } from '../../state/modeStore';
import { $partScopeName } from '../../state/partsStore';
import { openInspectorSheet } from '../shell/phone/phoneSheets';
import { focusViewport } from '../../three/viewportFocus';

/**
 * **The Data Navigator** — Data mode's right sidebar (design:
 * design-data-engine-modes.md §A3; foundation §8.3, §15.3).
 *
 * The pinned Part root, one row per SubPart template, and the disabled-style "not
 * data-capable" inventory the brief requires — over the pure {@link buildDataNavigator} row
 * model, so every count recipe is tested without a DOM. Selecting a row IS choosing the
 * scope the left form shows; expanding a row reveals its section child rows, and clicking one
 * scopes AND fires the section jump the form scroll-and-flashes on.
 *
 * Only SCOPE rows are selectable; section, header and non-capable rows ride the same
 * collection as disabled items (`disabledBehavior="selection"` keeps them focusable, so the
 * explainer tooltips stay reachable — design §A3) and act through their own inline controls.
 *
 * **Undo enrollment: NONE of its own.** Scope, search and the expand flags are ephemeral view
 * state; the one mutation reachable from here ("＋ add data") is a discrete editorStore action
 * that pushes its own single step.
 */
export function DataNavigator() {
  const isPhone = useIsPhone();
  const part = useStore($part);
  const scope = useStore($dataScope);
  const search = useStore($dataSearch);
  const findings = useStore($gameDataFindings);
  // Null in a single-part project, so the pinned root row reads exactly as before (I8).
  const partScopeName = useStore($partScopeName);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(['part']));
  const [nonCapableOpen, setNonCapableOpen] = useState(false);

  const model = buildDataNavigator(part, findings, search, partScopeName);
  const scopeKey = scopeToKey(scope);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const rows: NavItem[] = [
    { type: 'scope', key: 'part', row: model.part },
    ...(expanded.has('part')
      ? model.part.sections.map(
          (section): NavItem => ({
            type: 'section',
            key: `sec|part|${section.sectionId}`,
            scope: { kind: 'part' } as DataScope,
            section,
          }),
        )
      : []),
  ];

  if (model.templates.length > 0) {
    rows.push({ type: 'header', key: 'hdr|templates', label: 'SubPart templates' });
    for (const template of model.templates) {
      rows.push({ type: 'scope', key: template.key, row: template });
      if (!expanded.has(template.key)) continue;
      for (const section of template.sections) {
        rows.push({
          type: 'section',
          key: `sec|${template.templateId}|${section.sectionId}`,
          scope: { kind: 'template', templateId: template.templateId },
          section,
        });
      }
    }
  }

  if (model.nonCapable.length > 0) {
    rows.push({
      type: 'header',
      key: 'hdr|noncapable',
      label: `not data-capable (${model.nonCapable.length})`,
      collapsible: true,
    });
    if (nonCapableOpen) {
      for (const entity of model.nonCapable) rows.push({ type: 'entity', key: entity.key, entity });
    }
  }

  const disabledKeys = rows.flatMap((r) => (r.type === 'scope' ? [] : [r.key]));

  const onSelectionChange = (selection: Selection) => {
    if (selection === 'all') return;
    const key = [...selection][0];
    if (key === undefined) return;
    setDataScope(keyToScope(String(key)));
    // Phone: the two sheets share one slot, so picking a scope hands off from the Panel
    // sheet (this list) to the Inspector sheet (the form for what you just picked) — §A8.
    if (isPhone) openInspectorSheet();
  };

  return (
    // `data-surface="data-navigator"` puts the panel in that hotkey scope
    // (`src/state/hotkeyStore.ts`), which is what keeps the ⌘C/⌘X/⌘V/⌘D/⌫/⇧⌘I edit mirrors
    // working on the entity selection while the list has focus (foundation §11.1).
    <div
      data-surface="data-navigator"
      className="flex h-full min-h-0 flex-col gap-1 rounded-xl border border-border bg-panel p-(--density-panel-p)"
    >
      <div className="flex items-center gap-1 px-1">
        <span className="flex-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Data scopes
        </span>
      </div>

      <div className="px-1">
        <SearchField
          size="sm"
          aria-label="Filter data scopes"
          placeholder="Filter scopes…"
          value={search}
          onChange={setDataSearch}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && search.length === 0) focusViewport();
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <GridList
          aria-label="Data scopes"
          selectionMode="single"
          selectionBehavior="replace"
          disallowEmptySelection
          disabledBehavior="selection"
          items={rows}
          selectedKeys={new Set([scopeKey])}
          disabledKeys={disabledKeys}
          onSelectionChange={onSelectionChange}
          dependencies={[search, part, findings, expanded, nonCapableOpen, isPhone]}
          className="flex flex-col gap-0.5 outline-none"
        >
          {(item: NavItem) => (
            <GridListItem
              id={item.key}
              density="dense"
              textValue={itemText(item)}
              className={cn(item.type === 'entity' && 'opacity-50')}
            >
              <NavRow
                item={item}
                isPhone={isPhone}
                expanded={expanded.has(item.key)}
                nonCapableOpen={nonCapableOpen}
                onToggleExpanded={() => toggle(item.key)}
                onToggleNonCapable={() => setNonCapableOpen((open) => !open)}
                onJumpSection={(target, sectionId) => {
                  setDataScope(target);
                  jumpToSection(sectionId);
                }}
              />
            </GridListItem>
          )}
        </GridList>

        {!model.hasPlacements && <EmptyState />}
      </div>

      <ValidationStrip findings={findings} />
    </div>
  );
}

// ── row items ───────────────────────────────────────────────────────────────

type NavItem =
  | {
      type: 'scope';
      key: string;
      row: ReturnType<typeof buildDataNavigator>['part'] | NavTemplateRow;
    }
  | {
      type: 'section';
      key: string;
      scope: DataScope;
      section: { sectionId: DataSectionId; label: string; count: number; issue: IssueLevel };
    }
  | { type: 'header'; key: string; label: string; collapsible?: boolean }
  | { type: 'entity'; key: string; entity: DataNavEntityRow };

type NavTemplateRow = ReturnType<typeof buildDataNavigator>['templates'][number];

function itemText(item: NavItem): string {
  switch (item.type) {
    case 'scope':
      return 'templateId' in item.row ? item.row.templateId : item.row.label;
    case 'section':
      return item.section.label;
    case 'header':
      return item.label;
    case 'entity':
      return item.entity.label;
  }
}

function scopeToKey(scope: DataScope): string {
  return scope.kind === 'part' ? 'part' : `template:${scope.templateId}`;
}

function keyToScope(key: string): DataScope {
  return key === 'part' ? { kind: 'part' } : { kind: 'template', templateId: key.slice(9) };
}

function NavRow({
  item,
  isPhone,
  expanded,
  nonCapableOpen,
  onToggleExpanded,
  onToggleNonCapable,
  onJumpSection,
}: {
  item: NavItem;
  isPhone: boolean;
  expanded: boolean;
  nonCapableOpen: boolean;
  onToggleExpanded: () => void;
  onToggleNonCapable: () => void;
  onJumpSection: (scope: DataScope, sectionId: DataSectionId) => void;
}) {
  if (item.type === 'header') {
    return (
      <div className="flex w-full items-center gap-1 px-1 pt-1 text-[11px] uppercase tracking-wide text-fg-subtle">
        {item.collapsible ? (
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 hover:text-fg-muted"
            onClick={onToggleNonCapable}
          >
            {nonCapableOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span>{item.label}</span>
          </button>
        ) : (
          <span>{item.label}</span>
        )}
      </div>
    );
  }

  if (item.type === 'entity') return <EntityRow entity={item.entity} isPhone={isPhone} />;

  if (item.type === 'section') {
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1 pl-5 text-left"
        onClick={() => onJumpSection(item.scope, item.section.sectionId)}
      >
        <IssueDot level={item.section.issue} />
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{item.section.label}</span>
        {item.section.count > 0 && <Chip className="shrink-0">{item.section.count}</Chip>}
      </button>
    );
  }

  const row = item.row;
  const isTemplate = 'templateId' in row;
  return (
    <div
      className="flex w-full min-w-0 items-center gap-1"
      onPointerEnter={isTemplate ? () => flashPlacements(row.instanceIds) : undefined}
      onPointerLeave={isTemplate ? clearFlash : undefined}
    >
      <Button
        iconOnly
        size="xs"
        variant="ghost"
        className="size-4 shrink-0"
        aria-label={expanded ? 'Collapse sections' : 'Expand sections'}
        onPress={onToggleExpanded}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </Button>
      <IssueDot level={row.issue} />
      {/* Phone: tapping the row label hands off to the Inspector sheet. It cannot ride
          `onSelectionChange` alone — re-tapping the ALREADY-scoped row changes no selection,
          so react-aria fires nothing and the form would be unreachable. */}
      <span
        className="min-w-0 flex-1 truncate text-xs text-fg"
        onClick={isPhone ? openInspectorSheet : undefined}
      >
        {isTemplate ? row.templateId : `Part — ${row.label}`}
      </span>
      {isTemplate && row.placementCount > 1 && (
        <span className="shrink-0 text-[11px] text-fg-subtle">×{row.placementCount}</span>
      )}
      {isTemplate &&
        row.badges.map((badge) => (
          <span
            key={badge.icon}
            className="shrink-0 text-[11px] text-fg-subtle"
            title={badge.label}
          >
            {badge.icon}
            {badge.count}
          </span>
        ))}
      {isTemplate && row.empty && <AddDataMenu templateId={row.templateId} />}
    </div>
  );
}

/** The trailing "＋ add data" affordance on a capable-but-empty template row (design §A3). */
function AddDataMenu({ templateId }: { templateId: string }) {
  return (
    <MenuTrigger>
      <Button size="xs" variant="ghost" className="shrink-0 text-fg-subtle">
        <Plus size={11} /> add data
      </Button>
      {/* The Popover MOUNTS the menu body, so every predicate inside it re-evaluates on each
          open rather than freezing at its first-open value (React Compiler). */}
      <Popover className="w-56">
        <AddDataMenuBody templateId={templateId} />
      </Popover>
    </MenuTrigger>
  );
}

function AddDataMenuBody({ templateId }: { templateId: string }) {
  const isPhone = useIsPhone();
  // Each of the first three is ONE discrete editorStore action that lazily creates the
  // `<SubPartGameData>` entry and pushes a single undo step; the UI adds none of its own.
  const add =
    (action: (templateId: string) => void, sectionId: DataSectionId): (() => void) =>
    () => {
      action(templateId);
      setDataScope({ kind: 'template', templateId });
      jumpToSection(sectionId);
      // Phone: the thing just created lives in the form, which is the OTHER sheet (§A8).
      if (isPhone) openInspectorSheet();
    };
  return (
    <Menu aria-label="Add data">
      <MenuItem density="dense" onAction={add(addTank, 'tanks')}>
        Add tank
      </MenuItem>
      <MenuItem density="dense" onAction={add((id) => addLight(id), 'lights')}>
        Add light
      </MenuItem>
      <MenuItem density="dense" onAction={add(addSubPartSolarPanel, 'solar')}>
        Add solar panel
      </MenuItem>
      <MenuItem density="dense" onAction={() => setMode('engine', { defineNew: true, templateId })}>
        Add engine (thrust chamber) →
      </MenuItem>
    </Menu>
  );
}

/**
 * A non-capable entity: dim, focusable (so the explainer is reachable), with a Build jump.
 *
 * Touch has no hover, so on phone the explainer is rendered INLINE under the label rather
 * than in a tooltip nothing could ever open (§A8 "tap = show tooltip content inline"), and
 * the jump button grows to a 44px target.
 */
function EntityRow({ entity, isPhone }: { entity: DataNavEntityRow; isPhone: boolean }) {
  const jump = (
    <Button
      iconOnly
      size="xs"
      variant="ghost"
      className={cn('shrink-0', isPhone ? 'size-11' : 'size-4')}
      aria-label={`Select ${entity.label} in Build mode`}
      onPress={() => {
        setMode('build');
        select([{ kind: entity.kind, id: entity.id }]);
        revealEntity(entity.kind, entity.id);
      }}
    >
      <ArrowRight size={isPhone ? 16 : 11} />
    </Button>
  );

  if (isPhone) {
    return (
      <div className="flex w-full min-w-0 items-start gap-1 pl-1">
        <span className="mt-0.5 shrink-0 text-[11px] text-fg-subtle">◌</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs text-fg-muted">{entity.label}</span>
          <span className="text-[11px] leading-snug text-fg-subtle">{entity.explainer}</span>
        </span>
        {jump}
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-1 pl-1">
      <span className="shrink-0 text-[11px] text-fg-subtle">◌</span>
      <Tooltip content={entity.explainer}>
        <span tabIndex={0} className="min-w-0 flex-1 truncate text-xs text-fg-muted outline-none">
          {entity.label}
        </span>
      </Tooltip>
      <Tooltip content="Select in Build">{jump}</Tooltip>
    </div>
  );
}

function IssueDot({ level }: { level: IssueLevel }) {
  if (level === null) return null;
  return (
    <AlertTriangle
      size={11}
      className={cn('shrink-0', level === 'block' ? 'text-danger' : 'text-warning')}
      aria-label={level === 'block' ? 'blocking issue' : 'warning'}
    />
  );
}

/**
 * The always-visible **validation strip**, pinned at the navigator's bottom (design §A7).
 * Hidden when the part is clean; expanded it lists every finding, and clicking one scopes +
 * jumps + flashes the offending card.
 */
function ValidationStrip({ findings }: { findings: readonly GameDataFinding[] }) {
  const [open, setOpen] = useState(false);
  if (findings.length === 0) return null;

  const blocks = findings.filter((f) => f.severity === 'block').length;
  const warns = findings.length - blocks;
  const parts = [
    blocks > 0 ? `${blocks} block${blocks === 1 ? '' : 's'}` : '',
    warns > 0 ? `${warns} warning${warns === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  return (
    <div className="shrink-0 border-t border-border pt-1">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 text-left text-xs hover:bg-wash-hover"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <AlertTriangle
          size={12}
          className={cn('shrink-0', blocks > 0 ? 'text-danger' : 'text-warning')}
        />
        <span className="min-w-0 flex-1 truncate text-fg-muted">{parts.join(' · ')}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="max-h-48 overflow-auto px-1 pb-1">
          {/* The scope form this jump targets is the Inspector sheet on a phone, so focusing
              without opening it left the tap with no visible effect. Mirrors the row hand-off
              a few lines up. */}
          <FindingsList
            findings={findings}
            onSelect={(finding) => {
              focusFinding(finding);
              if (isPhoneViewport()) openInspectorSheet();
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Nothing placed at all — the mode's own empty state (design §A3 last bullet). */
function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-4">
      <p className="text-xs text-fg-subtle">
        Place SubParts in Build mode to give them tanks, lights, solar panels or engines.
      </p>
      <Button size="sm" variant="secondary" onPress={() => setMode('build')}>
        Go to Build
      </Button>
    </div>
  );
}
