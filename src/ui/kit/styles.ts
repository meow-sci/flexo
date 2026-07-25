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

/**
 * Row styling for the app's standalone `GridList`s (Assets list, Mesh Picker):
 * accent ring when selected, subtle hover otherwise, dimmed when disabled.
 * Compose call-site extras via `cn(gridRowClass(rp), …)`.
 */
export function gridRowClass(rp: {
  isSelected: boolean
  isFocusVisible: boolean
  isDisabled?: boolean
}): string {
  return cn(
    'flex cursor-default select-none items-center gap-1 rounded-md px-2 py-1 text-fg outline-none',
    rp.isDisabled && 'opacity-40',
    rp.isSelected ? 'bg-white/[0.08] ring-2 ring-inset ring-accent' : 'hover:bg-white/[0.06]',
    rp.isFocusVisible && !rp.isSelected && 'ring-1 ring-inset ring-accent',
  )
}

/** Amber callout box for inline warnings inside dialogs and panels. */
export const warningBox =
  'rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning'

/** Red callout box for blocking errors (the action would produce something broken). */
export const dangerBox =
  'flex flex-col gap-1 rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs text-danger'

const monoTextareaBase =
  'w-full resize-none rounded-lg border border-border bg-panel-sunken p-2 font-mono text-xs text-fg outline-none'

/** Tall read-mostly monospace textarea for XML/JSON payloads in dialogs (fixed height). */
export const monoTextarea = `${monoTextareaBase} h-96`

/** Monospace textarea that grows to fill its flex-column parent (full-height dialog panels). */
export const monoTextareaFill = `${monoTextareaBase} min-h-0 flex-1`
