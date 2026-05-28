import {
  Label as AriaLabel,
  Text,
  FieldError as AriaFieldError,
  Group as AriaGroup,
  composeRenderProps,
  type LabelProps,
  type TextProps,
  type FieldErrorProps,
  type GroupProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'
import { cn, composeTw, focusRing } from './styles'

/** Standalone numeric/text input surface, shared by TextField/NumberField. */
export const inputStyles = tv({
  base: 'w-full min-w-0 rounded-md border border-border bg-panel-sunken text-fg transition-colors placeholder:text-fg-subtle hover:border-border-strong focus:border-accent focus:outline-none disabled:opacity-50',
  variants: {
    size: {
      sm: 'h-7 px-2 text-xs',
      md: 'h-9 px-2.5 text-sm',
    },
  },
  defaultVariants: { size: 'md' },
})

/** Bordered container used to group an input with adjacent buttons (steppers). */
export const fieldGroup = tv({
  extend: focusRing,
  base: 'flex items-center overflow-hidden rounded-md border border-border bg-panel-sunken transition-colors hover:border-border-strong focus-within:border-accent',
})

export function Label({ className, ...props }: LabelProps) {
  return (
    <AriaLabel {...props} className={cn('text-xs font-medium text-fg-muted', className)} />
  )
}

export function Description({ className, ...props }: TextProps) {
  return <Text {...props} slot="description" className={cn('text-xs text-fg-subtle', className)} />
}

export function FieldError({ className, ...props }: FieldErrorProps) {
  return (
    <AriaFieldError
      {...props}
      className={composeRenderProps(className, (cls) => cn('text-xs text-danger', cls))}
    />
  )
}

export function FieldGroup({ className, ...props }: GroupProps) {
  return (
    <AriaGroup
      {...props}
      className={composeRenderProps(className, (cls, renderProps) =>
        fieldGroup({ ...renderProps, className: cls }),
      )}
    />
  )
}

/** Small uppercase grouping heading used inside panels/popovers. */
export function SectionTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('text-xs font-semibold uppercase tracking-wide text-fg-subtle', className)}
    />
  )
}

export { composeTw }
