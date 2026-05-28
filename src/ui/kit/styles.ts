import { composeRenderProps } from 'react-aria-components'
import { tv, cn as cnRaw, type ClassValue } from 'tailwind-variants'

/** clsx + tailwind-merge, guaranteed to return a string (react-aria render props
 *  require `string`, but tailwind-variants' `cn` is typed `string | undefined`). */
export function cn(...inputs: ClassValue[]): string {
  return cnRaw(...inputs) ?? ''
}

/**
 * Shared keyboard focus ring. Extended (via `extend`) by interactive primitives
 * so every control shows the same accent outline only for keyboard focus.
 */
export const focusRing = tv({
  base: 'outline-accent outline-offset-2',
  variants: {
    isFocusVisible: {
      false: 'outline-0',
      true: 'outline outline-2',
    },
  },
})

/**
 * Merge a fixed Tailwind class string with react-aria's render-prop `className`
 * (which may itself be a function of render state), de-duping conflicts.
 */
export function composeTw<T extends object>(
  tw: string,
  className: string | ((v: T) => string) | undefined,
) {
  return composeRenderProps(className, (resolved) => cn(tw, resolved))
}
