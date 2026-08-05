import { MoreVertical, type LucideIcon } from 'lucide-react';
import { Button, MenuTrigger, Popover, cn } from '../kit';

/**
 * The header row every left-sidebar focus card wears (design: `foundation.md` §7 — "focus
 * title + overflow ⋮ menu carrying the focus object's commands"; design-build-mode.md §3).
 *
 * It is deliberately dumb: a glyph, a title, an optional sub line, an optional inline
 * `actions` slot, and an optional ⋮ menu. The MENU is passed as an element and rendered
 * INSIDE the `Popover`, which react-aria mounts on open and unmounts on close — that is
 * what keeps the menu's `isDisabled`/`checked` predicates from being frozen at their
 * first-open values by React Compiler (the same rule the Outliner row menus follow).
 *
 * **Undo enrollment: NONE.** Everything reachable from here pushes its own step.
 */

/** The one card chrome for the focus editor's dense card stack (foundation §7, §14.4). */
export const focusCard = 'flex flex-col gap-2 rounded-lg border border-border bg-panel-sunken p-2';

export function FocusCardHeader({
  icon: Icon,
  title,
  titleTooltip,
  titleClassName,
  subtitle,
  subtitleTooltip,
  actions,
  menu,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  /** Native tooltip for a title that can overflow (ids are long). */
  titleTooltip?: string;
  titleClassName?: string;
  subtitle?: React.ReactNode;
  subtitleTooltip?: string;
  /** Always-visible controls placed left of the ⋮ (aid lock/close toggles). */
  actions?: React.ReactNode;
  /** A `<Menu>` element; mounted only while the popover is open. */
  menu?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn('truncate text-xs font-medium text-fg', titleClassName)}
          title={titleTooltip}
        >
          {title}
        </span>
        {subtitle !== undefined && (
          <span className="truncate text-[11px] text-fg-subtle" title={subtitleTooltip}>
            {subtitle}
          </span>
        )}
      </div>
      {actions}
      {menu !== undefined && (
        <MenuTrigger>
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            className="size-5 shrink-0"
            aria-label="Focus options"
          >
            <MoreVertical className="size-3.5" />
          </Button>
          <Popover placement="bottom end" className="w-56">
            {menu}
          </Popover>
        </MenuTrigger>
      )}
    </div>
  );
}
