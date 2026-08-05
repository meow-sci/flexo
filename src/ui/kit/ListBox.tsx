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

const itemBase =
  'group flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg outline-none hover:bg-wash-hover focus-visible:bg-wash-selected selected:bg-wash-selected disabled:opacity-45';

// GridList rows use a green inset ring for selection (and a thinner ring for
// keyboard focus), matching the Assets mesh-part list (see AssetsList.tsx).
const gridItemBase =
  'flex cursor-default select-none items-center gap-2 rounded-md px-2 text-sm text-fg outline-none disabled:opacity-45';

export function ListBox<T extends object>({ className, ...props }: ListBoxProps<T>) {
  return (
    <AriaListBox
      {...props}
      className={composeTw('flex flex-col gap-0.5 p-1 outline-none', className)}
    />
  );
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
