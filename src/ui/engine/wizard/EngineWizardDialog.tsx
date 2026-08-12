import { Button, Dialog, DialogHeader, Modal, noteBox } from '../../kit';

/**
 * **Engine Wizard** — the guided "build me a working engine" flow (plan:
 * `plans/ENGINE_WIZARD_PLAN.md`). ONE dialog hosts all three families (decision D1); the
 * `family` param picks which, and its absence means the first screen is the family chooser.
 *
 * This is the Phase-W0 SHELL: registration, chrome and param parsing only — no wizard
 * behavior yet. Later phases fill the body with the step machine over a pure
 * `wizardModel.ts`, held in dialog-local `useState` (decision D2 — `DialogRoot` mounts only
 * the open dialog, so that state resets per open and needs no nanostore).
 *
 * **Undo enrollment: NONE here.** The finished wizard commits through a single
 * `applyEngineWizard` push in `editorStore` (decision D3); the dialog itself never writes
 * the document.
 */
export type WizardFamily = 'liquid' | 'srb' | 'rcs';
// TEMPORARY: a later phase moves `WizardFamily` to `wizardModel.ts` along with the rest of
// the wizard's types.

const FAMILY_LABELS: Readonly<Record<WizardFamily, string>> = {
  liquid: 'Liquid rocket',
  srb: 'Solid rocket booster',
  rcs: 'RCS thruster',
};

export function EngineWizardDialog({ params, onClose }: { params?: unknown; onClose: () => void }) {
  const family = readFamily(params);
  const title = family ? `Engine Wizard — ${FAMILY_LABELS[family]}` : 'Engine Wizard';

  return (
    <Modal
      isOpen
      onOpenChange={(v) => !v && onClose()}
      isDismissable
      variant="fullscreen"
      className="max-w-2xl"
    >
      <Dialog className="flex h-full min-h-0 flex-col">
        <DialogHeader title={title} onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
          <div className={noteBox}>Engine wizard — coming soon.</div>
        </div>
        <div className="flex shrink-0 justify-end border-t border-border p-3">
          <Button size="md" variant="secondary" onPress={onClose}>
            Cancel
          </Button>
        </div>
      </Dialog>
    </Modal>
  );
}

/**
 * The opaque `openDialog` payload → a family, or `null` for "ask". Defensive because the
 * store never inspects params: any shape can arrive here.
 */
function readFamily(params: unknown): WizardFamily | null {
  if (typeof params !== 'object' || params === null || !('family' in params)) return null;
  const value = (params as { family: unknown }).family;
  return value === 'liquid' || value === 'srb' || value === 'rcs' ? value : null;
}
