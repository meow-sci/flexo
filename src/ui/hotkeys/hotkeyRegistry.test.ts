import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Keys } from 'react-hotkeys-hook';
// Importing the registry declares the bindings AND registers the Esc rungs; importing the
// command modules is what makes every binding id resolve — the same two imports `app.tsx`
// performs at boot, and the pairing the validator's "id is a command" rule depends on.
import { ALL_BINDINGS, isBindingActive, type HotkeyBinding } from './registry';
import '../commands';
import { reachableScopeSets, validateRegistry } from './validateRegistry';
import { isBareLetterOrDigit, normalizeKeys, scopeRank } from './keys';
import { escRungs } from './escLadder';
import { registerListSurfaceEditMirrors } from './listSurfaceMirrors';
import { chordsFor } from '../commands/chords';
import { $paletteOpen, getCommand } from '../../state/commandStore';
import { $openDialog } from '../../state/dialogStore';
import { $activeTool, $mode, MODES, TOOLS } from '../../state/modeStore';
import { $focusedSurface, SURFACE_IDS } from '../../state/hotkeyStore';
import { $chainSession } from '../../state/chainStore';

/**
 * **Conflict detection for the scoped hotkey registry** (design:
 * `plans/flexo_v2/design/design-system-services.md` §4.5, item by item).
 *
 * `validateRegistry` also runs at module init in DEV, but there it only `console.error`s —
 * commands register a microtask after the registry module evaluates, so throwing at the top
 * level would take the app down over a load-order detail. This suite is where the throw is
 * asserted, and where the guarantees are pinned for good:
 *
 * 1. no two same-precedence bindings claim one chord in any reachable active-scope set;
 * 2. no bare letter/digit can fire behind an overlay dialog (the "C5" regression class);
 * 3. display chords describe the same keys the binding listens for;
 * 4. every binding id is a command or a documented synthetic id;
 * 5. the Esc rungs are unique, ordered, and rungs 6/8 keep their never-preventDefault contract;
 * 6. the list-surface mirror helper produces a registry that still validates;
 * 7. the LOCKED rebinds (`F`, `[`/`]`, `⌘K`, `⇧⌘K`) cannot silently regress.
 */

/** A throwaway binding, for the "does the validator actually catch it" assertions. */
function fakeBinding(over: Partial<HotkeyBinding> & Pick<HotkeyBinding, 'id'>): HotkeyBinding {
  return {
    label: 'test binding',
    keys: 'f',
    chords: [['F']],
    scope: 'viewport',
    run: () => {},
    ...over,
  };
}

beforeEach(() => {
  $openDialog.set(null);
  $paletteOpen.set(false);
  $mode.set('build');
  $activeTool.set(null);
  $focusedSurface.set(null);
  $chainSession.set(null);
});

afterEach(() => {
  $openDialog.set(null);
  $paletteOpen.set(false);
  $mode.set('build');
  $activeTool.set(null);
  $focusedSurface.set(null);
});

describe('the shipped registry', () => {
  it('validates clean', () => {
    expect(() => validateRegistry(ALL_BINDINGS)).not.toThrow();
  });

  it('enumerates every reachable scope set (5 modes × 7 tool states × 9 surface states × chain × dialog)', () => {
    const sets = reachableScopeSets();
    expect(sets).toHaveLength(MODES.length * (TOOLS.length + 1) * (SURFACE_IDS.length + 1) * 2 * 2);
    // Every set is a state the app can really be in: global always, viewport iff no dialog.
    for (const set of sets) expect(set.has('global')).toBe(true);
    expect(sets.some((set) => set.has('viewport'))).toBe(true);
    expect(sets.some((set) => !set.has('viewport'))).toBe(true);
  });
});

describe('1 — no duplicate keys inside one active scope set', () => {
  it('catches a second viewport binding on `F`', () => {
    const clash = fakeBinding({ id: 'transform.test.frameClash' });
    expect(() => validateRegistry([...ALL_BINDINGS, clash])).toThrow(/'f' is claimed by/);
    // …and names both culprits, so the failure is actionable without a debugger.
    expect(() => validateRegistry([...ALL_BINDINGS, clash])).toThrow(/view\.frameSelection/);
  });

  it('accepts a lower-precedence collision — that is what precedence is for', () => {
    // SHIPPED since P11B.09: `surface:timeline` ← / → over the viewport nudge arrows, and
    // `F` over Frame Selection (foundation §11.2; design-animation-mode §12.2). The whole
    // registry validating clean is the assertion; these two pairs are why it could not.
    expect(() => validateRegistry(ALL_BINDINGS)).not.toThrow();
    expect(scopeRank('surface:timeline')).toBeGreaterThan(scopeRank('viewport'));
    const arrows = ALL_BINDINGS.find((b) => b.id === 'timeline.stepFrame');
    expect(arrows?.scope).toBe('surface:timeline');
    expect(normalizeKeys(arrows!.keys)).toEqual(normalizeKeys(['left', 'right']));
    const fit = ALL_BINDINGS.find((b) => b.id === 'timeline.fit');
    expect(normalizeKeys(fit!.keys)).toContain('f');
  });

  it('rejects a same-rank collision even across two different surfaces of one set', () => {
    // Both can be active at once: `surface:chain` follows the SESSION, not focus.
    const chainClash = fakeBinding({
      id: 'transform.test.chainClash',
      keys: 'mod+enter',
      chords: [['mod', '↵']],
      scope: 'surface:chain',
    });
    expect(() => validateRegistry([...ALL_BINDINGS, chainClash])).toThrow(/chain\.apply/);
  });
});

describe('2 — nothing bare fires behind an overlay dialog', () => {
  const bare = ALL_BINDINGS.filter((binding) =>
    normalizeKeys(binding.keys).some(isBareLetterOrDigit),
  );

  it('has bare-key bindings to guard (the assertion is not vacuous)', () => {
    expect(bare.length).toBeGreaterThan(5);
  });

  it('disables every bare letter/digit while a dialog is open', () => {
    $openDialog.set({ id: 'help' });
    // Reported as ids so a regression names the offender instead of just failing.
    expect(bare.filter(isBindingActive).map((binding) => binding.id)).toEqual([]);
  });

  it('disables every bare letter/digit while the command palette is open', () => {
    $paletteOpen.set(true);
    expect(bare.filter(isBindingActive).map((binding) => binding.id)).toEqual([]);
  });

  it('disables them in every mode, tool and surface combination too', () => {
    $openDialog.set({ id: 'help' });
    for (const mode of MODES) {
      $mode.set(mode.id);
      for (const tool of [null, ...TOOLS]) {
        $activeTool.set(tool);
        for (const surface of [null, ...SURFACE_IDS]) {
          $focusedSurface.set(surface);
          expect(bare.filter(isBindingActive).map((binding) => binding.id)).toEqual([]);
        }
      }
    }
  });

  it('keeps the mode digits alive once the dialog closes', () => {
    const digit = ALL_BINDINGS.find((binding) => binding.id === 'mode.animation');
    expect(digit).toBeDefined();
    expect(isBindingActive(digit!)).toBe(true);
  });

  it('leaves the modifier chords alone — ⌘Z must survive a dialog (v1 parity)', () => {
    $openDialog.set({ id: 'help' });
    const undo = ALL_BINDINGS.find((binding) => binding.id === 'edit.undo');
    expect(isBindingActive(undo!)).toBe(true);
  });
});

/**
 * The chord-from-keys generator (design §4.5 "chords[] matches keys"). It compares TOKEN
 * SETS rather than chord-for-chord, because a binding may deliberately fold two alternative
 * keys into one display chip — `keys: ['w','s']` renders as a single `W S` row.
 */
const TOKEN_DISPLAY: Readonly<Record<string, string>> = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  enter: '↵',
  escape: 'Escape',
  delete: 'Delete',
  backspace: 'Backspace',
  bracketleft: '[',
  bracketright: ']',
  comma: ',',
  period: '.',
  equal: '=',
  minus: '-',
  space: 'Space',
  mod: 'mod',
  shift: 'shift',
  alt: 'alt',
  ctrl: 'ctrl',
  meta: 'meta',
};

function displayTokensFor(keys: Keys): Set<string> {
  const tokens = new Set<string>();
  for (const chord of normalizeKeys(keys)) {
    for (const token of chord.split('+')) {
      const display = TOKEN_DISPLAY[token] ?? (token.length === 1 ? token.toUpperCase() : null);
      if (display === null) throw new Error(`no display token known for key '${token}'`);
      tokens.add(display);
    }
  }
  return tokens;
}

describe('3 — keys parse, and the display chords describe them', () => {
  it.each(ALL_BINDINGS.map((binding) => [binding.id, binding] as const))('%s', (_id, binding) => {
    expect(normalizeKeys(binding.keys).length).toBeGreaterThan(0);
    expect(binding.chords.length).toBeGreaterThan(0);
    const fromChords = new Set(binding.chords.flat());
    expect([...fromChords].sort()).toEqual([...displayTokensFor(binding.keys)].sort());
  });
});

describe('4 — every binding id resolves', () => {
  /**
   * The synthetic families `validateRegistry` accepts: `transform.*` (pure-key viewport
   * behaviors with no menu home), `mirror.*` (list-surface edit mirrors, which run their
   * twin's command), and five named ids — the last two being the glow painter's DIALOG-LOCAL
   * stroke undo/redo, which have no command because the stack only exists while that modal
   * is mounted.
   */
  const SYNTHETIC = [
    'esc.ladder',
    'chain.apply',
    'outliner.search',
    'glowPaint.undo',
    'glowPaint.redo',
  ];

  it.each(ALL_BINDINGS.map((binding) => [binding.id] as const))('%s', (id) => {
    const synthetic =
      id.startsWith('transform.') ||
      id.startsWith('mirror.') ||
      // `anim.*` / `timeline.*` (P11B.09): playhead + column-selection keys that only mean
      // anything with the dock focused, so the palette could not deliver them.
      id.startsWith('anim.') ||
      id.startsWith('timeline.') ||
      SYNTHETIC.includes(id);
    expect(synthetic || getCommand(id) !== undefined).toBe(true);
  });

  it('catches an id that is neither', () => {
    expect(() =>
      validateRegistry([...ALL_BINDINGS, fakeBinding({ id: 'nope.notACommand' })]),
    ).toThrow(/no such command/);
  });

  it('has unique ids', () => {
    const ids = ALL_BINDINGS.map((binding) => binding.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('5 — the Escape ladder', () => {
  it('registers unique rungs in ascending order', () => {
    const rungs = escRungs().map((rung) => rung.rung);
    expect(new Set(rungs).size).toBe(rungs.length);
    expect([...rungs].sort((a, b) => a - b)).toEqual(rungs);
  });

  it('keeps rungs 6 and 8 non-preventDefault (the two v1 contracts)', () => {
    for (const rung of escRungs()) {
      if (rung.rung === 6 || rung.rung === 8)
        expect([rung.rung, rung.preventDefault]).toEqual([rung.rung, false]);
    }
    // Both rungs exist — the assertion above is vacuous otherwise.
    expect(escRungs().map((rung) => rung.rung)).toEqual(expect.arrayContaining([6, 8]));
  });

  it('routes Escape through exactly one binding', () => {
    const escapes = ALL_BINDINGS.filter((binding) =>
      normalizeKeys(binding.keys).includes('escape'),
    );
    expect(escapes.map((binding) => binding.id)).toEqual(['esc.ladder']);
  });
});

describe('6 — list-surface edit mirrors', () => {
  const COMMANDS: Readonly<Record<string, string>> = {
    copy: 'edit.copy',
    cut: 'edit.cut',
    paste: 'edit.paste',
    duplicate: 'edit.duplicate',
    delete: 'edit.delete',
    invertSelection: 'select.invert',
  };

  it('keeps the registry valid when a FURTHER surface registers them', () => {
    // `outliner` (P5A), `data-navigator` (P6) and `engine-tree` (P7) are already in
    // ALL_BINDINGS; the next surface to stamp itself must not disturb the conflict validator
    // either.
    const mirrors = registerListSurfaceEditMirrors('members');
    expect(() => validateRegistry([...ALL_BINDINGS, ...mirrors])).not.toThrow();
  });

  it('delegates to commands that exist, and never mirrors ⌘A', () => {
    const mirrors = registerListSurfaceEditMirrors('data-navigator');
    // The Data navigator's own six are LIVE in the registry (P6.07 stamped the surface).
    expect(ALL_BINDINGS.filter((b) => b.scope === 'surface:data-navigator')).toHaveLength(
      mirrors.length,
    );
    expect(mirrors).toHaveLength(Object.keys(COMMANDS).length);
    for (const mirror of mirrors) {
      const suffix = mirror.id.split('.').pop()!;
      expect(getCommand(COMMANDS[suffix])).toBeDefined();
      expect(mirror.scope).toBe('surface:data-navigator');
    }
    expect(mirrors.some((mirror) => normalizeKeys(mirror.keys).includes('mod+a'))).toBe(false);
  });
});

describe('7 — the LOCKED rebinds', () => {
  it('F frames the selection', () => {
    expect(chordsFor('view.frameSelection')).toEqual([['F']]);
  });

  it('the rotation step lives on the bracket pair', () => {
    expect(chordsFor('transform.rotateStep.down')).toEqual([['[']]);
    expect(chordsFor('transform.rotateStep.up')).toEqual([[']']]);
  });

  it('⌘K opens the palette and ⇧⌘K begins a chain', () => {
    expect(chordsFor('palette.open')).toEqual([['mod', 'K']]);
    expect(chordsFor('chain.begin')).toEqual([['mod', 'shift', 'K']]);
  });

  it('resolves an Esc-rung command to the Escape chip', () => {
    // Escape is one binding running the ladder, so a rung's menu item would otherwise lose
    // the chip it had in v1.
    expect(chordsFor('seat.exit')).toEqual([['Escape']]);
  });

  it('returns null for an unbound command', () => {
    expect(chordsFor('help.about')).toBeNull();
  });
});
