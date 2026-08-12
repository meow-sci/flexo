import { describe, it, expect } from 'vitest';
import { MENU_SPEC, type MenuEntry, type TopMenu } from './menuSpec';
import { allCommands, allDynamicCommands, getCommand } from '../../state/commandStore';
import { COMMAND_PROVIDERS } from '../commands/providers';
import { chordsFor } from '../commands/chords';
import { $mode } from '../../state/modeStore';
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
      'Export Project Archive…',
      'Share Link…',
      '─',
      'New Part',
      'Switch Part ▸',
      '  {provider:parts}',
      'Rename Part…',
      'Duplicate Part',
      'Delete Part…',
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
      'Engine Wizard…',
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
      'Motion Trails ▸',
      '  Selected Joint',
      '  All Joints',
      '  Off',
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

describe('every menu row is live — the stub list is empty', () => {
  /**
   * There are no `[stub]` commands left. `view.motionTrails` was the last one and graduated
   * in P11D.05: it is now a SUBMENU of three live radios (`view.motionTrails:*`) driving
   * `$animTrails` and the `TrajectoryLayer` — see its own test below. (`view.frameSelection`
   * / `view.resetCamera` graduated with the camera phase, `tool.marquee` with Build-mode
   * selection, `view.displayFilters` into six per-kind checkboxes, `window.timeline` with the
   * timeline dock, `window.toolbar` with the Tool bar, `window.notifications` with the status
   * bar.) A future stub goes back here WITH its disabled-and-explains-why test.
   */
  it('references no unknown command ids', () => {
    for (const entry of ALL_ENTRIES) {
      if (entry.kind === 'separator' || entry.kind === 'submenu' || entry.kind === 'provider')
        continue;
      expect(getCommand((entry as { commandId: string }).commandId)).toBeDefined();
    }
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

  it('window.timeline is live in Animation mode and toggles the dock', () => {
    const command = getCommand('window.timeline');
    $mode.set('build');
    expect(command?.enabled?.()).toBe(false); // the dock only exists in Animation mode
    $mode.set('animation');
    expect(command?.enabled?.()).toBe(true);

    const wasChecked = command?.checked?.();
    command?.run(undefined);
    expect(command?.checked?.()).toBe(!wasChecked);
    command?.run(undefined);
    expect(command?.checked?.()).toBe(wasChecked);
    $mode.set('build');

    const referenced = ALL_ENTRIES.filter((e) => e.kind === 'checkbox').map(
      (e) => (e as { commandId: string }).commandId,
    );
    expect(referenced).toContain('window.timeline');
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
   * Data-mode scoping has no home in the authoritative tree — the mode switcher, `3` and
   * `mode.data` are the discoverable route, and these are the scope shortcuts on top of it.
   * If one ever gains a MENU_SPEC entry, that is a tree change and belongs in the
   * transcription lists above, not here.
   *
   * `data.partData` (the deleted Part Data dialog's opener) must NOT still be registered:
   * the dialog is gone, so a synonym row would open nothing.
   */
  it('data.scopePart is registered, titled and absent from the menu tree', () => {
    const command = getCommand('data.scopePart');
    expect(command?.title).toBe('Edit part data');
    expect(command?.menuPath).toBeUndefined();
    expect(getCommand('data.partData')).toBeUndefined();

    const referenced = ALL_ENTRIES.filter((e) => e.kind === 'command').map(
      (e) => (e as { commandId: string }).commandId,
    );
    expect(referenced).not.toContain('data.scopePart');
  });

  /** Every Part-scope section is reachable by name from the palette (design §A9). */
  it('registers an unbound jump command per Part-scope section', () => {
    for (const id of [
      'identity',
      'mass',
      'tanks',
      'power',
      'coupling',
      'wiring',
      'advanced',
      'passthrough',
    ]) {
      expect(getCommand(`data.jumpSection:${id}`)).toBeDefined();
    }
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
