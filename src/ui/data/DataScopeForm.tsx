import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { AlertTriangle, ChevronDown, ChevronRight, MoreVertical, Plus } from 'lucide-react';
import { Button, Chip, InlineConfirmStrip, Menu, MenuItem, MenuTrigger, Popover, cn } from '../kit';
import { useSectionJump } from './useSectionJump';
import { FlashedCardContext } from './flashedCard';
import { useInstanceIds } from './instances';
import { PartScopeChip, TemplateScopeChip } from './ScopeChip';
import { buildDataNavigator, type IssueLevel } from './dataNavigatorModel';
import {
  $dataScope,
  $gameDataFindings,
  jumpToSection,
  sectionDef,
  sectionsFor,
  type DataScope,
  type DataSectionId,
} from '../../state/dataModeStore';
import { $part, removeAllTemplateData, revealEntity, select } from '../../state/editorStore';
import { setMode } from '../../state/modeStore';

/**
 * **The Data scope form** — Data mode's left sidebar (design:
 * design-data-engine-modes.md §A4/§A5; foundation §7.3, §15.3).
 *
 * The HOST, not the fields: a sticky header naming the scope (with its §A5 chip and an
 * overflow ⋮), a sticky horizontally-scrollable section chip strip, and the section stack
 * itself. Each section is a {@link DataSection} — the extension point every field group
 * plugs into, so a section author writes a body and inherits the jump/scroll/flash/expand
 * behaviour for free.
 *
 * **Undo enrollment: NONE of its own.** Scope, chips and expand flags are ephemeral; the one
 * mutation reachable from the header ("Delete all data…") is a single discrete editorStore
 * push behind the foundation §14.3 whole-container confirm.
 */
export function DataScopeForm({ children }: { children?: React.ReactNode }) {
  const scope = useStore($dataScope);
  const part = useStore($part);
  const name =
    scope.kind === 'part'
      ? part.gameData.displayName.trim() || part.partId.trim() || '(unnamed part)'
      : scope.templateId;

  return (
    <div className="flex min-h-0 flex-col">
      <ScopeHeader scope={scope} name={name} />
      <SectionChipStrip scope={scope} />
      <div className="flex flex-col gap-2 p-(--density-panel-p)">
        {children ?? <InterimSections />}
      </div>
    </div>
  );
}

/**
 * INTERIM (P6.10–P6.16 fill this in): the section stack does not exist yet, so the form says
 * where each field still lives. RULE ZERO — the mode existing must never cost the user access
 * to a feature.
 */
function InterimSections() {
  return (
    <p className="text-xs text-fg-subtle">
      The GameData fields for this scope arrive with the section tasks. Until then, Part Data is in
      the ⌘K palette and SubPart Data stays on each SubPart&rsquo;s row menu in Build mode.
    </p>
  );
}

// ── header (§A4) ─────────────────────────────────────────────────────────────

function ScopeHeader({ scope, name }: { scope: DataScope; name: string }) {
  const instanceIds = useInstanceIds(scope.kind === 'template' ? scope.templateId : '');
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="sticky top-0 z-1 flex flex-col gap-1 border-b border-border bg-panel px-(--density-panel-p) py-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg" title={name}>
          {scope.kind === 'part' ? 'Part — ' : 'Template — '}
          {name}
        </span>
        {scope.kind === 'part' ? (
          <PartScopeChip />
        ) : (
          <TemplateScopeChip templateId={scope.templateId} instanceIds={instanceIds} />
        )}
        <MenuTrigger>
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-5 shrink-0"
            aria-label="Scope options"
          >
            <MoreVertical size={12} />
          </Button>
          {/* Mounted by the Popover, so the item set is rebuilt (and re-predicated) on open. */}
          <Popover className="w-56">
            <ScopeMenu
              scope={scope}
              instanceIds={instanceIds}
              onRequestDelete={() => setConfirming(true)}
            />
          </Popover>
        </MenuTrigger>
      </div>
      {confirming &&
        scope.kind === 'template' && (
          // Whole-container destroy ⇒ confirm (foundation §14.3). The strip is in flow, so
          // nothing is overlaid; the ACTION behind it is one undo step.
          <InlineConfirmStrip
            label={`Delete all data on ${scope.templateId}?`}
            confirmLabel="Delete"
            onConfirm={() => {
              removeAllTemplateData(scope.templateId);
              setConfirming(false);
            }}
            onCancel={() => setConfirming(false)}
          />
        )}
    </div>
  );
}

function ScopeMenu({
  scope,
  instanceIds,
  onRequestDelete,
}: {
  scope: DataScope;
  instanceIds: readonly string[];
  onRequestDelete: () => void;
}) {
  const part = useStore($part);
  if (scope.kind === 'part') {
    return (
      <Menu aria-label="Part scope options">
        <MenuItem density="dense" onAction={() => void navigator.clipboard?.writeText(part.partId)}>
          Copy Part Id
        </MenuItem>
        <MenuItem
          density="dense"
          onAction={() => setMode('engine', { engineScope: { kind: 'part' } })}
        >
          Open in Engine mode →
        </MenuItem>
      </Menu>
    );
  }
  return (
    <Menu aria-label="Template scope options">
      <MenuItem
        density="dense"
        onAction={() => {
          const refs = instanceIds.map((id) => ({ kind: 'subpart' as const, id }));
          select(refs);
          if (refs[0]) revealEntity('subpart', refs[0].id);
        }}
      >
        Select placements in 3D
      </MenuItem>
      <MenuItem
        density="dense"
        onAction={() =>
          setMode('engine', { engineScope: { kind: 'sub', templateId: scope.templateId } })
        }
      >
        Open in Engine mode →
      </MenuItem>
      <MenuItem density="dense" variant="danger" onAction={onRequestDelete}>
        Delete all data…
      </MenuItem>
    </Menu>
  );
}

// ── section chip strip (§A4) ─────────────────────────────────────────────────

function SectionChipStrip({ scope }: { scope: DataScope }) {
  const findings = useStore($gameDataFindings);
  const part = useStore($part);
  // The chips mirror the navigator's child rows exactly — one dataset, one set of counts.
  const model = buildDataNavigator(part, findings);
  const sections =
    scope.kind === 'part'
      ? model.part.sections
      : (model.templates.find((t) => t.templateId === scope.templateId)?.sections ??
        sectionsFor(scope).map((def) => ({
          sectionId: def.id,
          label: def.label,
          count: 0,
          issue: null as IssueLevel,
        })));

  return (
    <div className="sticky top-8 z-1 flex gap-1 overflow-x-auto border-b border-border bg-panel px-(--density-panel-p) py-1">
      {sections.map((section) => (
        <button
          key={section.sectionId}
          type="button"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-fg-muted hover:border-border-strong hover:text-fg"
          onClick={() => jumpToSection(section.sectionId)}
        >
          {section.issue && <IssueDot level={section.issue} />}
          {sectionDef(section.sectionId).chip}
          {section.count > 0 && <span className="text-fg-subtle">{section.count}</span>}
        </button>
      ))}
    </div>
  );
}

function IssueDot({ level }: { level: IssueLevel }) {
  if (level === null) return null;
  return (
    <AlertTriangle
      size={10}
      className={cn('shrink-0', level === 'block' ? 'text-danger' : 'text-warning')}
      aria-hidden
    />
  );
}

// ── the section shell (the extension point every field group plugs into) ─────

/**
 * One collapsible section of a scope form — the shell every §A4 field group renders inside.
 *
 * It owns the behaviours a section author should never re-implement: the badge, the issue
 * dot, the ephemeral expand flag (§A10 — resets on reload, deliberately), and the
 * jump/scroll/expand/flash choreography via {@link useSectionJump}. A section with no content
 * starts collapsed and shows a `＋` in its header when `onAdd` is given (§A4 "empty sections
 * collapsed with a ＋ affordance").
 */
export function DataSection({
  sectionId,
  count = 0,
  issue = null,
  defaultExpanded,
  onAdd,
  headerAction,
  children,
}: {
  sectionId: DataSectionId;
  /** Item count for the badge; 0 also decides the default collapsed state. */
  count?: number;
  issue?: IssueLevel;
  /** Force the initial state; defaults to "expanded iff the section has content". */
  defaultExpanded?: boolean;
  /** Renders a `＋` in the header (an empty section's one-click way in). */
  onAdd?: () => void;
  /** Trailing header control, e.g. an "Open in Engine mode →" link. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Destructured, not held as one object: the `attach` callback goes into a `ref` prop, and
  // the lint's escape analysis would otherwise treat every sibling field as a ref read.
  const { attach, targeted, flashing, cardKey } = useSectionJump(sectionId);
  const [open, setOpen] = useState(defaultExpanded ?? count > 0);
  // A jump always wins over the collapsed flag: the user asked to be taken here.
  const expanded = open || targeted;

  return (
    <section
      ref={attach}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border bg-panel',
        flashing && cardKey === undefined && 'row-flash',
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
          onClick={() => setOpen(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <IssueDot level={issue} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
            {sectionDef(sectionId).label}
          </span>
          {count > 0 && <Chip className="shrink-0">{count}</Chip>}
        </button>
        {headerAction}
        {onAdd && (
          <Button
            iconOnly
            size="xs"
            variant="ghost"
            className="size-5 shrink-0"
            aria-label={`Add to ${sectionDef(sectionId).label}`}
            onPress={onAdd}
          >
            <Plus size={12} />
          </Button>
        )}
      </div>
      {expanded && (
        <FlashedCardContext.Provider value={flashing ? cardKey : undefined}>
          <div className="flex flex-col gap-2 border-t border-border px-2 py-2">{children}</div>
        </FlashedCardContext.Provider>
      )}
    </section>
  );
}
