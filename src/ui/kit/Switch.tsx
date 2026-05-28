import { Switch as AriaSwitch, composeRenderProps, type SwitchProps } from 'react-aria-components'
import { tv } from 'tailwind-variants'
import { composeTw, focusRing } from './styles'

const track = tv({
  extend: focusRing,
  base: 'flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 transition-colors',
  variants: {
    isSelected: {
      false: 'border-border-strong bg-panel-sunken',
      true: 'border-accent bg-accent',
    },
  },
})

export function Switch({ className, children, ...props }: SwitchProps) {
  return (
    <AriaSwitch
      {...props}
      className={composeTw(
        'group flex cursor-default items-center gap-2 text-sm text-fg disabled:opacity-50',
        className,
      )}
    >
      {composeRenderProps(children, (kids, { isSelected, isFocusVisible }) => (
        <>
          <span className={track({ isSelected, isFocusVisible })}>
            <span
              className={`size-3.5 rounded-full transition-transform ${
                isSelected ? 'translate-x-4 bg-accent-fg' : 'translate-x-0 bg-fg-muted'
              }`}
            />
          </span>
          {kids != null && kids !== '' ? <span>{kids}</span> : null}
        </>
      ))}
    </AriaSwitch>
  )
}
