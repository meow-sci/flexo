import {
  TooltipTrigger,
  Tooltip as AriaTooltip,
  composeRenderProps,
  type TooltipProps,
} from 'react-aria-components'
import { cn } from './styles'

export interface TooltipKitProps extends Omit<TooltipProps, 'children'> {
  content: React.ReactNode
  children: React.ReactNode
  delay?: number
}

/** Wrap a single focusable child (e.g. a Button) to give it a hover/focus tooltip. */
export function Tooltip({ content, children, delay = 500, className, ...props }: TooltipKitProps) {
  return (
    <TooltipTrigger delay={delay}>
      {children}
      <AriaTooltip
        offset={6}
        {...props}
        className={composeRenderProps(className, (cls) =>
          cn(
            'max-w-xs rounded-md border border-border bg-panel-raised px-2 py-1 text-xs text-fg shadow-popover',
            'transition-opacity data-[entering]:opacity-0 data-[exiting]:opacity-0',
            cls,
          ),
        )}
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  )
}
