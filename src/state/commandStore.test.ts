import { describe, it, expect, beforeEach } from 'vitest';
import {
  $paletteOpen,
  $paletteRecents,
  PALETTE_RECENTS_MAX,
  allCommands,
  allDynamicCommands,
  closePalette,
  getCommand,
  openPalette,
  providerCommands,
  recordRecent,
  registerCommand,
  registerCommandProvider,
  registerCommands,
  runCommand,
  type Command,
} from './commandStore';

/**
 * The registry is module-global and registrations are permanent by design (a duplicate id
 * THROWS — see below), so every test here registers under its own unique ids rather than
 * resetting shared state.
 */
const cmd = (id: string, extra: Partial<Command> = {}): Command => ({
  id,
  title: id,
  run: () => {},
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  $paletteRecents.set([]);
  $paletteOpen.set(false);
});

describe('command registration', () => {
  it('registers commands and looks them up by id', () => {
    registerCommands([cmd('t.one', { title: 'One', menuPath: 'Test' }), cmd('t.two')]);
    expect(getCommand('t.one')?.title).toBe('One');
    expect(getCommand('t.two')?.menuPath).toBeUndefined();
    expect(allCommands().map((c) => c.id)).toEqual(expect.arrayContaining(['t.one', 't.two']));
  });

  it('THROWS on a duplicate id — later phases re-point a command, never re-register it', () => {
    registerCommand(cmd('t.dup'));
    expect(() => registerCommand(cmd('t.dup'))).toThrow(/duplicate command id/);
    expect(() => registerCommands([cmd('t.dup2'), cmd('t.dup2')])).toThrow(/duplicate command id/);
  });

  it('returns undefined for an unknown id', () => {
    expect(getCommand('t.nope')).toBeUndefined();
  });
});

describe('runCommand', () => {
  it('runs an enabled command with its params and reports success', () => {
    const seen: unknown[] = [];
    registerCommand(cmd('t.run', { run: (params) => seen.push(params) }));
    expect(runCommand('t.run', { shape: 'Box' })).toBe(true);
    expect(seen).toEqual([{ shape: 'Box' }]);
  });

  it('skips a command whose enabled() is false and returns false', () => {
    let ran = 0;
    registerCommand(
      cmd('t.disabled', {
        enabled: () => false,
        run: () => {
          ran += 1;
        },
      }),
    );
    expect(runCommand('t.disabled')).toBe(false);
    expect(ran).toBe(0);
  });

  it('runs a command with no enabled predicate at all', () => {
    let ran = 0;
    registerCommand(
      cmd('t.alwaysOn', {
        run: () => {
          ran += 1;
        },
      }),
    );
    expect(runCommand('t.alwaysOn')).toBe(true);
    expect(ran).toBe(1);
  });

  it('returns false for an unknown id (no throw — the palette flashes a no-op)', () => {
    expect(runCommand('t.missing')).toBe(false);
  });
});

describe('dynamic providers', () => {
  it('re-evaluates on every read, so rows follow the live document', () => {
    const layers = ['hull'];
    registerCommandProvider('t.layers', () => layers.map((id) => cmd(`t.layer:${id}`)));
    expect(providerCommands('t.layers').map((c) => c.id)).toEqual(['t.layer:hull']);
    layers.push('wings');
    expect(providerCommands('t.layers').map((c) => c.id)).toEqual([
      't.layer:hull',
      't.layer:wings',
    ]);
    layers.length = 0;
    expect(providerCommands('t.layers')).toEqual([]);
  });

  it('returns [] for an unknown provider id and throws on a duplicate registration', () => {
    expect(providerCommands('t.noSuchProvider')).toEqual([]);
    registerCommandProvider('t.dupProvider', () => []);
    expect(() => registerCommandProvider('t.dupProvider', () => [])).toThrow(
      /duplicate command provider id/,
    );
  });

  it('keeps provider rows out of allCommands but inside allDynamicCommands', () => {
    registerCommandProvider('t.seats', () => [cmd('t.seat:1'), cmd('t.seat:2')]);
    expect(allCommands().map((c) => c.id)).not.toContain('t.seat:1');
    expect(allDynamicCommands().map((c) => c.id)).toEqual(expect.arrayContaining(['t.seat:1']));
  });

  it('resolves and runs a provider-generated id through getCommand/runCommand', () => {
    let ran = '';
    registerCommandProvider('t.projects', () =>
      ['alpha', 'beta'].map((name) =>
        cmd(`t.project:${name}`, {
          title: `Open project: ${name}`,
          run: () => {
            ran = name;
          },
        }),
      ),
    );
    expect(getCommand('t.project:beta')?.title).toBe('Open project: beta');
    expect(runCommand('t.project:beta')).toBe(true);
    expect(ran).toBe('beta');
  });
});

describe('palette state', () => {
  it('opens and closes', () => {
    openPalette();
    expect($paletteOpen.get()).toBe(true);
    closePalette();
    expect($paletteOpen.get()).toBe(false);
  });

  it('records recents MRU-first, deduped, capped at 8, and persists them', () => {
    recordRecent('a');
    recordRecent('b');
    recordRecent('a'); // re-run moves 'a' back to the front instead of duplicating
    expect($paletteRecents.get()).toEqual(['a', 'b']);

    for (let i = 0; i < 10; i++) recordRecent(`cmd${i}`);
    const recents = $paletteRecents.get();
    expect(recents).toHaveLength(PALETTE_RECENTS_MAX);
    expect(recents[0]).toBe('cmd9');
    expect(recents).not.toContain('a');

    expect(JSON.parse(localStorage.getItem('flexo:paletteRecents') ?? '[]')).toEqual(recents);
  });

  it('survives a corrupt stored value instead of throwing', () => {
    $paletteRecents.set('not an array' as unknown as string[]);
    recordRecent('a');
    expect($paletteRecents.get()).toEqual(['a']);
  });
});
