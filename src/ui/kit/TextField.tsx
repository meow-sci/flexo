import { type Ref } from 'react'
import {
  TextField as AriaTextField,
  Input as AriaInput,
  type TextFieldProps,
} from 'react-aria-components'
import { type VariantProps } from 'tailwind-variants'
import { inputStyles, Label, Description, FieldError, composeTw } from './Field'

export interface TextFieldKitProps
  extends Omit<TextFieldProps, 'children'>,
    VariantProps<typeof inputStyles> {
  label?: React.ReactNode
  description?: React.ReactNode
  errorMessage?: string
  placeholder?: string
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  inputClassName?: string
  inputRef?: Ref<HTMLInputElement>
  onFocus?: React.FocusEventHandler<HTMLInputElement>
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}

/**
 * Text input. Without a `label` it's a bare inline field (the wrapper carries
 * `className` for layout); with one it stacks label/description/error. `onChange`
 * yields the raw string, so callers that manage their own draft/parse keep working.
 */
export function TextField({
  label,
  description,
  errorMessage,
  size,
  placeholder,
  type,
  inputMode,
  autoFocus,
  inputClassName,
  inputRef,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: TextFieldKitProps) {
  return (
    <AriaTextField {...props} className={composeTw('flex flex-col gap-1', className)}>
      {label && <Label>{label}</Label>}
      <AriaInput
        ref={inputRef}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={inputStyles({ size, className: inputClassName })}
      />
      {description && <Description>{description}</Description>}
      {errorMessage && <FieldError>{errorMessage}</FieldError>}
    </AriaTextField>
  )
}
