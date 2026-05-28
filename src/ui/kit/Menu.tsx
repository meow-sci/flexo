import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  Header,
  Separator,
  composeRenderProps,
  type MenuProps,
  type MenuItemProps,
  type SeparatorProps,
} from 'react-aria-components'
import { Check, ChevronRight } from 'lucide-react'
import { tv } from 'tailwind-variants'
import { composeTw, cn } from './styles'

const menuItem = tv({
  base: 'flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none disabled:opacity-45',
  variants: {
    variant: {
      default: 'text-fg hover:bg-white/[0.06] focus:bg-white/[0.08]',
      danger: 'text-danger hover:bg-danger/15 focus:bg-danger/20',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Menu<T extends object>({ className, ...props }: MenuProps<T>) {
  return (
    <AriaMenu
      {...props}
      className={composeTw('max-h-[inherit] min-w-36 overflow-auto p-1 outline-none', className)}
    />
  )
}

export interface MenuItemKitProps extends MenuItemProps {
  variant?: 'default' | 'danger'
}

export function MenuItem({ className, children, variant, ...props }: MenuItemKitProps) {
  const textValue = props.textValue ?? (typeof children === 'string' ? children : undefined)
  return (
    <AriaMenuItem
      {...props}
      textValue={textValue}
      className={composeRenderProps(className, (cls) => menuItem({ variant, className: cls }))}
    >
      {composeRenderProps(children, (kids, { hasSubmenu, isSelected, selectionMode }) => (
        <>
          {selectionMode !== 'none' && (
            <span className="flex w-4 shrink-0 justify-center">
              {isSelected && <Check size={15} className="text-accent" />}
            </span>
          )}
          <span className="flex-1 truncate">{kids}</span>
          {hasSubmenu && <ChevronRight size={15} className="shrink-0 text-fg-subtle" />}
        </>
      ))}
    </AriaMenuItem>
  )
}

export function MenuSection<T extends object>(props: React.ComponentProps<typeof AriaMenuSection<T>>) {
  return <AriaMenuSection {...props} />
}

export function MenuHeader({ className, ...props }: React.ComponentProps<typeof Header>) {
  return (
    <Header
      {...props}
      className={cn('px-2 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle', className)}
    />
  )
}

export function MenuSeparator({ className, ...props }: SeparatorProps) {
  return <Separator {...props} className={cn('my-1 h-px bg-border', className)} />
}
