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
} from '@cladd-ui/react'
import { $part } from '../state/editorStore'
import { serializeGameData, serializePart } from '../ksa/partXmlSerializer'

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
 * Top-surface "Export" action: serializes the current Part to KSA XML and shows
 * it in a Popup with a Part / GameData tab switcher and copy-to-clipboard (plus
 * pre-export warnings). The Part doc holds geometry + connector transforms; the
 * GameData doc holds connector connection Flags.
 */
export function ExportButton() {
  const part = useStore($part)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('part')
  const [copied, setCopied] = useState(false)

  const partXml = useMemo(() => (open ? serializePart(part) : ''), [open, part])
  const gameDataXml = useMemo(() => (open ? serializeGameData(part) : ''), [open, part])
  const xml = tab === 'part' ? partXml : gameDataXml

  const warnings = useMemo(
    () => validate(part.partId, part.placements.map((p) => p.instanceId)),
    [part],
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
    <>
      <ToolbarButton onClick={() => setOpen(true)}>Export</ToolbarButton>
      <Popup
        open={open}
        onOpenChange={setOpen}
        contentClassName="max-w-2xl"
        headerLeft={<span className="px-2 pb-1 text-cladd-sm font-semibold">Export XML</span>}
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
        </PopupContent>
      </Popup>
    </>
  )
}
