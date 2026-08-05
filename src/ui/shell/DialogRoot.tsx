import { useStore } from '@nanostores/react';
import { $openDialog, closeDialog } from '../../state/dialogStore';
import { AboutDialog } from '../AboutDialog';
import { HelpDialog } from '../hotkeys/HelpDialog';
import { LoadProjectDialog, RenameProjectDialog } from '../projects/ProjectDialogs';
import { ExportProjectDialog, ImportProjectDialog } from '../ProjectTransferDialogs';
import { ShareProjectDialog } from '../ShareProjectDialog';
import { ExportDialog } from '../ExportDialog';
import { PartDataDialog } from '../PartDataDialog';
import { SettingsDialog, type SettingsDialogParams } from '../SettingsDialog';
import { ScaleEverythingDialog } from '../ScaleEverythingDialog';
import { SubPartPopup } from '../SubPartBrowser';
import { PartPopup } from '../PartBrowser';
import { CustomAssetsModal } from '../CustomAssetsModal';
import { CustomTextureDialog } from '../CustomTextureDialog';
import { CreateMeshDialog } from '../CreateMeshDialog';
import { MaterialDialog } from '../MaterialDialog';

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
    case 'part-data':
      return <PartDataDialog isOpen onOpenChange={dismiss} />;
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
      return <SubPartPopup open onOpenChange={dismiss} />;
    case 'part-browser':
      return <PartPopup open onOpenChange={dismiss} />;
    case 'custom-assets':
      return <CustomAssetsModal isOpen onOpenChange={dismiss} />;
    // These three self-close via `onClose` rather than react-aria's `onOpenChange`.
    case 'upload-texture':
      return <CustomTextureDialog onClose={closeDialog} />;
    case 'create-mesh':
      return <CreateMeshDialog onClose={closeDialog} />;
    case 'material':
      return <MaterialDialog onClose={closeDialog} />;
    case 'help':
      return <HelpDialog isOpen onOpenChange={dismiss} />;
    case 'about':
      return <AboutDialog isOpen onOpenChange={dismiss} />;
    // Hosts are added here as each dialog is rehosted onto dialogStore.
    default:
      return null;
  }
}

/** react-aria's `onOpenChange` contract → `closeDialog()`. Escape-ladder rung 2. */
function dismiss(open: boolean): void {
  if (!open) closeDialog();
}
