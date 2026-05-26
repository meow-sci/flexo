import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Input, Popup, PopupContent, SectionTitle, ToolbarButton } from '@cladd-ui/react'
import { $part, pushUndo, setEditorTags, setPartId } from '../state/editorStore'
import { EditorTagsField } from './EditorTagsField'

/**
 * Top-surface "Part Data" action: opens a Popup with the Part-level metadata
 * fields. For now this is just the Part Id; more part metadata will join it here.
 */
export function PartDataButton() {
  const [open, setOpen] = useState(false)
  const part = useStore($part)

  return (
    <>
      <ToolbarButton onClick={() => setOpen(true)}>Part Data</ToolbarButton>
      <Popup
        open={open}
        onOpenChange={setOpen}
        contentClassName="max-w-md [&>.rounded-cladd-popup]:rounded-lg"
        headerLeft={<span className="px-2 pb-1 text-cladd-sm font-semibold">Part Data</span>}
      >
        <PopupContent>
          <SectionTitle>Part Id</SectionTitle>
          <Input
            size="sm"
            value={part.partId}
            inputClassName="font-mono"
            onFocus={() => pushUndo('edit part ID', part.partId)}
            onChange={(v: string) => setPartId(v)}
            placeholder="part_id"
            className="mt-2"
          />

          <SectionTitle className="mt-4">Editor Tags</SectionTitle>
          <EditorTagsField tags={part.editorTags} onChange={setEditorTags} />
        </PopupContent>
      </Popup>
    </>
  )
}
