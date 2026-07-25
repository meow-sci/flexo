import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Modal, Dialog, DialogHeader, Button, warningBox } from './kit'
import { $part } from '../state/editorStore'
import { $projectName } from '../state/projectStore'
import { hasCustomAssets } from '../state/projectTransfer'
import { createShareLink } from '../state/projectShareLink'

/**
 * "Share Project" dialog — generates a single, stateless deep link that encodes the
 * ENTIRE project (compact JSON → Zstd → URL-safe Base64; see projectShareLink.ts).
 * Anyone who opens the link gets the project as a new local project — no server,
 * no account. Disabled when the project has uploaded textures / primitive meshes / imported models
 * (their binaries can't ride in a URL), mirroring the JSON export gate.
 */
export function ShareProjectDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const part = useStore($part)
  const name = useStore($projectName)
  const blocked = hasCustomAssets(part)

  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const close = (open: boolean) => {
    if (!open) {
      // Reset so the next open regenerates against the latest project state.
      setLink(null)
      setError(null)
      setCopied(false)
    }
    onOpenChange(open)
  }

  const generate = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setLink(await createShareLink(part, name))
    } catch (err) {
      setError(`Could not build link: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.warn('clipboard write failed', err)
    }
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
        <DialogHeader title="Share Project" onClose={() => close(false)} />
        <div className="flex flex-col gap-3 overflow-auto p-3">
          {blocked ? (
            <div className={warningBox}>
              Sharing is disabled because this project has uploaded textures, custom (primitive)
              meshes, or imported models — their binaries can’t be carried in a link. Remove them to
              share, or use the KSA part-mod export. (Kitten meshes share fine.)
            </div>
          ) : (
            <>
              <p className="text-xs text-fg-subtle">
                Generate a self-contained link to this project. Anyone who opens it gets a copy as a
                new project — no server, nothing saved online. The whole project (meshes, layers,
                connectors, kittens, kitten meshes, animations, and GameData) is compressed into the
                link itself; uploaded textures, primitive meshes and imported models are not
                included.
              </p>

              {link == null ? (
                <div className="flex justify-end">
                  <Button size="sm" variant="primary" isDisabled={busy} onPress={generate}>
                    {busy ? 'Generating…' : 'Generate link'}
                  </Button>
                </div>
              ) : (
                <>
                  <pre className="max-h-48 overflow-auto rounded-md border border-border bg-panel-sunken p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-fg">
                    {link}
                  </pre>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-fg-subtle">
                      {link.length.toLocaleString()} characters
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" isDisabled={busy} onPress={generate}>
                        Regenerate
                      </Button>
                      <Button size="sm" variant="primary" onPress={copy}>
                        {copied ? 'Copied!' : 'Copy link'}
                      </Button>
                    </div>
                  </div>
                  {link.length > 8000 && (
                    <p className="text-xs text-warning">
                      This link is long — some browsers and chat apps truncate URLs past a few
                      thousand characters. If it doesn’t open, use Export instead.
                    </p>
                  )}
                </>
              )}

              {error && <div className={warningBox}>{error}</div>}
            </>
          )}
        </div>
      </Dialog>
    </Modal>
  )
}
