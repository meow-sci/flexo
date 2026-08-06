import type { Command } from '../../state/commandStore';
import { openDialog } from '../../state/dialogStore';
import { createProject, flushAutosave } from '../../state/projectStore';
import { $currentProjectId, takeOverLock, uniqueProjectName } from '../../state/projectIndexStore';
import {
  $modFolder,
  modFolderStatusLabel,
  pickModFolder,
  requestModFolderPermission,
} from '../../state/modFolderStore';
import { toast } from '../toast';

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
    run: () => void createProject(uniqueProjectName()),
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
    keywords: 'merge paste json load archive tar.gz',
    // Both containers, one dialog: a `.flexo.tar.gz` (binaries included) or the plain JSON
    // v1 could paste, merged additively as ONE undo step or opened as a new project.
    run: () => openDialog({ id: 'import-project' }),
  },
  {
    id: 'file.exportProject',
    title: 'Export Project Archive…',
    menuPath: 'File',
    keywords: 'save backup download archive tar.gz textures meshes',
    // LOCKED #3: the `.flexo.tar.gz` archive REPLACED v1's JSON snippet, and with it the
    // `hasCustomAssets` gate — the container carries the binaries, so every project exports.
    run: () => openDialog({ id: 'export-archive', params: { projectId: $currentProjectId.get() } }),
  },
  {
    id: 'file.shareLink',
    title: 'Share Link…',
    menuPath: 'File',
    keywords: 'url deep link send',
    // ALWAYS enabled (D10). A project with binary assets cannot be shared as a URL, and the
    // dialog says so and offers the archive — flexo explains, it does not grey out.
    run: () => openDialog({ id: 'share-link', params: { projectId: $currentProjectId.get() } }),
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
    run: () => toast({ title: 'Autosaved ✓' }),
  },
  // ── notification-action targets ────────────────────────────────────────────
  // `notificationStore` rows hold command IDS, never callbacks (that is what keeps the store
  // react-free), so the storage layer's [Retry now] / [Take over] / [Reload] buttons need
  // real commands. None of them belongs in a menu.
  {
    id: 'project.retryAutosave',
    title: 'Retry autosave now',
    keywords: 'save storage quota retry',
    run: () => void flushAutosave(),
  },
  {
    id: 'project.takeOver',
    title: 'Take over autosave for this project',
    keywords: 'lock tab readonly take over',
    run: () => void takeOverLock(),
  },
  {
    id: 'app.reload',
    title: 'Reload flexo',
    keywords: 'refresh reload restart',
    run: () => window.location.reload(),
  },
  {
    // The ONE Reset Everything entry point besides Settings ▸ Advanced itself (design §9.2):
    // the build-mismatch notification's action opens that tab already showing the confirm.
    id: 'app.resetEverything',
    title: 'Reset everything…',
    keywords: 'reset wipe delete everything nuke storage',
    run: () => openDialog({ id: 'settings', params: { tab: 'advanced', confirm: 'reset' } }),
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
  const state = $modFolder.get();
  const { status } = state;
  const rows: Command[] = [
    {
      id: 'modsFolder.status',
      // One spelling of the grant state, shared with the Export dialog's inline row.
      title: modFolderStatusLabel(state),
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
      // Not undoable from flexo's side — the browser grant is gone and only a fresh native
      // picker can restore it — so §14.3 requires a confirm that states the consequence.
      run: () => openDialog({ id: 'forget-mod-folder-confirm' }),
    });
  }
  return rows;
}
