import { Dialog, DialogHeader, Kbd, keyLabel, Modal, SectionTitle, useIsPhone } from '../kit';
import { HOTKEY_GROUPS, type KeyChord } from './registry';

/**
 * Keyboard-shortcuts help overlay, driven by {@link HOTKEY_GROUPS}. Root-hosted by
 * `DialogRoot` under the dialog id `'help'`; opened by the `?` hotkey, the Help menu or
 * the command palette. Nearly-fullscreen, centered on desktop; edge-to-edge full screen
 * on phones.
 */
export function HelpDialog({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isPhone = useIsPhone();
  const close = () => onOpenChange(false);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      variant={isPhone ? 'cover' : 'fullscreen'}
    >
      <Dialog aria-label="Keyboard shortcuts">
        <DialogHeader title="Keyboard Shortcuts" onClose={close} />
        <div className="grid gap-x-10 gap-y-6 overflow-auto p-4 sm:p-6 md:grid-cols-2">
          {HOTKEY_GROUPS.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <SectionTitle>{group.title}</SectionTitle>
              <div className="overflow-hidden rounded-lg border border-border/60">
                {group.bindings.map((binding) => (
                  <div
                    key={binding.id}
                    className="flex items-center justify-between gap-4 border-b border-border/40 px-3 py-2 last:border-b-0"
                  >
                    <span className="text-sm text-fg">{binding.label}</span>
                    <Chords chords={binding.chords} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="shrink-0 border-t border-border px-4 py-2.5 text-xs text-fg-subtle">
          Shortcuts are disabled while typing in a text field. Press <Kbd>?</Kbd> any time to open
          this panel.
        </p>
      </Dialog>
    </Modal>
  );
}

/** Renders one or more chords as <kbd> chips, alternatives joined by "or". */
function Chords({ chords }: { chords: KeyChord[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {chords.map((chord, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-xs text-fg-subtle">or</span>}
          <span className="flex items-center gap-1">
            {chord.map((token, j) => (
              <Kbd key={j}>{keyLabel(token)}</Kbd>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
