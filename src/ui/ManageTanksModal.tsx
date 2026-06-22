import { useStore } from '@nanostores/react'
import { Modal, Dialog, DialogHeader, SectionTitle, useIsPhone } from './kit'
import {
  $part,
  addSubPartSolarPanel,
  removeSubPartSolarPanel,
  setSubPartSolarPanelOutput,
  setSubPartSolarPanelRotation,
} from '../state/editorStore'
import { SolarPanelsSection, TanksSection } from './GameDataSections'

interface Props {
  subPartTemplateId: string
  onClose: () => void
}

export function ManageTanksModal({ subPartTemplateId, onClose }: Props) {
  const part = useStore($part)
  const isPhone = useIsPhone()
  const spd = part.subPartGameData.find((s) => s.subPartTemplateId === subPartTemplateId)
  const tanks = spd?.tanks ?? []
  const solarPanels = spd?.solarPanels ?? []

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      isDismissable
      variant={isPhone ? 'cover' : 'fullscreen'}
    >
      <Dialog className="min-h-0 flex-1">
        <DialogHeader title={`SubPart Data — ${subPartTemplateId}`} onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <div className="flex flex-col gap-2">
            <SectionTitle>Tanks</SectionTitle>
            <TanksSection tanks={tanks} subPartTemplateId={subPartTemplateId} />
          </div>
          <SolarPanelsSection
            solarPanels={solarPanels}
            onAdd={() => addSubPartSolarPanel(subPartTemplateId)}
            onRemove={(i) => removeSubPartSolarPanel(subPartTemplateId, i)}
            onChangeOutput={(i, w) => setSubPartSolarPanelOutput(subPartTemplateId, i, w)}
            onChangeRotation={(i, r) => setSubPartSolarPanelRotation(subPartTemplateId, i, r)}
          />
        </div>
      </Dialog>
    </Modal>
  )
}
