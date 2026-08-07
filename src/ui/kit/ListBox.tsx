import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  composeRenderProps,
  type ListBoxProps,
  type ListBoxItemProps,
  type GridListProps,
  type GridListItemProps,
} from 'react-aria-components';
import { Check } from 'lucide-react';
import { composeTw, cn } from './styles';

/*
 * Option rows speak the same state language as the app's other collection rows
 * (`gridRowClass`): wash + accent inset ring under the pointer, ring alone for the
 * keyboard-focused row, wash + check for the selected one. `hover:`/`focus:` are the
 * react-aria plugin's variants (data-hovered / data-focused), so they also fire under the
 * searchable Select's *virtual* focus, where the row never takes DOM focus — the plain
 * `focus-visible:` this used to carry was dead in exactly that case.
 *
 * Type size and row padding are INHERITED from the enclosing ListBox rather than fixed
 * here, so a `size="xs"`/`"sm"` Select's options match its trigger (see Select.tsx).
 */
const itemBase =
  'group flex cursor-default select-none items-center gap-2 rounded-md px-2 py-(--option-py) text-fg outline-none ring-inset ring-accent hover:bg-wash-hover hover:ring-1 focus:ring-1 selected:bg-wash-selected disabled:opacity-45';

// GridList rows use a green inset ring for selection (and a thinner ring for
// keyboard focus), matching the Outliner's entity rows.
const gridItemBase =
  'flex cursor-default select-none items-center gap-2 rounded-md px-2 text-sm text-fg outline-none disabled:opacity-45';

/*
 * Default option metrics (a caller — Select — overrides both to match its control size),
 * plus one arbitration rule: react-aria leaves the keyboard-focused row focused when the
 * pointer moves elsewhere, so arrowing and then reaching for the mouse would paint TWO
 * accent rings. While the pointer is inside the list it owns the highlight; the stale
 * focus ring is muted.
 */
const listBoxBase =
  'flex flex-col gap-0.5 p-1 text-sm outline-none [--option-py:0.375rem] [&:has([data-hovered])_[data-focused]:not([data-hovered])]:ring-0';

export function ListBox<T extends object>({ className, ...props }: ListBoxProps<T>) {
  return <AriaListBox {...props} className={composeTw(listBoxBase, className)} />;
}

export function ListBoxItem({ className, children, ...props }: ListBoxItemProps) {
  const textValue = props.textValue ?? (typeof children === 'string' ? children : undefined);
  return (
    <AriaListBoxItem
      {...props}
      textValue={textValue}
      className={composeRenderProps(className, (cls) => cn(itemBase, cls))}
    >
      {composeRenderProps(children, (kids, { isSelected }) => (
        <>
          <span className="flex-1 truncate">{kids}</span>
          {isSelected && <Check size={16} className="shrink-0 text-accent" />}
        </>
      ))}
    </AriaListBoxItem>
  );
}

export function GridList<T extends object>({ className, ...props }: GridListProps<T>) {
  return (
    <AriaGridList
      {...props}
      className={composeTw('flex flex-col gap-0.5 p-1 outline-none', className)}
    />
  );
}

export interface GridListItemKitProps extends GridListItemProps {
  /** `dense` tightens the row for sidebars/bars (design-system-services §7.2). */
  density?: 'default' | 'dense';
}

export function GridListItem({
  density = 'default',
  className,
  children,
  ...props
}: GridListItemKitProps) {
  const textValue = props.textValue ?? (typeof children === 'string' ? children : undefined);
  return (
    <AriaGridListItem
      {...props}
      textValue={textValue}
      className={composeRenderProps(className, (cls, { isSelected, isFocusVisible }) =>
        cn(
          gridItemBase,
          density === 'dense' ? 'py-1' : 'py-1.5',
          isSelected ? 'bg-wash-selected ring-2 ring-inset ring-accent' : 'hover:bg-wash-hover',
          isFocusVisible && !isSelected ? 'ring-1 ring-inset ring-accent' : '',
          cls,
        ),
      )}
    >
      {children}
    </AriaGridListItem>
  );
}
