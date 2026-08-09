import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button, Chip, cn } from '../kit';
import { useSectionJump } from './useSectionJump';
import { FlashedCardContext } from './flashedCard';
import type { IssueLevel } from './dataNavigatorModel';
import { sectionDef, type DataSectionId } from '../../state/dataModeStore';

/**
 * **The section shell** every Data-mode field group plugs into (design:
 * design-data-engine-modes.md §A4).
 *
 * It owns the behaviours a section author should never re-implement: the badge, the issue
 * dot, the ephemeral expand flag (§A10 — resets on reload, deliberately), and the
 * jump/scroll/expand/flash choreography via {@link useSectionJump}. A section with no content
 * starts collapsed and shows a `＋` in its header when `onAdd` is given (§A4 "empty sections
 * collapsed with a ＋ affordance").
 *
 * Lives in its own module rather than inside `DataScopeForm` so the section components can
 * import it without an import cycle back through the form that composes them.
 *
 * **Undo enrollment: NONE.** Expand flags are view state.
 */

export function IssueDot({ level, size = 12 }: { level: IssueLevel; size?: number }) {
  if (level === null) return null;
  return (
    <AlertTriangle
      size={size}
      className={cn('shrink-0', level === 'block' ? 'text-danger' : 'text-warning')}
      aria-label={level === 'block' ? 'blocking issue' : 'warning'}
    />
  );
}

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
  /** Renders a `＋` in the header (an empty section's one-click way in). Expands on use. */
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
            onPress={() => {
              // Expand FIRST: an empty section is collapsed, so adding without opening it
              // put the new card somewhere the user could not see or edit it.
              setOpen(true);
              onAdd();
            }}
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
