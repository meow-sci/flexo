import { useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { Modal, Dialog, DialogHeader, SectionTitle, useIsPhone } from './kit'
import { $aboutOpen, closeAbout, showAboutOnFirstUse } from '../state/aboutStore'

/**
 * "About" overlay — project blurb, license, source link and asset attribution.
 * Opened from the desktop and mobile overflow menus via the shared {@link $aboutOpen}
 * store. Auto-sized and centered on desktop (the content is short, so it doesn't
 * warrant the fullscreen treatment the shortcuts panel gets); edge-to-edge full
 * screen on phones.
 */
export function AboutDialog() {
  const isPhone = useIsPhone()
  const open = useStore($aboutOpen)

  // First-ever visit: greet the user with the About overlay, then remember it.
  useEffect(() => {
    showAboutOnFirstUse()
  }, [])

  return (
    <Modal
      isOpen={open}
      onOpenChange={(o) => !o && closeAbout()}
      isDismissable
      variant={isPhone ? 'cover' : 'center'}
      className={isPhone ? undefined : 'flex max-h-[85vh] w-full max-w-lg flex-col'}
    >
      <Dialog aria-label="About Flexo">
        <DialogHeader title="About Flexo" onClose={closeAbout} />
        <div className="overflow-auto p-4 sm:p-6">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <SectionTitle>What is Flexo?</SectionTitle>
              <p className="text-sm leading-relaxed text-fg-muted">
                Flexo is a browser-based Part editor and viewer for the game{' '}
                <a
                  href="https://ahwoo.com/app/100000/kitten-space-agency"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Kitten Space Agency
                </a>{' '}
                from RocketWerkz. It renders the game's SubPart meshes and textures in a three.js 3D
                workspace and lets you arrange SubParts into custom Parts using a WYSIWYG
                workflow that needs no modeling, graphics or programming skills.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle>License</SectionTitle>
              <p className="text-sm leading-relaxed text-fg-muted">
                Flexo is open source and released under the{' '}
                <span className="text-fg">MIT License</span>. Copyright © 2026 Alex Sherwin.
                You're free to use, modify and redistribute it, including for commercial
                purposes, provided the copyright notice and permission notice are kept.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle>Asset attribution</SectionTitle>
              <p className="text-sm leading-relaxed text-fg-muted">
                A license for the redistribution of KSA models and textures was generously
                granted by <span className="text-fg">Dean Hall of RocketWerkz</span>. These
                game assets remain the property of their respective owners and are not
                covered by Flexo's MIT license.
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle>Source</SectionTitle>
              <a
                href="https://github.com/meow-sci/flexo"
                target="_blank"
                rel="noreferrer"
                className="group inline-flex w-fit items-center gap-2.5 rounded-lg border border-border/60 bg-panel-sunken px-3 py-2 text-sm text-fg-muted outline-none transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <GitHubIcon className="size-5 shrink-0 fill-accent transition-[filter] duration-200 group-hover:[filter:drop-shadow(0_0_6px_var(--color-accent))_drop-shadow(0_0_2px_var(--color-accent))] group-focus-visible:[filter:drop-shadow(0_0_6px_var(--color-accent))]" />
                <span className="font-mono text-xs">github.com/meow-sci/flexo</span>
              </a>
            </section>
          </div>
        </div>
      </Dialog>
    </Modal>
  )
}

/** GitHub mark. Colour comes from the SVG `fill` (set `fill-accent` via className). */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className}>
      <title>GitHub</title>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}
