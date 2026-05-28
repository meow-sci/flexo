import { Button as AriaButton, composeRenderProps, type ButtonProps } from 'react-aria-components'
import { tv, type VariantProps } from 'tailwind-variants'
import { focusRing } from './styles'

export const button = tv({
  extend: focusRing,
  base: 'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent font-medium transition-colors cursor-default disabled:opacity-45 disabled:pointer-events-none',
  variants: {
    variant: {
      primary: 'bg-accent text-accent-fg hover:bg-accent-hover pressed:bg-accent-press',
      secondary: 'border-border bg-white/[0.04] text-fg hover:bg-white/[0.09] pressed:bg-white/[0.13]',
      ghost: 'text-fg hover:bg-white/[0.08] pressed:bg-white/[0.04]',
      danger: 'bg-danger text-danger-fg hover:brightness-110 pressed:brightness-90',
      'danger-ghost': 'text-danger hover:bg-danger/15 pressed:bg-danger/25',
    },
    size: {
      sm: 'h-7 px-2.5 text-xs',
      md: 'h-9 px-3.5 text-sm',
      lg: 'h-11 px-4 text-sm',
    },
    iconOnly: {
      true: 'aspect-square px-0',
    },
  },
  compoundVariants: [
    { iconOnly: true, size: 'sm', class: 'w-7' },
    { iconOnly: true, size: 'md', class: 'w-9' },
    { iconOnly: true, size: 'lg', class: 'w-11' },
  ],
  defaultVariants: { variant: 'secondary', size: 'md' },
})

export interface ButtonKitProps extends ButtonProps, VariantProps<typeof button> {}

export function Button({ variant, size, iconOnly, className, ...props }: ButtonKitProps) {
  return (
    <AriaButton
      {...props}
      className={composeRenderProps(className, (cls, renderProps) =>
        button({ ...renderProps, variant, size, iconOnly, className: cls }),
      )}
    />
  )
}
