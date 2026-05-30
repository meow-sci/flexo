import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Modal, Dialog, DialogHeader, Button, TextField, toast } from './kit'
import { addCustomTexture } from '../state/customAssetStore'

interface CustomTextureDialogProps {
  onClose: () => void
}

/**
 * Upload (or paste) an image, name it, and encode it into a KTX2 texture that's
 * added to the project's custom-asset library. The encoded texture immediately
 * becomes selectable in the Create Mesh dialog. v1 = single diffuse map.
 *
 * Mounted only while open (see AddButton) so per-open state initializes via
 * useState with no reset effect.
 */
export function CustomTextureDialog({ onClose }: CustomTextureDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Revoke the last preview object URL on unmount (cleanup only — no setState).
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const pickFile = (f: File | null | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      toast({ title: 'Not an image', description: `“${f.name}” is not an image file.`, variant: 'warning' })
      return
    }
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
    setFile(f)
    setName((prev) => prev || f.name.replace(/\.[^.]+$/, ''))
  }

  // Paste an image from the clipboard. pickFile runs in the event callback, not
  // synchronously in the effect body, so it's allowed.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (f) {
        e.preventDefault()
        pickFile(f)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    pickFile(e.dataTransfer.files?.[0])
  }

  const submit = async () => {
    if (!file) return
    setBusy(true)
    try {
      await addCustomTexture(file, name)
      toast({ title: 'Texture added', description: name || file.name, variant: 'success' })
      onClose()
    } catch (err) {
      console.warn('texture encode failed', err)
      toast({ title: 'Encode failed', description: String((err as Error)?.message ?? err), variant: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onOpenChange={(v) => !v && onClose()} isDismissable variant="fullscreen" className="max-w-md">
      <Dialog>
        <DialogHeader title="Upload texture" onClose={onClose} />
        <div className="flex flex-col gap-3 p-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-panel-sunken text-fg-muted hover:border-accent"
          >
            {previewUrl ? (
              <img src={previewUrl} alt="preview" className="h-full w-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-1 p-4 text-center text-sm">
                <Upload size={24} />
                Click to choose, drag-drop, or paste an image
              </span>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <TextField label="Name" value={name} onChange={setName} size="sm" placeholder="texture" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" isDisabled={!file || busy} onPress={submit}>
              {busy ? 'Encoding…' : 'Add texture'}
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  )
}
