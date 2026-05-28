import {
  TagGroup as AriaTagGroup,
  TagList as AriaTagList,
  Tag as AriaTag,
  Button as AriaButton,
  composeRenderProps,
  type TagGroupProps,
  type TagListProps,
  type TagProps,
} from 'react-aria-components'
import { X } from 'lucide-react'
import { composeTw, cn } from './styles'

export function TagGroup({ className, ...props }: TagGroupProps) {
  return <AriaTagGroup {...props} className={cn('flex flex-col gap-1', className)} />
}

export function TagList<T extends object>({ className, ...props }: TagListProps<T>) {
  return (
    <AriaTagList
      {...props}
      className={composeTw('flex flex-wrap gap-1 outline-none', className)}
    />
  )
}

export function Tag({ className, children, ...props }: TagProps) {
  const textValue = props.textValue ?? (typeof children === 'string' ? children : undefined)
  return (
    <AriaTag
      {...props}
      textValue={textValue}
      className={composeRenderProps(className, (cls) =>
        cn(
          'inline-flex cursor-default select-none items-center gap-1 rounded-md border border-border bg-white/[0.04] py-0.5 pl-2 pr-1 text-xs text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
          cls,
        ),
      )}
    >
      {composeRenderProps(children, (kids, { allowsRemoving }) => (
        <>
          <span className="truncate">{kids}</span>
          {allowsRemoving && (
            <AriaButton
              slot="remove"
              className="flex size-4 items-center justify-center rounded text-fg-subtle outline-none hover:bg-white/10 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={12} />
            </AriaButton>
          )}
        </>
      ))}
    </AriaTag>
  )
}

/** Static, non-interactive count/status pill. */
export function Chip({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center rounded-full bg-white/[0.07] px-1.5 py-0.5 text-xs tabular-nums text-fg-muted',
        className,
      )}
    />
  )
}
