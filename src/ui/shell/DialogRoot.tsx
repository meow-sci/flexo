import { useStore } from '@nanostores/react';
import { $openDialog, closeDialog } from '../../state/dialogStore';
import { AboutDialog } from '../AboutDialog';
import { HelpDialog } from '../hotkeys/HelpDialog';
import { LoadProjectDialog, RenameProjectDialog } from '../projects/ProjectDialogs';
import { ExportProjectDialog, ImportProjectDialog } from '../ProjectTransferDialogs';
import { ShareProjectDialog } from '../ShareProjectDialog';
import { ExportDialog } from '../ExportDialog';
import { SettingsDialog, type SettingsDialogParams } from '../SettingsDialog';
import { ScaleEverythingDialog } from '../ScaleEverythingDialog';
import { SubPartBrowserDialog } from '../build/SubPartBrowserDialog';
import { PartBrowserDialog } from '../build/PartBrowserDialog';
import { CustomAssetsModal } from '../CustomAssetsModal';
import { CustomTextureDialog } from '../CustomTextureDialog';
import { CreateMeshDialog } from '../CreateMeshDialog';
import { MaterialDialog, type MaterialDialogParams } from '../MaterialDialog';
import { GlowPaintDialog } from '../GlowPaintDialog';
import { setMeshMaterial } from '../../state/customAssetStore';
import { ConfirmDialog } from '../kit';
import {
  discardChainAndRestart,
  discardChainSession,
  keepChainInBuild,
} from '../chain/openChainPalette';

/**
 * The single mount point for every overlay dialog (design:
 * `plans/flexo_v2/design/foundation.md` §10.1). Mounted once in `src/app.tsx` for desktop
 * AND phone; dialogs portal to `document.body`, so its position in the tree is irrelevant.
 *
 * Only the dialog named by `dialogStore.$openDialog` is rendered — everything else is
 * unmounted. That is load-bearing twice over: the catalog browsers get their
 * "fresh session on open" semantics for free (their body state dies with the unmount),
 * and no dialog pays render cost while closed.
 *
 * ## Adding a dialog (the whole checklist)
 *
 * 1. Add its id to `DialogId` in `src/state/dialogStore.ts`.
 * 2. Add a `case` below rendering the dialog component with:
 *    `isOpen onOpenChange={(v) => { if (!v) closeDialog(); }}`
 *    — the `onOpenChange` is what keeps react-aria's own dismissal (Escape, backdrop
 *    click) working unchanged, which is Escape-ladder rung 2 (design:
 *    design-system-services.md §4.6). A dialog whose API is `onClose` instead gets
 *    `onClose={closeDialog}`.
 * 3. Open it from a command with `openDialog({id: '<id>'})` — never from local button
 *    state, and never nest one dialog inside another (use the kit `DialogViewStack` or
 *    `InlineConfirmStrip` instead).
 *
 * `open.params` is passed straight through to the host that understands it.
 */
export function DialogRoot() {
  const open = useStore($openDialog);
  if (!open) return null;
  switch (open.id) {
    case 'projects':
      return <LoadProjectDialog isOpen onOpenChange={dismiss} />;
    case 'rename-project':
      return <RenameProjectDialog isOpen onOpenChange={dismiss} />;
    case 'share-link':
      return <ShareProjectDialog isOpen onOpenChange={dismiss} />;
    case 'export-project':
      return <ExportProjectDialog isOpen onOpenChange={dismiss} />;
    case 'import-project':
      return <ImportProjectDialog isOpen onOpenChange={dismiss} />;
    case 'export-ksa':
      return <ExportDialog isOpen onOpenChange={dismiss} />;
    case 'settings':
      return (
        <SettingsDialog
          isOpen
          onOpenChange={dismiss}
          params={open.params as SettingsDialogParams | undefined}
        />
      );
    case 'scale-everything':
      return <ScaleEverythingDialog isOpen onOpenChange={dismiss} />;
    // Both browsers restart their session (search, splits, selection) on every open —
    // that comes free from being unmounted while closed.
    case 'subpart-browser':
      return <SubPartBrowserDialog open onOpenChange={dismiss} />;
    case 'part-browser':
      return <PartBrowserDialog open onOpenChange={dismiss} />;
    case 'custom-assets':
      return <CustomAssetsModal isOpen onOpenChange={dismiss} />;
    // These three self-close via `onClose` rather than react-aria's `onOpenChange`.
    case 'upload-texture':
      return <CustomTextureDialog onClose={closeDialog} />;
    case 'create-mesh':
      return <CreateMeshDialog onClose={closeDialog} />;
    case 'material': {
      const params = open.params as MaterialDialogParams | undefined;
      return (
        <MaterialDialog
          materialId={params?.materialId}
          onClose={closeDialog}
          onCreated={
            params?.assignToMeshId
              ? (mat) => void setMeshMaterial(params.assignToMeshId!, mat.id)
              : undefined
          }
        />
      );
    }
    // The glow painter (design-surface-assets.md §1.6). Its OWN Cancel path runs the
    // dirty-discard confirm; `onClose` is only ever called once that has been answered.
    case 'glow-paint': {
      const params = open.params as { meshId?: string } | undefined;
      if (!params?.meshId) return null;
      return <GlowPaintDialog meshId={params.meshId} onClose={closeDialog} />;
    }
    case 'help':
      return <HelpDialog isOpen onOpenChange={dismiss} />;
    case 'about':
      return <AboutDialog isOpen onOpenChange={dismiss} />;
    // A chain session with steps is never discarded silently (LOCKED — DECISIONS.md #7;
    // design-build-mode.md §9.1/§9.2). ConfirmDialog is blessed here because this IS the
    // top-level confirm — the chain window is non-modal, not a dialog.
    //
    // Three flavours, one dialog, distinguished by the params the raiser passes:
    //  · re-invoke (⇧⌘K over an open session) — discard and RE-SEED from the selection;
    //  · cancel (✕ / footer Cancel / Esc rung 6) — discard and open nothing;
    //  · leaving Build — discard and stay in the new mode, or decline and go back to Build,
    //    because a session may only exist in Build (foundation §2.6).
    case 'chain-discard-confirm': {
      const params = chainConfirm(open.params);
      return (
        <ConfirmDialog
          isOpen
          onOpenChange={dismiss}
          title={`Discard chain (${params.steps} steps)?`}
          text={
            params.leavingBuild
              ? 'Action chains live in Build mode. The chain has unapplied steps — discard them, or cancel to stay in Build.'
              : params.close
                ? 'The chain has unapplied steps. Discarding closes the chain; nothing in the document changes.'
                : 'The chain has unapplied steps. Discarding starts a fresh chain over the current selection.'
          }
          confirmLabel="Discard"
          confirmVariant="danger"
          onConfirm={() => {
            if (params.close) discardChainSession();
            else discardChainAndRestart();
            closeDialog();
          }}
          onCancel={params.leavingBuild ? keepChainInBuild : undefined}
        />
      );
    }
    // Hosts are added here as each dialog is rehosted onto dialogStore.
    default:
      return null;
  }
}

/** The `'chain-discard-confirm'` params, defaulted to the re-invoke flavour. */
function chainConfirm(params: unknown): { steps: number; close: boolean; leavingBuild: boolean } {
  const raw = params as { steps?: number; close?: boolean; leavingBuild?: boolean } | undefined;
  return {
    steps: raw?.steps ?? 0,
    close: raw?.close === true,
    leavingBuild: raw?.leavingBuild === true,
  };
}

/** react-aria's `onOpenChange` contract → `closeDialog()`. Escape-ladder rung 2. */
function dismiss(open: boolean): void {
  if (!open) closeDialog();
}
