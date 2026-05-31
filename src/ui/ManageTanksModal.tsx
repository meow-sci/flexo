import { useStore } from '@nanostores/react'
import { Modal, Dialog, DialogHeader, useIsPhone } from './kit'
import { $part } from '../state/editorStore'
import { TanksSection } from './GameDataSections'

interface Props {
  subPartTemplateId: string
  onClose: () => void
}

export function ManageTanksModal({ subPartTemplateId, onClose }: Props) {
  const part = useStore($part)
  const isPhone = useIsPhone()
  const spd = part.subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  const tanks = spd?.tanks ?? []

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      variant={isPhone ? 'cover' : 'fullscreen'}
    >
      <Dialog className="min-h-0 flex-1">
        <DialogHeader
          title={`Tanks — ${subPartTemplateId}`}
          onClose={onClose}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-4">
          <TanksSection tanks={tanks} subPartTemplateId={subPartTemplateId} />
        </div>
      </Dialog>
    </Modal>
  )
}
