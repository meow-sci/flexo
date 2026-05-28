import {
  Popover as AriaPopover,
  Dialog,
  composeRenderProps,
  type PopoverProps,
  type DialogProps,
} from 'react-aria-components'
import { cn } from './styles'

/** Styled floating surface for menus, selects, and custom popover content. */
export function Popover({ className, offset = 6, ...props }: PopoverProps) {
  return (
    <AriaPopover
      offset={offset}
      {...props}
      className={composeRenderProps(className, (cls) =>
        cn(
          'rounded-lg border border-border bg-panel-raised text-fg shadow-popover',
          'origin-top transition-[transform,opacity] data-[entering]:scale-95 data-[entering]:opacity-0 data-[exiting]:scale-95 data-[exiting]:opacity-0',
          cls,
        ),
      )}
    />
  )
}

/** Dialog wrapper for arbitrary popover content (focus management + a11y). */
export function PopoverDialog({ className, ...props }: DialogProps) {
  return <Dialog {...props} className={cn('outline-none', className)} />
}
