import {
  Checkbox as AriaCheckbox,
  composeRenderProps,
  type CheckboxProps,
} from 'react-aria-components'
import { Check, Minus } from 'lucide-react'
import { tv } from 'tailwind-variants'
import { composeTw, focusRing } from './styles'

const box = tv({
  extend: focusRing,
  base: 'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
  variants: {
    isSelected: {
      false: 'border-border-strong bg-panel-sunken',
      true: 'border-accent bg-accent',
    },
  },
})

export function Checkbox({ className, children, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox
      {...props}
      className={composeTw(
        'group flex cursor-default items-center gap-2 text-sm text-fg disabled:opacity-50',
        className,
      )}
    >
      {composeRenderProps(children, (kids, { isSelected, isIndeterminate, isFocusVisible }) => {
        const on = isSelected || isIndeterminate
        return (
          <>
            <span className={box({ isSelected: on, isFocusVisible })}>
              {isIndeterminate ? (
                <Minus size={12} className="text-accent-fg" />
              ) : isSelected ? (
                <Check size={12} className="text-accent-fg" />
              ) : null}
            </span>
            {kids != null && kids !== '' ? <span>{kids}</span> : null}
          </>
        )
      })}
    </AriaCheckbox>
  )
}
