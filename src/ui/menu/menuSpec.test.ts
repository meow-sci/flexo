import { describe, it, expect } from 'vitest';
import { MENU_SPEC, type MenuEntry, type TopMenu } from './menuSpec';
import { allCommands, allDynamicCommands, getCommand } from '../../state/commandStore';
import { COMMAND_PROVIDERS } from '../commands/providers';
import { chordsFor } from '../commands/chords';
// Side-effect import: registering every command IS importing this module.
import '../commands';

/**
 * The transcription guard for the menubar (design: FINAL_DESIGN_INDEX.md "Consolidated
 * menubar tree" — authoritative). The expected label lists below are hand-copied from that
 * tree plus the interim/stub items the plan documents; drifting from either fails here
 * rather than at review time.
 *
 * Line format: submenus end in ` ▸` and their entries are indented two spaces per level,
 * separators are `─`, and provider rows (runtime data) are `{provider:<id>}`.
 */
function lines(entries: MenuEntry[], depth = 0): string[] {
  const pad = '  '.repeat(depth);
  return entries.flatMap((entry): string[] => {
    switch (entry.kind) {
      case 'separator':
        return [`${pad}─`];
      case 'provider':
        return [`${pad}{provider:${entry.providerId}}`];
      case 'submenu':
        return [`${pad}${entry.label} ▸`, ...lines(entry.entries, depth + 1)];
      default:
        return [`${pad}${getCommand(entry.commandId)?.title ?? `?? ${entry.commandId}`}`];
    }
  });
}

function menu(id: string): TopMenu {
  const found = MENU_SPEC.find((m) => m.id === id);
  if (!found) throw new Error(`no such menu: ${id}`);
  return found;
}

function everyEntry(entries: MenuEntry[]): MenuEntry[] {
  return entries.flatMap((entry) =>
    entry.kind === 'submenu' ? [entry, ...everyEntry(entry.entries)] : [entry],
  );
}

const ALL_ENTRIES = MENU_SPEC.flatMap((m) => everyEntry(m.entries));

describe('MENU_SPEC structure', () => {
  it('is exactly the eight top-level menus, in bar order', () => {
    expect(MENU_SPEC.map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'Add',
      'Select',
      'View',
      'Tools',
      'Window',
      'Help',
    ]);
  });

  it('references only commands that resolve in the registry', () => {
    const unresolved = ALL_ENTRIES.filter(
      (e) => e.kind !== 'separator' && e.kind !== 'submenu' && e.kind !== 'provider',
    )
      .map((e) => (e as { commandId: string }).commandId)
      .filter((id) => getCommand(id) === undefined);
    expect(unresolved).toEqual([]);
  });

  it('references only providers that are registered', () => {
    const known = new Set(COMMAND_PROVIDERS.map((p) => p.id));
    const unknown = ALL_ENTRIES.filter((e) => e.kind === 'provider')
      .map((e) => (e as { providerId: string }).providerId)
      .filter((id) => !known.has(id));
    expect(unknown).toEqual([]);
  });

  it('never references the same command or submenu id twice', () => {
    const commandIds = ALL_ENTRIES.filter(
      (e) => e.kind !== 'separator' && e.kind !== 'submenu' && e.kind !== 'provider',
    ).map((e) => (e as { commandId: string }).commandId);
    expect(new Set(commandIds).size).toBe(commandIds.length);

    const ids = [
      ...MENU_SPEC.map((m) => m.id),
      ...ALL_ENTRIES.filter((e) => e.kind === 'submenu').map((e) => (e as { id: string }).id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mints unique command ids across static registrations and every provider', () => {
    // Static ids can't collide (registerCommand throws), but a provider could shadow one
    // by minting the same id — and `getCommand` prefers the static command, so the
    // provider row would silently do nothing.
    const ids = [...allCommands(), ...allDynamicCommands()].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('chord lookup (one source of truth for menu chips, palette rows and Help)', () => {
  it.each([
    ['edit.undo', [['mod', 'Z']]],
    ['palette.open', [['mod', 'K']]],
    ['chain.begin', [['mod', 'shift', 'K']]],
    ['file.exportKsa', [['mod', 'E']]],
    ['window.assetManager', [['mod', 'shift', 'A']]],
    ['help.shortcuts', [['?']]],
    // Viewport-scoped bindings from the P4.08 wave — they resolve through the same lookup.
    ['select.all', [['mod', 'A']]],
    ['view.frameSelection', [['F']]],
    ['tool.measure', [['M']]],
  ])('%s resolves to its registry binding', (id, chords) => {
    expect(chordsFor(id)).toEqual(chords);
  });

  it('returns null for a command with no binding', () => {
    // Reset Camera is menu + palette only — the design gives it no chord (LOCKED #7).
    expect(chordsFor('view.resetCamera')).toBeNull();
  });
});

describe('menu transcription (authoritative tree)', () => {
  it('File', () => {
    expect(lines(menu('file').entries)).toEqual([
      'New Project',
      'Projects…',
      'Rename Project…',
      '─',
      'Import Project…',
      // Interim label: becomes "Export Project Archive…" with the projects phase.
      'Export Project…',
      'Share Link…',
      '─',
      'Export to KSA…',
      'Mods Folder ▸',
      '  {provider:modsFolder}',
    ]);
  });

  it('Edit', () => {
    expect(lines(menu('edit').entries)).toEqual([
      'Undo',
      'Redo',
      'History ▸',
      '  {provider:history}',
      '─',
      'Cut',
      'Copy',
      'Paste',
      'Duplicate',
      'Delete',
      '─',
      'Begin Action Chain…',
      'Scale Everything…',
      '─',
      'Settings…',
    ]);
  });

  it('Add', () => {
    expect(lines(menu('add').entries)).toEqual([
      'SubPart…',
      'Built-in Part…',
      '─',
      'Connector',
      'Collider ▸',
      '  Cylinder',
      '  Box',
      '  Sphere',
      '  Capsule',
      '  ─',
      '  Fit to Selection ▸',
      '    Cylinder',
      '    Box',
      '    Sphere',
      '    Capsule',
      'IVA Seat',
      'Light ▸',
      '  Spot',
      '  Point',
      'Kitten ▸',
      '  Hunter',
      '  Polaris',
      '  Banjo',
      '─',
      'Primitive Mesh…',
      'Import Model…',
      'Custom Mesh Instances ▸',
      '  {provider:customMeshInstances}',
      'Upload Texture…',
      'New Material…',
      '─',
      'Make Kitten Mesh ▸',
      '  Hunter',
      '  Polaris',
      '  Banjo',
      '─',
      'Define Engine…',
    ]);
  });

  it('Select', () => {
    expect(lines(menu('select').entries)).toEqual([
      'All',
      'Deselect',
      'Invert',
      'All in Active Layer',
      'By Layer ▸',
      '  {provider:layers.select}',
      '─',
      'Box Select',
    ]);
  });

  it('View', () => {
    expect(lines(menu('view').entries)).toEqual([
      'Frame Selection',
      'Reset Camera',
      'Camera Snap ▸',
      '  Front',
      '  Back',
      '  Left',
      '  Right',
      '  Top',
      '  Bottom',
      '─',
      'Grids ▸',
      '  Floor (XZ)',
      '  XY',
      '  YZ',
      '  ─',
      '  Grid Settings…',
      'Hide Interior',
      'Environment ▸',
      '  Studio',
      '  Partly Cloudy',
      '  Evening Road',
      '  Autumn Field',
      '  Adams Bridge',
      '  Aristea Wreck',
      '  Pretoria Gardens',
      '  Glasshouse Interior',
      '  Blue Lagoon Night',
      'Show Sky Background',
      'Scene Lighting…',
      'Light Coverage ▸',
      '  Selected',
      '  All',
      '  Off',
      'Live Light Preview',
      '─',
      'Display Filters ▸',
      '  Connectors',
      '  Colliders',
      '  IVA Seats',
      '  Lights',
      '  Kittens',
      '  Measurement Aids',
      'Motion Trails',
      '─',
      'Measurement Overlays ▸',
      '  Bounding Box',
      '  World',
      '  Oriented',
      '  Per-mesh Dimensions',
      '  Distance Between Two',
      'Units ▸',
      '  m',
      '  cm',
      '  mm',
      '─',
      'FPS Counter',
    ]);
  });

  it('Tools', () => {
    expect(lines(menu('tools').entries)).toEqual([
      'Measure Point-to-Point',
      'Add Reference Line',
      'Add Reference Container ▸',
      '  Box',
      '  Cylinder',
      '  Sphere',
      '─',
      'Collider Coverage Check',
      'Sit in Seat ▸',
      '  {provider:seats}',
      '  ─',
      '  Exit Seat View',
      // INTERIM (not in the authoritative tree) until the Outliner's Aids section.
      '─',
      'Measurements ▸',
      '  {provider:aids.measurements}',
      'Containers ▸',
      '  {provider:aids.containers}',
      '  ─',
      '  Accurate Warn Check',
    ]);
  });

  it('Window', () => {
    expect(lines(menu('window').entries)).toEqual([
      'Left Sidebar',
      'Right Sidebar',
      'Timeline',
      'Tool Bar',
      'Reset Window Layout',
      '─',
      'Asset Manager…',
      'Notifications…',
    ]);
  });

  it('Help', () => {
    expect(lines(menu('help').entries)).toEqual([
      'Search Commands…',
      'Keyboard Shortcuts…',
      '─',
      'About flexo…',
      'flexo on GitHub',
    ]);
  });
});

describe('disabled stubs stay visible but never run', () => {
  /** Every command the plan marks [stub] — visible, disabled, owned by a later phase. */
  const STUBS = [
    // `view.frameSelection` / `view.resetCamera` graduated out of this list: the camera
    // phase gave them real targets (`frameCamera()` / `resetCamera()`). `tool.marquee`
    // graduated with the Build-mode selection phase: it arms the real box-select tool.
    // `view.displayFilters` graduated too: it is now a SUBMENU of six live per-kind
    // checkboxes (`view.displayFilter:*`) driving `$kindVisibility` — see its own test below.
    'view.motionTrails',
    'window.timeline',
    // `window.toolbar` graduated with the Build-mode Tool bar: it now toggles the floating
    // window's `floatHidden` entry — see its own test below.
    // `window.notifications` graduated out of this list: the status-bar phase gave it a
    // real target (it opens the notification center) — see its own test below.
  ];

  it.each(STUBS)('%s is disabled and explains why', (id) => {
    const cmd = getCommand(id);
    expect(cmd).toBeDefined();
    expect(cmd?.enabled?.()).toBe(false);
    expect(cmd?.disabledReason).toBeTruthy();
  });

  it('keeps every stub reachable from a menu (disabled items stay visible)', () => {
    const referenced = new Set(
      ALL_ENTRIES.filter(
        (e) => e.kind !== 'separator' && e.kind !== 'submenu' && e.kind !== 'provider',
      ).map((e) => (e as { commandId: string }).commandId),
    );
    for (const id of STUBS) expect(referenced.has(id)).toBe(true);
  });

  it('View ▸ Display Filters rows are live and toggle their kind', () => {
    for (const kind of ['connector', 'collider', 'ivaSeat', 'light', 'kitten', 'aid']) {
      const command = getCommand(`view.displayFilter:${kind}`);
      expect(command?.enabled?.()).not.toBe(false);
      expect(command?.disabledReason).toBeUndefined();

      const wasChecked = command?.checked?.();
      command?.run(undefined);
      expect(command?.checked?.()).toBe(!wasChecked);
      command?.run(undefined); // back to default (all kinds visible)
    }
  });

  it('window.notifications is live (the notification center exists) and still in a menu', () => {
    const command = getCommand('window.notifications');
    expect(command?.enabled?.()).not.toBe(false);
    expect(command?.disabledReason).toBeUndefined();

    const referenced = ALL_ENTRIES.filter((e) => e.kind === 'command').map(
      (e) => (e as { commandId: string }).commandId,
    );
    expect(referenced).toContain('window.notifications');
  });

  it('window.toolbar is live (the floating Tool bar exists) and toggles its visibility', () => {
    const command = getCommand('window.toolbar');
    expect(command?.enabled?.()).not.toBe(false);
    expect(command?.disabledReason).toBeUndefined();

    // Checked ⇔ not in `floatHidden`, and running it flips exactly that.
    const wasChecked = command?.checked?.();
    command?.run(undefined);
    expect(command?.checked?.()).toBe(!wasChecked);
    command?.run(undefined);
    expect(command?.checked?.()).toBe(wasChecked);

    // It is a CHECKBOX entry — the ✓ is the window's visibility.
    const referenced = ALL_ENTRIES.filter((e) => e.kind === 'checkbox').map(
      (e) => (e as { commandId: string }).commandId,
    );
    expect(referenced).toContain('window.toolbar');
  });
});

describe('palette-only commands', () => {
  /**
   * Part Data has no home in the authoritative tree (Data mode replaces the dialog), and
   * its v1 toolbar button is gone — the palette IS its entry point until then. If this ever
   * gains a MENU_SPEC entry, that is a tree change and belongs in the transcription lists
   * above, not here.
   */
  it('data.partData is registered, titled and absent from the menu tree', () => {
    const command = getCommand('data.partData');
    expect(command?.title).toBe('Part Data…');
    expect(command?.menuPath).toBeUndefined();

    const referenced = ALL_ENTRIES.filter((e) => e.kind === 'command').map(
      (e) => (e as { commandId: string }).commandId,
    );
    expect(referenced).not.toContain('data.partData');
  });
});

describe('mode commands', () => {
  it('registers all five, every one of them switchable', () => {
    // All five modes exist now; Data and Surface show interim placeholder sidebars until
    // their own phases build the real primaries, so nothing is disabled any more.
    for (const id of ['mode.build', 'mode.animation', 'mode.data', 'mode.engine', 'mode.surface']) {
      const command = getCommand(id);
      expect(command).toBeDefined();
      expect(command?.enabled?.() ?? true).toBe(true);
    }
  });

  it('is not part of the menu tree (the switcher and palette render them)', () => {
    const referenced = ALL_ENTRIES.filter((e) => e.kind === 'command').map(
      (e) => (e as { commandId: string }).commandId,
    );
    expect(referenced.some((id) => id.startsWith('mode.'))).toBe(false);
  });
});
