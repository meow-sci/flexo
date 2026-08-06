import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Chip, cn } from '../kit';

/**
 * **The section shell** every Surface-mode field group plugs into — the Surface counterpart
 * of Data mode's `DataSection` (design: design-surface-assets.md §1.3 "Body = `SidebarSection`s
 * (dense, sticky headers, `xs` controls)").
 *
 * Deliberately lighter than `DataSection`: Surface has no findings model and no
 * jump/flash choreography (the picker owns reveal), so this is a header, an optional count
 * badge, an optional trailing action and an expand flag. Expand state is view state — never
 * persisted, never undoable.
 */
export function SurfaceSection({
  title,
  subtitle,
  count,
  headerAction,
  defaultExpanded = true,
  children,
}: {
  title: string;
  /** Dim trailing text in the header, e.g. the picked mesh's name. */
  subtitle?: string;
  count?: number;
  headerAction?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-fg">
            {title}
          </span>
          {subtitle && (
            <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">— {subtitle}</span>
          )}
          {count !== undefined && count > 0 && <Chip className="shrink-0">{count}</Chip>}
        </button>
        {headerAction}
      </div>
      {open && (
        <div className={cn('flex flex-col gap-2 border-t border-border px-2 py-2')}>{children}</div>
      )}
    </section>
  );
}
