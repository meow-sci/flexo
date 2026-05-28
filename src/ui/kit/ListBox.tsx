import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  composeRenderProps,
  type ListBoxProps,
  type ListBoxItemProps,
} from 'react-aria-components'
import { Check } from 'lucide-react'
import { composeTw, cn } from './styles'

const itemBase =
  'group flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg outline-none hover:bg-white/[0.06] focus-visible:bg-white/[0.08] selected:bg-white/[0.06] disabled:opacity-45'

export function ListBox<T extends object>({ className, ...props }: ListBoxProps<T>) {
  return (
    <AriaListBox
      {...props}
      className={composeTw('flex flex-col gap-0.5 p-1 outline-none', className)}
    />
  )
}

export function ListBoxItem({ className, children, ...props }: ListBoxItemProps) {
  const textValue =
    props.textValue ?? (typeof children === 'string' ? children : undefined)
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
  )
}
