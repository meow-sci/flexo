import {
  Toolbar as AriaToolbar,
  Separator,
  type ToolbarProps,
  type SeparatorProps,
} from 'react-aria-components'
import { composeTw, cn } from './styles'
import { Button, type ButtonKitProps } from './Button'

/** Floating control bar surface (react-aria Toolbar = arrow-key roving focus). */
export function Toolbar({ className, ...props }: ToolbarProps) {
  return (
    <AriaToolbar
      {...props}
      className={composeTw(
        'flex items-center gap-1 rounded-xl border border-border bg-panel/95 p-1 shadow-popover backdrop-blur-md aria-[orientation=vertical]:flex-col',
        className,
      )}
    />
  )
}

export function ToolbarSeparator({ className, ...props }: SeparatorProps) {
  const vertical = props.orientation !== 'horizontal'
  return (
    <Separator
      {...props}
      className={cn(
        'shrink-0 bg-border',
        vertical ? 'mx-0.5 h-5 w-px' : 'my-0.5 h-px w-full',
        className,
      )}
    />
  )
}

/** Convenience: a ghost button sized for toolbars. */
export function ToolbarButton(props: ButtonKitProps) {
  return <Button variant="ghost" size="sm" {...props} />
}
