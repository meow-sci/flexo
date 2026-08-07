import {
  Select as AriaSelect,
  SelectValue,
  Button as AriaButton,
  Autocomplete,
  useFilter,
  composeRenderProps,
  type SelectProps as AriaSelectProps,
} from 'react-aria-components';
import { ChevronsUpDown } from 'lucide-react';
import { tv, type VariantProps } from 'tailwind-variants';
import { Label } from './Field';
import { focusRing, cn } from './styles';
import { Popover } from './Popover';
import { ListBox } from './ListBox';
import { SearchField } from './SearchField';

/*
 * Same metrics as `inputStyles` (Field.tsx) at every tier, and the same open/focus
 * language: react-aria holds the trigger in `data-pressed` for as long as the popover
 * is open, so `pressed:border-accent` is the select's version of an input's
 * `focus:border-accent` — the control reads as "live" while you're picking.
 */
const trigger = tv({
  extend: focusRing,
  base: 'flex w-full items-center justify-between gap-2 overflow-hidden rounded-md border border-border bg-panel-sunken text-fg transition-colors hover:border-border-strong pressed:border-accent disabled:opacity-50',
  variants: {
    size: {
      // Bars + sidebars only (design-system-services §7.2).
      xs: 'h-6 px-1.5 text-xs',
      sm: 'h-7 px-2 text-xs',
      md: 'h-9 px-2.5 text-sm',
    },
  },
  defaultVariants: { size: 'md' },
});

/** Chevron + dropdown metrics per tier, so the popover matches the trigger it came from. */
const SIZE_METRICS = {
  xs: { chevron: 12, list: 'text-xs [--option-py:0.1875rem]' },
  sm: { chevron: 13, list: 'text-xs [--option-py:0.25rem]' },
  md: { chevron: 15, list: 'text-sm [--option-py:0.375rem]' },
} as const;

export interface SelectKitProps<T extends object>
  extends Omit<AriaSelectProps<T>, 'children'>, VariantProps<typeof trigger> {
  label?: React.ReactNode;
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  /** Adds a search field inside the dropdown to filter options (react-aria Autocomplete). */
  searchable?: boolean;
  /** Placeholder/label for the in-dropdown search field (searchable selects only). */
  searchPlaceholder?: string;
  /**
   * Match rule for the in-dropdown search (searchable selects only). Defaults to
   * case-insensitive substring; pass `fuzzyAny`-style matching where a list is long enough
   * that "hydro" should find "Hydrogen + Oxygen" (the reaction picker, design §B5).
   */
  filter?: (textValue: string, inputValue: string) => boolean;
}

/**
 * Dropdown select. Pass `items` + a child render fn (or static `ListBoxItem`s)
 * the react-aria way.
 *
 * Selection may be controlled EITHER way — both are real, supported react-aria
 * APIs in react-aria-components 1.20, and both were verified to drive the
 * trigger's displayed value:
 *   - `selectedKey` + `onSelectionChange` (SingleSelection)
 *   - `value` + `onChange`
 * The codebase uses both; neither is deprecated and neither leaves the control
 * uncontrolled. An earlier sweep in this refactor assumed `value`/`onChange`
 * were inert DOM passthrough (SelectProps does extend GlobalDOMAttributes, so
 * they typecheck either way) — that assumption was WRONG. Do not "fix" one
 * spelling into the other on that basis.
 *
 * Set `searchable` to add an in-dropdown filter field (keeps the same trigger styling).
 */
export function Select<T extends object>({
  label,
  items,
  children,
  size,
  className,
  triggerClassName,
  popoverClassName,
  searchable,
  searchPlaceholder,
  filter,
  ...props
}: SelectKitProps<T>) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const metrics = SIZE_METRICS[size ?? 'md'];
  return (
    <AriaSelect {...props} className={cn('flex flex-col gap-1', className)}>
      {label && <Label>{label}</Label>}
      <AriaButton
        className={composeRenderProps(triggerClassName, (cls, rp) =>
          trigger({ ...rp, size, className: cls }),
        )}
      >
        {/*
          react-aria renders the selected option's own children here, so a two-line option
          (label + muted second line) would stack inside a one-line-tall trigger and spill
          past its border. Mark the secondary line `data-subtitle` at the call site and it
          shows in the list only; the trigger stays single-line.
        */}
        <SelectValue className="flex-1 truncate text-left data-[placeholder]:text-fg-subtle [&_[data-subtitle]]:hidden" />
        <ChevronsUpDown size={metrics.chevron} className="shrink-0 text-fg-subtle" />
      </AriaButton>
      <Popover className={cn('w-(--trigger-width)', searchable && 'min-w-56', popoverClassName)}>
        {searchable ? (
          // Autocomplete wraps the ListBox so the SearchField filters it with virtual
          // focus (type in the field, arrow into the results). Mounts fresh each open, so
          // the query resets when the popover closes.
          <Autocomplete filter={filter ?? contains}>
            <SearchField
              size={size ?? 'md'}
              autoFocus
              aria-label={searchPlaceholder ?? 'Search options'}
              placeholder={searchPlaceholder ?? 'Search…'}
              className="m-1"
            />
            <ListBox
              items={items}
              className={cn('max-h-[inherit] overflow-auto', metrics.list)}
              renderEmptyState={() => (
                <div className="px-2 py-(--option-py) text-fg-subtle">No matches</div>
              )}
            >
              {children}
            </ListBox>
          </Autocomplete>
        ) : (
          <ListBox items={items} className={cn('max-h-[inherit] overflow-auto', metrics.list)}>
            {children}
          </ListBox>
        )}
      </Popover>
    </AriaSelect>
  );
}
