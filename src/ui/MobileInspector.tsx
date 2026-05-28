import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { ChevronUp, X } from 'lucide-react'
import { Heading } from 'react-aria-components'
import { Button, Modal, Dialog, Toolbar } from './kit'
import { LayersButton } from './LayersButton'
import { InspectorContent } from './InspectorContent'
import { $activeLayer } from '../state/selectors'
import { $selectedConnectorIndices, $selectedIndices } from '../state/editorStore'

/**
 * Phone-only inspector: a pinned bottom-right button (showing the active layer +
 * a selection-count badge) that opens a bottom sheet with the layers bar +
 * placement list + transform inspector. Frees the entire viewport for the 3D
 * canvas until the user explicitly opens the inspector.
 */
export function MobileInspector() {
  const [open, setOpen] = useState(false)
  const activeLayer = useStore($activeLayer)
  const selectedCount = useStore($selectedIndices).length + useStore($selectedConnectorIndices).length

  return (
    <>
      <Button
        size="lg"
        variant="secondary"
        className="absolute bottom-3 right-3 shadow-popover"
        onPress={() => setOpen(true)}
        aria-label="Open inspector"
      >
        <ChevronUp className="size-4" />
        <span className="max-w-[10ch] truncate">{activeLayer?.name ?? 'Inspector'}</span>
        {selectedCount > 0 && (
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg">
            {selectedCount}
          </span>
        )}
      </Button>

      <Modal isOpen={open} onOpenChange={setOpen} isDismissable variant="sheet" className="h-[78vh]">
        <Dialog className="h-full">
          <Heading slot="title" className="sr-only">
            Inspector
          </Heading>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-2">
            <Toolbar aria-label="Layers" className="min-w-0 flex-1">
              <LayersButton />
            </Toolbar>
            <Button
              iconOnly
              size="sm"
              variant="ghost"
              aria-label="Close inspector"
              onPress={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 p-2">
            <InspectorContent />
          </div>
        </Dialog>
      </Modal>
    </>
  )
}
