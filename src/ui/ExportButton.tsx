import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { CheckCircle2, Download, FolderInput, FolderSync } from 'lucide-react'
import {
  Modal,
  Dialog,
  DialogHeader,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  ToolbarButton,
  toast,
} from './kit'
import { $part } from '../state/editorStore'
import { $projectName } from '../state/projectStore'
import {
  $modFolder,
  getWritableModFolder,
  pickModFolder,
  requestModFolderPermission,
} from '../state/modFolderStore'
import { serializeGameData, serializePart } from '../ksa/partXmlSerializer'
import { buildModZip, writeModToFolder } from '../ksa/modExport'

type Mode = 'xml' | 'mod'
type Tab = 'part' | 'gamedata'

/** Returns human-readable warnings about the current part prior to export. */
function validate(partId: string, instanceIds: string[]): string[] {
  const warnings: string[] = []
  if (!partId.trim()) warnings.push('Part Id is empty.')
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const id of instanceIds) {
    if (seen.has(id)) dupes.add(id)
    seen.add(id)
  }
  if (dupes.size > 0) warnings.push(`Duplicate instance ids: ${[...dupes].join(', ')}`)
  if (instanceIds.length === 0) warnings.push('No SubParts placed.')
  return warnings
}

function singleSelect(keys: Iterable<string | number>): string | undefined {
  return [...keys][0] as string | undefined
}

const warningBox = 'rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning'

/**
 * Top-surface "Export" action. Two modes:
 *   - XML: shows the raw Part / GameData KSA XML with copy-to-clipboard.
 *   - Mod: writes a KSA part mod (mod.toml + per-project XML) either into a
 *     user-granted `…/mods` folder or as a downloadable zip.
 */
interface ExportButtonProps {
  isOpen?: boolean
  onOpenChange?: (v: boolean) => void
}

export function ExportButton({ isOpen: externalOpen, onOpenChange: externalOnChange }: ExportButtonProps = {}) {
  const part = useStore($part)
  const [internalOpen, setInternalOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('xml')
  const isControlled = externalOpen !== undefined
  const open = isControlled ? externalOpen! : internalOpen
  const setOpen = isControlled ? (v: boolean) => externalOnChange?.(v) : setInternalOpen

  const warnings = useMemo(
    () => validate(part.partId, part.placements.map((p) => p.instanceId)),
    [part],
  )

  return (
    <>
      {!isControlled && <ToolbarButton onPress={() => setOpen(true)}>Export</ToolbarButton>}
      <Modal isOpen={open} onOpenChange={setOpen} isDismissable variant="fullscreen" className="max-w-2xl">
        <Dialog>
          <DialogHeader title="Export" onClose={() => setOpen(false)} />
          <div className="flex flex-col gap-2 overflow-auto p-3">
            {warnings.length > 0 && (
              <div className={warningBox}>
                {warnings.map((w) => (
                  <div key={w}>⚠ {w}</div>
                ))}
              </div>
            )}
            <ToggleButtonGroup
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[mode]}
              onSelectionChange={(keys) => {
                const next = singleSelect(keys)
                if (next) setMode(next as Mode)
              }}
            >
              <ToggleButton id="xml" size="sm">
                XML
              </ToggleButton>
              <ToggleButton id="mod" size="sm">
                Part Mod
              </ToggleButton>
            </ToggleButtonGroup>
            {mode === 'xml' ? <XmlPanel /> : <ModPanel />}
          </div>
        </Dialog>
      </Modal>
    </>
  )
}

/** Raw-XML view: Part / GameData tab switcher + copy-to-clipboard. */
function XmlPanel() {
  const part = useStore($part)
  const [tab, setTab] = useState<Tab>('part')
  const [copied, setCopied] = useState(false)

  const xml = useMemo(
    () => (tab === 'part' ? serializePart(part) : serializeGameData(part)),
    [tab, part],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(xml)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.warn('clipboard write failed', err)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ToggleButtonGroup
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[tab]}
        onSelectionChange={(keys) => {
          const next = singleSelect(keys)
          if (next) setTab(next as Tab)
        }}
      >
        <ToggleButton id="part" size="sm">
          Part XML
        </ToggleButton>
        <ToggleButton id="gamedata" size="sm">
          GameData XML
        </ToggleButton>
      </ToggleButtonGroup>
      <textarea
        readOnly
        value={xml}
        className="h-96 w-full resize-none rounded-lg border border-border bg-panel-sunken p-2 font-mono text-xs text-fg outline-none"
        spellCheck={false}
      />
      <div className="flex justify-end">
        <Button size="sm" variant="primary" onPress={copy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </Button>
      </div>
    </div>
  )
}

/** Part-mod view: folder grant + write-to-folder, plus download-zip. */
function ModPanel() {
  const part = useStore($part)
  const projectName = useStore($projectName)
  const folder = useStore($modFolder)
  const [busy, setBusy] = useState(false)

  const writeToFolder = async () => {
    setBusy(true)
    try {
      const dir = await getWritableModFolder()
      if (!dir) {
        toast({ title: 'Folder access required', description: 'Grant write access to your mods folder first.', variant: 'warning' })
        return
      }
      const result = await writeModToFolder(dir, part, projectName)
      toast({
        title: 'Exported to folder',
        description: `${result.partFile} + ${result.gameDataFile} → ${dir.name}/flexo-parts`,
        variant: 'success',
      })
    } catch (err) {
      console.warn('mod folder export failed', err)
      toast({ title: 'Export failed', description: String((err as Error)?.message ?? err), variant: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const downloadZip = async () => {
    try {
      const blob = await buildModZip(part, projectName)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'flexo-parts.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.warn('mod zip export failed', err)
      toast({ title: 'Export failed', description: String((err as Error)?.message ?? err), variant: 'danger' })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-panel-sunken p-3 text-sm text-fg-muted">
        <p>
          Writes a <span className="font-mono text-xs">flexo-parts</span> part mod —{' '}
          <span className="font-mono text-xs">mod.toml</span> plus{' '}
          <span className="font-mono text-xs">{projectName || 'Mod'}</span> Part &amp; GameData XML.
        </p>
        <p>Existing XML in the folder is never overwritten.</p>
      </div>

      <FolderGrant status={folder.status} name={folder.name} />

      <div className="flex flex-col gap-1.5">
        <Button
          size="lg"
          variant="primary"
          isDisabled={folder.status === 'unsupported' || busy}
          onPress={writeToFolder}
        >
          <FolderInput size={20} /> {busy ? 'Exporting...' : 'Export to mods folder'}
        </Button>
        <Button size="lg" variant="ghost" onPress={downloadZip}>
          <Download size={20} /> Download mod zip
        </Button>
      </div>
    </div>
  )
}

/** Folder-grant status row with the appropriate grant / re-grant action. */
function FolderGrant({ status, name }: { status: string; name: string | null }) {
  if (status === 'unsupported') {
    return (
      <div className={warningBox}>
        This browser can't write to folders. Use “Download mod zip” instead.
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg px-1 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
          <CheckCircle2 size={20} className="shrink-0 text-accent" />
          <span className="truncate">
            Mods folder: <span className="text-fg">{name}</span>
          </span>
        </span>
        <Button size="md" variant="ghost" onPress={() => void pickModFolder()}>
          Change
        </Button>
      </div>
    )
  }

  if (status === 'needs-permission') {
    return (
      <div className={`${warningBox} flex items-center justify-between gap-2`}>
        <span className="truncate">Access to “{name}” needs to be re-granted.</span>
        <Button size="md" onPress={() => void requestModFolderPermission()}>
          <FolderSync size={18} /> Re-Grant
        </Button>
      </div>
    )
  }

  // 'none'
  return (
    <Button size="lg" onPress={() => void pickModFolder()}>
      <FolderInput size={20} /> Choose mods folder...
    </Button>
  )
}
