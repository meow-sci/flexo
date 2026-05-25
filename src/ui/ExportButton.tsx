import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  Button,
  Popup,
  PopupContent,
  Segmented,
  SegmentedButton,
  Surface,
  ToolbarButton,
  useToast,
} from '@cladd-ui/react'
import { CheckCircle2, Download, FolderInput, FolderSync } from 'lucide-react'
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

/**
 * Top-surface "Export" action. Two modes:
 *   - XML: shows the raw Part / GameData KSA XML with copy-to-clipboard.
 *   - Mod: writes a KSA part mod (mod.toml + per-project XML) either into a
 *     user-granted `…/mods` folder (File System Access API, grant persisted in
 *     IndexedDB) or as a downloadable zip. See src/ksa/modExport.ts.
 */
export function ExportButton() {
  const part = useStore($part)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('xml')

  const warnings = useMemo(
    () => validate(part.partId, part.placements.map((p) => p.instanceId)),
    [part],
  )

  return (
    <>
      <ToolbarButton onClick={() => setOpen(true)}>Export</ToolbarButton>
      <Popup
        open={open}
        onOpenChange={setOpen}
        contentClassName="max-w-2xl"
        headerLeft={<span className="px-2 pb-1 text-cladd-sm font-semibold">Export</span>}
      >
        <PopupContent>
          <div className="flex flex-col gap-2">
            {warnings.length > 0 && (
              <Surface
                color="yellow"
                variant="solid-fill"
                className="rounded-lg"
                contentClassName="p-2 text-xs"
              >
                {warnings.map((w) => (
                  <div key={w}>⚠ {w}</div>
                ))}
              </Surface>
            )}
            <Segmented>
              <SegmentedButton active={mode === 'xml'} onClick={() => setMode('xml')}>
                XML
              </SegmentedButton>
              <SegmentedButton active={mode === 'mod'} onClick={() => setMode('mod')}>
                Part Mod
              </SegmentedButton>
            </Segmented>
            {mode === 'xml' ? <XmlPanel /> : <ModPanel />}
          </div>
        </PopupContent>
      </Popup>
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
      <Segmented>
        <SegmentedButton active={tab === 'part'} onClick={() => setTab('part')}>
          Part XML
        </SegmentedButton>
        <SegmentedButton active={tab === 'gamedata'} onClick={() => setTab('gamedata')}>
          GameData XML
        </SegmentedButton>
      </Segmented>
      <textarea
        readOnly
        value={xml}
        className="h-96 w-full resize-none rounded-lg bg-cladd-bg p-2 font-mono text-xs text-cladd-fg outline-none"
        spellCheck={false}
      />
      <div className="flex justify-end">
        <Button size="sm" color="brand" onClick={copy}>
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
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const writeToFolder = async () => {
    setBusy(true)
    try {
      const dir = await getWritableModFolder()
      if (!dir) {
        toast({ title: 'Folder access required', text: 'Grant write access to your mods folder first.', color: 'yellow' })
        return
      }
      const result = await writeModToFolder(dir, part, projectName)
      toast({
        title: 'Exported to folder',
        text: `${result.partFile} + ${result.gameDataFile} → ${dir.name}/flexo-parts`,
        color: 'green',
        icon: CheckCircle2,
      })
    } catch (err) {
      console.warn('mod folder export failed', err)
      toast({ title: 'Export failed', text: String((err as Error)?.message ?? err), color: 'red' })
    } finally {
      setBusy(false)
    }
  }

  const downloadZip = () => {
    const blob = buildModZip(part, projectName)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'flexo-parts.zip'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <Surface outline className="rounded-lg" contentClassName="p-3 text-cladd-sm">
        <p>
          Writes a <span className="font-mono text-cladd-xs">flexo-parts</span> part mod —{' '}
          <span className="font-mono text-cladd-xs">mod.toml</span> plus{' '}
          <span className="font-mono text-cladd-xs">{projectName || 'Mod'}</span> Part &amp; GameData
          XML.
        </p>
        <p>Existing XML in the folder is never overwritten.</p>
      </Surface>

      <FolderGrant status={folder.status} name={folder.name} />

      <div className="flex flex-col gap-1.5">
        <Button
          size="lg"
          color="brand"
          disabled={folder.status === 'unsupported' || busy}
          onClick={writeToFolder}
        >
          <FolderInput size={22} /> {busy ? 'Exporting...' : 'Export to mods folder'}
        </Button>
        <Button size="lg" variant="transparent" onClick={downloadZip}>
          <Download size={22} /> Download mod zip
        </Button>
      </div>
    </div>
  )
}

/** Folder-grant status row with the appropriate grant / re-grant action. */
function FolderGrant({ status, name }: { status: string; name: string | null }) {
  if (status === 'unsupported') {
    return (
      <Surface
        color="yellow"
        variant="solid-fill"
        className="rounded-lg"
        contentClassName="p-2 text-cladd-xs"
      >
        This browser can't write to folders. Use “Download mod zip” instead.
      </Surface>
    )
  }

  if (status === 'ready') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg px-1 text-cladd-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-cladd-fg-soft">
          <CheckCircle2 size={22} className="shrink-0 text-green-400" />
          <span className="truncate">
            Mods folder: <span className="font-large text-cladd-fg">{name}</span>
          </span>
        </span>
        <Button size="lg" variant="transparent" onClick={() => void pickModFolder()}>
          Change
        </Button>
      </div>
    )
  }

  if (status === 'needs-permission') {
    return (
      <Surface
        color="yellow"
        variant="solid-fill"
        className="rounded-lg"
        contentClassName="flex items-center justify-between gap-2 p-2 text-cladd-xs"
      >
        <span className="truncate">
          Access to “{name}” needs to be re-granted.
        </span>
        <Button size="lg" color="yellow" onClick={() => void requestModFolderPermission()}>
          <FolderSync size={22} /> Re-Grant Folder Access
        </Button>
      </Surface>
    )
  }

  // 'none'
  return (
    <Button size="lg" onClick={() => void pickModFolder()}>
      <FolderInput size={22} /> Choose mods folder...
    </Button>
  )
}
