import {
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as ToastContent,
  Button as AriaButton,
  Text,
} from 'react-aria-components'
import { X } from 'lucide-react'
import { tv } from 'tailwind-variants'

export interface ToastMessage {
  title: string
  description?: string
  variant?: 'default' | 'success' | 'danger' | 'warning'
}

/** App-wide toast queue. Render {@link GlobalToastRegion} once near the root. */
export const toastQueue = new ToastQueue<ToastMessage>({ maxVisibleToasts: 4 })

/** Imperative entry point — replaces cladd's useToast(). */
export function toast(message: ToastMessage, options?: { timeout?: number }) {
  return toastQueue.add(message, { timeout: options?.timeout ?? 4000 })
}

const toastStyle = tv({
  base: 'flex min-w-64 max-w-sm items-center gap-3 rounded-lg border bg-panel-raised px-3 py-2 text-fg shadow-popover transition-[transform,opacity] data-[entering]:translate-y-2 data-[entering]:opacity-0 data-[exiting]:opacity-0',
  variants: {
    variant: {
      default: 'border-border',
      success: 'border-accent',
      danger: 'border-danger',
      warning: 'border-warning',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function GlobalToastRegion() {
  return (
    <ToastRegion
      queue={toastQueue}
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 outline-none"
    >
      {({ toast }) => (
        <AriaToast toast={toast} className={toastStyle({ variant: toast.content.variant })}>
          <ToastContent className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Text slot="title" className="truncate text-sm font-medium">
              {toast.content.title}
            </Text>
            {toast.content.description && (
              <Text slot="description" className="truncate text-xs text-fg-muted">
                {toast.content.description}
              </Text>
            )}
          </ToastContent>
          <AriaButton
            slot="close"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle outline-none hover:bg-white/10 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Dismiss"
          >
            <X size={14} />
          </AriaButton>
        </AriaToast>
      )}
    </ToastRegion>
  )
}
