import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Modal, Dialog, DialogHeader, Button, toast } from './kit'
import { $part, importProjectData } from '../state/editorStore'
import { $projectName } from '../state/projectStore'
import { buildProjectExport, hasCustomAssets, parseProjectImport } from '../state/projectTransfer'

/**
 * "Project Data" Export / Import dialogs (data-only JSON, opened from the Project
 * popover). Export disables itself when the project has custom assets (Phase 1);
 * Import is ADDITIVE — pasted content is merged into the current workspace via
 * {@link importProjectData} (one undo step), never replacing it.
 */

const textareaClass =
  'h-96 w-full resize-none rounded-lg border border-border bg-panel-sunken p-2 font-mono text-xs text-fg outline-none'
const warningBox = 'rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning'

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

export function ExportProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const part = useStore($part)
  const name = useStore($projectName)
  const blocked = hasCustomAssets(part)
  const [copied, setCopied] = useState(false)

  // Only serialize while the dialog is open and export is allowed.
  const json = useMemo(
    () => (isOpen && !blocked ? JSON.stringify(buildProjectExport(part, name), null, 2) : ''),
    [isOpen, blocked, part, name],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.warn('clipboard write failed', err)
    }
  }

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name || 'project'}.flexo.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant="fullscreen"
      className="max-w-2xl"
    >
      <Dialog>
        <DialogHeader title="Export Project Data" onClose={() => onOpenChange(false)} />
        <div className="flex flex-col gap-2 overflow-auto p-3">
          {blocked ? (
            <div className={warningBox}>
              Export is disabled because this project has uploaded textures or custom (primitive)
              meshes. Data-only project export doesn’t bundle uploaded asset binaries yet — remove
              them to export, or use the KSA part-mod export. (Kitten meshes export fine.)
            </div>
          ) : (
            <>
              <p className="text-xs text-fg-subtle">
                Copy or download this JSON, then paste it into another project via Import. It
                carries meshes, layers, connectors, kittens, kitten meshes, animations, and GameData
                — but no uploaded textures or primitive meshes.
              </p>
              <textarea readOnly value={json} className={textareaClass} spellCheck={false} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onPress={download}>
                  Download .json
                </Button>
                <Button size="sm" variant="primary" onPress={copy}>
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </Modal>
  )
}

export function ImportProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [text, setText] = useState('')

  const close = (open: boolean) => {
    if (!open) setText('')
    onOpenChange(open)
  }

  const runImport = () => {
    const result = parseProjectImport(text)
    if (!result.ok) {
      toast({ title: 'Import failed', description: result.error, variant: 'danger' })
      return
    }
    const s = importProjectData(result.env)
    toast({
      title: 'Project imported',
      description: `${plural(s.meshes, 'mesh', 'meshes')}, ${plural(s.connectors, 'connector')}, ${plural(
        s.animations,
        'animation',
      )}, ${plural(s.newLayers, 'layer')}`,
      variant: 'success',
    })
    close(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={close}
      isDismissable
      variant="fullscreen"
      className="max-w-2xl"
    >
      <Dialog>
        <DialogHeader title="Import Project Data" onClose={() => close(false)} />
        <div className="flex flex-col gap-2 overflow-auto p-3">
          <p className="text-xs text-fg-subtle">
            Paste JSON exported from another project. Its meshes, connectors, layers, and animations
            are <span className="text-fg">added</span> to the current workspace — your existing
            content is kept.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste exported project JSON here…"
            className={textareaClass}
            spellCheck={false}
          />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" isDisabled={!text.trim()} onPress={runImport}>
              Import
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
  )
}
