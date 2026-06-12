import { Modal, Dialog, DialogHeader, useIsPhone } from './kit'
import { VerticalSplit, HorizontalSplit } from './VerticalSplit'

/**
 * Full-viewport modal shell shared by the Part / SubPart catalog browsers.
 * The body only mounts while open, so each open starts a fresh browsing session
 * (search/selection reset, split positions back to their defaults).
 */
export function BrowserPopup({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Modal
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      variant="cover"
      className="sm:w-[95vw] sm:max-w-[75rem]"
    >
      <Dialog className="h-full">
        <DialogHeader title={title} onClose={() => onOpenChange(false)} />
        {open && children}
      </Dialog>
    </Modal>
  )
}

/**
 * The browsers' responsive body arrangement. Desktop: `list | (preview / details)`
 * with draggable dividers. Phone: list over preview (favoring the preview —
 * browsing-to-preview is the point there), with an optional `phoneBottom`
 * override for extra chrome around the preview.
 */
export function BrowserLayout({
  list,
  preview,
  details,
  phoneBottom,
}: {
  list: React.ReactNode
  preview: React.ReactNode
  details: React.ReactNode
  phoneBottom?: React.ReactNode
}) {
  const isPhone = useIsPhone()
  return (
    <div className="min-h-0 flex-1">
      {isPhone ? (
        <VerticalSplit initialSplit={45} top={list} bottom={phoneBottom ?? preview} />
      ) : (
        <HorizontalSplit left={list} right={<VerticalSplit top={preview} bottom={details} />} />
      )}
    </div>
  )
}
