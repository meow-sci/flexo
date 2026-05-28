import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Modal, Dialog, DialogHeader, SectionTitle, TextField, ToolbarButton } from './kit'
import { $part, pushUndo, setEditorTags, setPartId } from '../state/editorStore'
import { EditorTagsField } from './EditorTagsField'

/**
 * Top-surface "Part Data" action: opens a modal with the Part-level metadata
 * fields. For now this is the Part Id and Editor Tags; more will join them here.
 */
export function PartDataButton() {
  const [open, setOpen] = useState(false)
  const part = useStore($part)

  return (
    <>
      <ToolbarButton onPress={() => setOpen(true)}>Part Data</ToolbarButton>
      <Modal isOpen={open} onOpenChange={setOpen} isDismissable variant="center">
        <Dialog>
          <DialogHeader title="Part Data" onClose={() => setOpen(false)} />
          <div className="flex flex-col gap-2 overflow-auto p-4">
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

            <SectionTitle className="mt-4">Editor Tags</SectionTitle>
            <EditorTagsField tags={part.editorTags} onChange={setEditorTags} />
          </div>
        </Dialog>
      </Modal>
    </>
  )
}
