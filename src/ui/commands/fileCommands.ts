import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';
import { createProject, uniqueProjectName } from '../../state/projectStore';
import {
  $modFolder,
  forgetModFolder,
  pickModFolder,
  requestModFolderPermission,
} from '../../state/modFolderStore';
import { toast } from '../kit';

/**
 * File menu commands (design: `plans/flexo_v2/design/foundation.md` §3 "File").
 *
 * Thin dispatchers only: each one either opens a root-hosted dialog by `dialogStore` id or
 * calls an existing store mutator that already owns its undo enrollment. Nothing here
 * pushes undo (project/session state is not document state).
 */
export const FILE_COMMANDS: Command[] = [
  {
    id: 'file.new',
    title: 'New Project',
    menuPath: 'File',
    keywords: 'create blank empty workspace',
    // Autosave has already persisted the outgoing project, so this never prompts (v1 parity).
    run: () => createProject(uniqueProjectName()),
  },
  {
    id: 'file.projects',
    title: 'Projects…',
    menuPath: 'File',
    keywords: 'open load manager saved switch',
    run: () => openDialog({ id: 'projects' }),
  },
  {
    id: 'file.renameProject',
    title: 'Rename Project…',
    menuPath: 'File',
    keywords: 'name title',
    run: () => openDialog({ id: 'rename-project' }),
  },
  {
    id: 'file.importProject',
    title: 'Import Project…',
    menuPath: 'File',
    keywords: 'merge paste json load',
    // INTERIM: v1 additive-merge import. The projects phase adds the destination radio
    // (merge vs open-as-new) and .flexo.tar.gz archives behind this same id.
    run: () => openDialog({ id: 'import-project' }),
  },
  {
    id: 'file.exportProject',
    title: 'Export Project…',
    menuPath: 'File',
    keywords: 'save json backup download archive',
    // INTERIM label + payload: becomes "Export Project Archive…" (.tar.gz with binaries,
    // LOCKED #3) in the projects phase, under this same command id.
    run: () => openDialog({ id: 'export-project' }),
  },
  {
    id: 'file.shareLink',
    title: 'Share Link…',
    menuPath: 'File',
    keywords: 'url deep link send',
    run: () => openDialog({ id: 'share-link' }),
  },
  {
    id: 'file.exportKsa',
    title: 'Export to KSA…',
    menuPath: 'File',
    keywords: 'mod xml deliver game install',
    run: () => openDialog({ id: 'export-ksa' }),
  },
  {
    // Not in any menu (foundation §3 File footnote: "No Save item — autosave-only stays").
    // ⌘S is registered purely so the DCC reflex gets an answer instead of the browser's
    // save-page dialog.
    id: 'noop.autosaveFlash',
    title: 'Save',
    keywords: 'autosave save',
    run: () => toast({ title: 'Autosaved ✓' }, { timeout: 1500 }),
  },
];

/**
 * `File ▸ Mods Folder` rows — a dynamic provider rather than static commands because the
 * submenu's SHAPE follows the grant status (foundation §3: "capability-dependent dynamic
 * items … may hide/relabel"): the status row relabels, Re-grant only exists while a stored
 * handle needs permission, Forget only while one is stored, and nothing but the status row
 * exists on a browser without the File System Access API.
 *
 * The command ids are the canonical ones from the plan's command table; minting them here
 * keeps them out of the palette when they are not actionable.
 */
export function modsFolderCommands(): Command[] {
  const { status, name } = $modFolder.get();
  const rows: Command[] = [
    {
      id: 'modsFolder.status',
      title:
        status === 'ready'
          ? `✓ ${name ?? 'Mods folder'}`
          : status === 'needs-permission'
            ? 'Needs re-grant'
            : status === 'unsupported'
              ? 'Not supported by this browser'
              : 'Not set',
      menuPath: 'File ▸ Mods Folder',
      // A read-only info row: always visible, never runnable.
      enabled: () => false,
      run: () => {},
    },
  ];
  if (status === 'unsupported') return rows;
  rows.push({
    id: 'modsFolder.choose',
    title: 'Choose Folder…',
    menuPath: 'File ▸ Mods Folder',
    keywords: 'mods directory grant pick',
    run: () => void pickModFolder(),
  });
  if (status === 'needs-permission') {
    rows.push({
      id: 'modsFolder.regrant',
      title: 'Re-grant Access',
      menuPath: 'File ▸ Mods Folder',
      keywords: 'permission grant mods',
      run: () => void requestModFolderPermission(),
    });
  }
  if (status !== 'none') {
    rows.push({
      id: 'modsFolder.forget',
      title: 'Forget Folder…',
      menuPath: 'File ▸ Mods Folder',
      keywords: 'clear revoke mods',
      // The projects/export phase refines this submenu (and gives it the confirm view);
      // dropping the grant is instantly redoable via Choose Folder…, so it goes straight
      // through for now (§14.3: undoable + tiny ⇒ no confirm).
      run: () => void forgetModFolder(),
    });
  }
  return rows;
}
