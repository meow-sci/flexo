import {
  ModalOverlay,
  Modal as AriaModal,
  Dialog as AriaDialog,
  Heading,
  Button as AriaButton,
  type ModalOverlayProps,
  type DialogProps,
} from 'react-aria-components'
import { X } from 'lucide-react'
import { tv, type VariantProps } from 'tailwind-variants'
import { cn } from './styles'

const overlay = tv({
  base: 'fixed inset-0 z-50 flex bg-overlay/60 backdrop-blur-sm transition-opacity data-[entering]:opacity-0 data-[exiting]:opacity-0',
  variants: {
    variant: {
      center: 'items-center justify-center p-4',
      sheet: 'items-end justify-center',
      fullscreen: 'items-stretch justify-center p-3 sm:p-6',
      cover: 'items-stretch justify-center p-0',
    },
  },
  defaultVariants: { variant: 'center' },
})

const modal = tv({
  base: 'border-border bg-panel-raised text-fg shadow-popover',
  variants: {
    variant: {
      center:
        'w-full max-w-md rounded-xl border transition-[transform,opacity] data-[entering]:scale-95 data-[entering]:opacity-0 data-[exiting]:scale-95 data-[exiting]:opacity-0',
      sheet:
        'flex max-h-[88vh] w-full flex-col rounded-t-2xl border-t transition-transform data-[entering]:translate-y-full data-[exiting]:translate-y-full',
      fullscreen:
        'flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border transition-[transform,opacity] data-[entering]:scale-[0.98] data-[entering]:opacity-0 data-[exiting]:scale-[0.98] data-[exiting]:opacity-0',
      cover:
        'flex h-full w-full flex-col overflow-hidden transition-opacity data-[entering]:opacity-0 data-[exiting]:opacity-0',
    },
  },
  defaultVariants: { variant: 'center' },
})

export interface ModalKitProps extends ModalOverlayProps, VariantProps<typeof modal> {
  className?: string
}

/**
 * Controlled overlay (isOpen/onOpenChange). `variant`:
 *  - center: confirm/alert dialogs
 *  - fullscreen: large editors/browsers
 *  - sheet: bottom sheet (mobile)
 * Children should be a {@link Dialog}.
 */
export function Modal({ variant, className, children, ...props }: ModalKitProps) {
  return (
    <ModalOverlay {...props} className={overlay({ variant })}>
      <AriaModal className={cn(modal({ variant }), className)}>{children}</AriaModal>
    </ModalOverlay>
  )
}

export function Dialog({ className, ...props }: DialogProps) {
  return (
    <AriaDialog
      {...props}
      className={cn('flex max-h-[inherit] flex-col outline-none', className)}
    />
  )
}

/** Standard title bar for form/browser modals (title + close button). */
export function DialogHeader({ title, onClose }: { title: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
      <Heading slot="title" className="text-sm font-semibold text-fg">
        {title}
      </Heading>
      <AriaButton
        onPress={onClose}
        aria-label="Close"
        className="flex size-7 items-center justify-center rounded-md text-fg-subtle outline-none hover:bg-white/10 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <X size={16} />
      </AriaButton>
    </div>
  )
}
