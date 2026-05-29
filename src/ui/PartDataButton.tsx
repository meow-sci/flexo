import { useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  Modal,
  Dialog,
  DialogHeader,
  DisclosureSection,
  SectionTitle,
  TextField,
  ToolbarButton,
} from './kit'
import { $part, pushUndo, setEditorTags, setPartId } from '../state/editorStore'
import { EditorTagsField } from './EditorTagsField'
import {
  CouplingSection,
  IdentityFields,
  MassSection,
  PowerSection,
  TanksSection,
} from './GameDataSections'

/**
 * Top-surface "Part Data" action: opens a modal exposing every Part-level field
 * that has no 3D representation — the Part Id + the {@link PartGameData} block
 * (display name, custom mass, tanks, power, coupling) and the editor tags.
 * Connectors are NOT here; they're edited in the 3D workspace.
 *
 * Fields are grouped into collapsible sections in one scrollable body, so the
 * same layout works on desktop (centered fullscreen-ish modal) and on mobile
 * (a tall scroll sheet). Mirrors space-tape's GameData editor sections.
 */
export function PartDataButton() {
  const [open, setOpen] = useState(false)
  const part = useStore($part)
  const { gameData } = part

  const powerCount =
    gameData.batteries.length + gameData.generators.length + gameData.powerConsumers.length
  const couplingCount =
    (gameData.decoupler ? 1 : 0) + (gameData.dockingPort ? 1 : 0) + (gameData.evaDoor ? 1 : 0)

  return (
    <>
      <ToolbarButton onPress={() => setOpen(true)}>Part Data</ToolbarButton>
      <Modal isOpen={open} onOpenChange={setOpen} isDismissable variant="fullscreen">
        <Dialog className="min-h-0 flex-1">
          <DialogHeader title="Part Data" onClose={() => setOpen(false)} />
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-4">
            <DisclosureSection title="Identity" defaultExpanded>
              <label className="flex flex-col gap-1">
                <SectionTitle>Part Id</SectionTitle>
                <TextField
                  size="sm"
                  value={part.partId}
                  inputClassName="font-mono"
                  aria-label="Part Id"
                  onFocus={() => pushUndo('edit part ID', part.partId)}
                  onChange={(v) => setPartId(v)}
                  placeholder="part_id"
                />
              </label>
              <IdentityFields gameData={gameData} />
              <div className="flex flex-col gap-1">
                <SectionTitle>Editor Tags</SectionTitle>
                <EditorTagsField tags={part.editorTags} onChange={setEditorTags} />
              </div>
            </DisclosureSection>

            <DisclosureSection title="Mass" defaultExpanded>
              <MassSection gameData={gameData} />
            </DisclosureSection>

            <DisclosureSection title="Tanks" badge={gameData.tanks.length || ''} defaultExpanded>
              <TanksSection gameData={gameData} />
            </DisclosureSection>

            <DisclosureSection title="Power" badge={powerCount || ''} defaultExpanded>
              <PowerSection gameData={gameData} />
            </DisclosureSection>

            <DisclosureSection title="Coupling" badge={couplingCount || ''} defaultExpanded>
              <CouplingSection part={part} />
            </DisclosureSection>
          </div>
        </Dialog>
      </Modal>
    </>
  )
}
