import { atom } from 'nanostores';
import { persistentJSON } from '@nanostores/persistent';

/**
 * The command registry — the SINGLE dataset behind the menubar, the phone MenuSheet, the
 * ⌘K palette, the hotkey registry's chord chips and the Help dialog (design:
 * `plans/flexo_v2/design/foundation.md` §4; Law 4 "menus are data"). Commands are the ONLY
 * way a feature exposes an action to the shell: nothing in the shell reaches into a
 * feature's store directly.
 *
 * **Layering (constitution).** Zero react / three imports — this module holds plain
 * objects and atoms. The command *definitions* live in `src/ui/commands/*.ts` (the ONE
 * canonical command-module path — never a parallel `src/commands/` tree) and register
 * themselves into this registry at module scope, so UI-layer imports stay in the UI layer.
 *
 * **Undo enrollment: NONE.** A command is a thin dispatcher to an existing mutator which
 * already owns its `pushUndo` (see the undo invariant block in `editorStore.ts`); the
 * registry's own state (registrations, palette open/recents) is never undoable
 * (foundation §13: "mode/layout/status/notifications/windows never create undo steps").
 *
 * **Persistence**: exactly one key, `flexo:paletteRecents`. Nothing else here persists.
 *
 * ## Adding a command (the rules a later phase must follow)
 *
 * 1. Put it in the right `src/ui/commands/<menu>Commands.ts` module and register it from
 *    `src/ui/commands/index.ts`'s module-scope side effect.
 * 2. Ids are CANONICAL once published: {@link registerCommand} THROWS on a duplicate id.
 *    To change a command's behavior in a later phase, RE-POINT its `run`/`enabled`/
 *    `checked` where it is defined — never register a second command with the same id.
 * 3. Anything list-shaped (layers, seats, projects, history rows…) is a dynamic provider,
 *    not N static registrations — see {@link registerCommandProvider}.
 */

/**
 * A command id. Deliberately an open `string` rather than a union: the static ids are a
 * fixed, canonical set (`'edit.undo'`, `'file.exportKsa'`, …) but dynamic providers mint
 * ids at runtime from document data with a stable prefix (`'layer:activate:<layerId>'`,
 * `'history:jump:<steps>'`), which no union could enumerate.
 */
export type CommandId = string;

export interface Command {
  /** e.g. `'edit.undo'`, or a provider's prefixed id `'layer:activate:<layerId>'`. */
  id: CommandId;
  /** Menu / palette label. Dynamic providers recompute it on every evaluation. */
  title: string;
  /** Palette subtitle + fuzzy-match text, e.g. `'File'` or `'View ▸ Camera Snap'`. */
  menuPath?: string;
  /** Extra fuzzy-match terms (design: design-system-services.md §3.3). */
  keywords?: string;
  /** Store selector, evaluated on menu open / palette render. Absent ⇒ always enabled. */
  enabled?: () => boolean;
  /**
   * Why this command is unavailable, for the menu item's tooltip and the palette's
   * grayed-row reason. Set on the "visible but not implementable yet" stubs (foundation §3
   * keeps them VISIBLE for discoverability) and on any command whose disabled state is not
   * self-evident. A later phase clears it when it re-points the command's `run`.
   */
  disabledReason?: string;
  /** ✓ / ◉ state for View-menu-style items, evaluated at the same moments as `enabled`. */
  checked?: () => boolean;
  /** Palette ⌘↩ "run and keep the palette open" eligibility (design §3.4). */
  keepOpen?: boolean;
  run: (params?: unknown) => void;
}

const commands = new Map<CommandId, Command>();
const providers = new Map<string, () => Command[]>();

/**
 * Registers one command. THROWS on a duplicate id — registration happens once at module
 * scope, so a collision is a programming error (and the throw is what forces later phases
 * to re-point an existing command instead of shadowing it).
 */
export function registerCommand(cmd: Command): void {
  if (commands.has(cmd.id)) {
    throw new Error(`commandStore: duplicate command id "${cmd.id}"`);
  }
  commands.set(cmd.id, cmd);
}

export function registerCommands(cmds: readonly Command[]): void {
  for (const cmd of cmds) registerCommand(cmd);
}

/**
 * Looks a command up by id: static registrations first, then every dynamic provider (so
 * `runCommand('layer:select:<id>')` and the palette's recents resolution work uniformly
 * for factory-generated rows). Unknown ⇒ `undefined`.
 */
export function getCommand(id: CommandId): Command | undefined {
  const command = commands.get(id);
  if (command) return command;
  for (const provider of providers.values()) {
    const match = provider().find((c) => c.id === id);
    if (match) return match;
  }
  return undefined;
}

/** Every STATIC command, in registration order. Dynamic rows: {@link allDynamicCommands}. */
export function allCommands(): Command[] {
  return [...commands.values()];
}

/**
 * Registers a dynamic provider — a factory of commands generated from live document/store
 * data, re-evaluated on menu open and on every palette keystroke (design: foundation §4
 * "Dynamic providers"). Providers MUST therefore be cheap, and MUST return stable
 * prefixed ids (`'layer:activate:<layerId>'`) so palette recents can resolve them later.
 *
 * Provider ids used in Phase 2: `'history'`, `'layers.select'`, `'layers.activate'`,
 * `'seats'`, `'customMeshInstances'`, `'projects'`, `'aids.measurements'`,
 * `'aids.containers'` (the last two interim until the Outliner's Aids section).
 *
 * Throws on a duplicate id, for the same reason {@link registerCommand} does.
 */
export function registerCommandProvider(id: string, fn: () => Command[]): void {
  if (providers.has(id)) {
    throw new Error(`commandStore: duplicate command provider id "${id}"`);
  }
  providers.set(id, fn);
}

/** The provider's current rows, freshly evaluated. `[]` for an unknown provider id. */
export function providerCommands(id: string): Command[] {
  return providers.get(id)?.() ?? [];
}

/** Every provider's current rows concatenated, in provider-registration order. */
export function allDynamicCommands(): Command[] {
  return [...providers.values()].flatMap((provider) => provider());
}

/**
 * Runs a command by id — the one entry point the menubar, MenuSheet, palette and hotkey
 * registry all use. Returns whether it ran: an unknown id or a command whose `enabled()`
 * returns false is a no-op returning `false` (the palette renders that as its no-op
 * flash). Palette recents are NOT recorded here — the palette calls
 * {@link recordRecent} itself, so menu/hotkey invocations don't pollute the list.
 */
export function runCommand(id: CommandId, params?: unknown): boolean {
  const command = getCommand(id);
  if (!command) return false;
  if (command.enabled?.() === false) return false;
  command.run(params);
  return true;
}

/** Whether the ⌘K command palette is showing. Ephemeral (design §3.6). */
export const $paletteOpen = atom(false);

export function openPalette(): void {
  $paletteOpen.set(true);
}

export function closePalette(): void {
  $paletteOpen.set(false);
}

/** Recents cap — the palette's empty-query "Recent" section (design §3.4). */
export const PALETTE_RECENTS_MAX = 8;

/** Most-recently-run command ids, newest first. */
export const $paletteRecents = persistentJSON<CommandId[]>('flexo:paletteRecents', []);

/**
 * Records a successful palette run: MRU order, deduped, capped at
 * {@link PALETTE_RECENTS_MAX}. Ids that no longer resolve (a deleted layer's dynamic
 * command) are kept here and skipped at render time by the palette.
 */
export function recordRecent(id: CommandId): void {
  const stored = $paletteRecents.get();
  const previous = Array.isArray(stored) ? stored : [];
  $paletteRecents.set(
    [id, ...previous.filter((existing) => existing !== id)].slice(0, PALETTE_RECENTS_MAX),
  );
}
