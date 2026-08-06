import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Chip } from '../kit';

/**
 * The `SidebarSection` shell the Animation navigator's four blocks plug into (design:
 * design-animation-mode.md §6; foundation §8 "collapsible `SidebarSection`s, dense, sticky
 * headers"). The Surface-mode counterpart is `surface/SurfaceSection.tsx`; this one carries a
 * second, dim subtitle line because CLIPS/JOINTS/EASING all qualify their header with live
 * context ("HingeL @1.20→2.00s").
 *
 * Expand state is view state — never persisted, never undoable.
 */
export function AnimSection({
  id,
  title,
  subtitle,
  count,
  headerAction,
  defaultExpanded = true,
  children,
}: {
  /** Stamped as `data-anim-section` so a cross-panel jump can scroll to this block. */
  id?: string;
  title: string;
  subtitle?: string;
  count?: number;
  headerAction?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <section
      data-anim-section={id}
      className="flex flex-none flex-col overflow-hidden rounded-lg border border-border bg-panel"
    >
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0" />
          ) : (
            <ChevronRight className="size-3 shrink-0" />
          )}
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-fg">
            {title}
          </span>
          {subtitle && (
            <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">— {subtitle}</span>
          )}
          {count !== undefined && <Chip className="shrink-0">{count}</Chip>}
        </button>
        {headerAction}
      </div>
      {open && (
        <div className="flex flex-col gap-1.5 border-t border-border px-1.5 py-1.5">{children}</div>
      )}
    </section>
  );
}
