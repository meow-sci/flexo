import {
  Select as AriaSelect,
  SelectValue,
  Button as AriaButton,
  composeRenderProps,
  type SelectProps as AriaSelectProps,
} from 'react-aria-components'
import { ChevronsUpDown } from 'lucide-react'
import { tv, type VariantProps } from 'tailwind-variants'
import { Label } from './Field'
import { focusRing, cn } from './styles'
import { Popover } from './Popover'
import { ListBox } from './ListBox'

const trigger = tv({
  extend: focusRing,
  base: 'flex w-full items-center justify-between gap-2 rounded-md border border-border bg-panel-sunken text-fg transition-colors hover:border-border-strong disabled:opacity-50',
  variants: {
    size: {
      sm: 'h-7 px-2 text-xs',
      md: 'h-9 px-2.5 text-sm',
    },
  },
  defaultVariants: { size: 'md' },
})

export interface SelectKitProps<T extends object>
  extends Omit<AriaSelectProps<T>, 'children'>,
    VariantProps<typeof trigger> {
  label?: React.ReactNode
  items?: Iterable<T>
  children: React.ReactNode | ((item: T) => React.ReactNode)
  className?: string
  triggerClassName?: string
  popoverClassName?: string
}

/**
 * Dropdown select. Pass `items` + a child render fn (or static `ListBoxItem`s)
 * the react-aria way; selection is controlled via `selectedKey`/`onSelectionChange`.
 */
export function Select<T extends object>({
  label,
  items,
  children,
  size,
  className,
  triggerClassName,
  popoverClassName,
  ...props
}: SelectKitProps<T>) {
  return (
    <AriaSelect {...props} className={cn('flex flex-col gap-1', className)}>
      {label && <Label>{label}</Label>}
      <AriaButton
        className={composeRenderProps(triggerClassName, (cls, rp) =>
          trigger({ ...rp, size, className: cls }),
        )}
      >
        <SelectValue className="flex-1 truncate text-left data-[placeholder]:text-fg-subtle" />
        <ChevronsUpDown size={size === 'sm' ? 13 : 15} className="shrink-0 text-fg-subtle" />
      </AriaButton>
      <Popover className={cn('w-(--trigger-width)', popoverClassName)}>
        <ListBox items={items} className="max-h-[inherit] overflow-auto">
          {children}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}
