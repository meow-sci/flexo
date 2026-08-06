import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { activatePartAtIndex } from './partCommands';
// Side-effect import: registering the six part commands AND the `parts` provider IS importing
// this module — the same import `app.tsx` performs at boot, and the only way the ids below
// resolve through `getCommand` / `runCommand` / `providerCommands`.
import './index';
import { getCommand, providerCommands, runCommand } from '../../state/commandStore';
import { $openDialog } from '../../state/dialogStore';
import { $statusMessage, clearStatus } from '../../state/statusStore';
import {
  $activePartId,
  $partEntries,
  createPart,
  deletePart,
  initPartsForNewProject,
  switchPart,
} from '../../state/partsStore';
import { newPart } from '../../state/editorStore';
import { $layerView } from '../../state/layerStore';

/**
 * The part command layer (`plans/MULTI_PART_PLAN.md` P4.01, tests P4.07) — the ONE dataset
 * behind the File ▸ part section, the PartSwitcher popover, the ⌘K palette rows and the ⌥
 * chords. Everything here goes through the real registry rather than the module's exports, so
 * a command that is defined but never wired into `index.ts` / `providers.ts` fails.
 *
 * Two contracts get pinned besides the dispatching:
 *
 * - **the one-part floor** — `part.delete`, `part.next` and `part.prev` are disabled while the
 *   project holds a single part, and `runCommand` refuses them (no dialog, no flash);
 * - **all feedback lives here** — `partsStore` is deliberately toast-free, so every switch that
 *   really happened must leave an "Editing: <name>" line in the status channel, and every one
 *   that did not (the already-active row) must leave nothing.
 */

/** The status channel's current line — where `toast()` lands. `null` when nothing is showing. */
function flash(): string | null {
  return $statusMessage.get()?.text ?? null;
}

/** Part display names in registry order. Deterministic: "Part 1", "Part 2", … */
function names(): string[] {
  return $partEntries.get().map((entry) => entry.name);
}

/**
 * Grows the project to `count` parts and returns every entry id in registry order. `createPart`
 * appends AND activates, so the LAST id is the active one on return.
 */
function withParts(count: number): string[] {
  for (let n = 1; n < count; n++) createPart();
  return $partEntries.get().map((entry) => entry.id);
}

beforeEach(() => {
  // The same reset `partsStore.test.ts` uses: a blank live document, then a one-part registry.
  newPart();
  $layerView.set({});
  $openDialog.set(null);
  clearStatus();
  initPartsForNewProject();
});

afterEach(() => {
  $openDialog.set(null);
  clearStatus();
});

describe('the one-part floor', () => {
  it('disables part.delete in a single-part project, and refuses to open its confirm', () => {
    expect(names()).toEqual(['Part 1']);
    expect(getCommand('part.delete')?.enabled?.()).toBe(false);
    expect(runCommand('part.delete')).toBe(false);
    expect($openDialog.get()).toBeNull();
  });

  it('enables part.delete as soon as a second part exists', () => {
    withParts(2);
    expect(getCommand('part.delete')?.enabled?.()).toBe(true);
    expect(runCommand('part.delete')).toBe(true);
    expect($openDialog.get()).toEqual({ id: 'part-delete-confirm' });
  });

  it('disables both cycle commands with one part and enables them with two', () => {
    for (const id of ['part.next', 'part.prev']) {
      expect(getCommand(id)?.enabled?.()).toBe(false);
      expect(runCommand(id)).toBe(false);
    }
    expect($activePartId.get()).toBe($partEntries.get()[0].id);
    expect(flash()).toBeNull();

    withParts(2);
    for (const id of ['part.next', 'part.prev']) {
      expect(getCommand(id)?.enabled?.()).toBe(true);
    }
  });
});

describe('part.next / part.prev cycle the registry order, and WRAP', () => {
  it('walks forward and wraps past the LAST entry back to the first', () => {
    const [a, b, c] = withParts(3);
    expect($activePartId.get()).toBe(c); // createPart lands you in the part it made

    expect(switchPart(a)).toBe(true);
    expect(runCommand('part.next')).toBe(true);
    expect($activePartId.get()).toBe(b);
    runCommand('part.next');
    expect($activePartId.get()).toBe(c);
    // THE WRAP: from the last entry, forward is the FIRST one — not a no-op, and not an
    // out-of-range read that leaves the active part alone.
    runCommand('part.next');
    expect($activePartId.get()).toBe(a);
  });

  it('walks backward and wraps past the FIRST entry round to the last', () => {
    const [a, b, c] = withParts(3);
    expect(switchPart(a)).toBe(true);

    // THE WRAP, on the very first hop: from the first entry, backward is the LAST one.
    runCommand('part.prev');
    expect($activePartId.get()).toBe(c);
    runCommand('part.prev');
    expect($activePartId.get()).toBe(b);
    runCommand('part.prev');
    expect($activePartId.get()).toBe(a);
  });

  it('cycles a two-part project, where every hop is a wrap', () => {
    const [a, b] = withParts(2);
    expect(switchPart(a)).toBe(true);

    runCommand('part.next');
    expect($activePartId.get()).toBe(b);
    runCommand('part.next');
    expect($activePartId.get()).toBe(a);
    runCommand('part.prev');
    expect($activePartId.get()).toBe(b);
    runCommand('part.prev');
    expect($activePartId.get()).toBe(a);
  });

  it('reports every hop in the status channel (partsStore is toast-free)', () => {
    const [a] = withParts(2);
    expect(switchPart(a)).toBe(true);
    clearStatus();

    runCommand('part.next');
    expect(flash()).toBe('Editing: Part 2');
    runCommand('part.prev');
    expect(flash()).toBe('Editing: Part 1');
  });
});

describe('the `parts` provider', () => {
  it('is empty in a single-part project — the empty array IS the hidden Switch Part submenu', () => {
    expect(providerCommands('parts')).toEqual([]);
  });

  it('mints one row per part, in registry order, with a live ✓ on exactly the active one', () => {
    const ids = withParts(3);
    const rows = providerCommands('parts');

    expect(rows.map((row) => row.id)).toEqual(ids.map((id) => `part:switch:${id}`));
    expect(rows.map((row) => row.title)).toEqual([
      'Switch to part: Part 1',
      'Switch to part: Part 2',
      'Switch to part: Part 3',
    ]);
    // Exactly ONE ✓, on the active row (`createPart` left us in the third part).
    expect(rows.filter((row) => row.checked?.()).map((row) => row.id)).toEqual([
      `part:switch:${ids[2]}`,
    ]);

    // `checked` is a PREDICATE, not a value captured while the rows were built: the very same
    // row objects report the new active part after a switch.
    expect(switchPart(ids[0])).toBe(true);
    expect(rows.filter((row) => row.checked?.()).map((row) => row.id)).toEqual([
      `part:switch:${ids[0]}`,
    ]);
    // …and a freshly-read batch agrees.
    expect(
      providerCommands('parts')
        .filter((row) => row.checked?.())
        .map((row) => row.id),
    ).toEqual([`part:switch:${ids[0]}`]);
  });

  it('drops back to empty when the project falls to one part again', () => {
    const ids = withParts(2);
    expect(providerCommands('parts')).toHaveLength(2);
    expect(deletePart(ids[1])).toBe(true);
    expect(providerCommands('parts')).toEqual([]);
  });
});

describe('running a `part:switch:<id>` row', () => {
  it('resolves through getCommand and really switches the active part', () => {
    const [a] = withParts(3);
    expect(getCommand(`part:switch:${a}`)?.title).toBe('Switch to part: Part 1');

    expect(runCommand(`part:switch:${a}`)).toBe(true);
    expect($activePartId.get()).toBe(a);
    expect(flash()).toBe('Editing: Part 1');
  });

  it('stays silent for the row of the part that is already active', () => {
    withParts(2);
    const active = $activePartId.get();
    clearStatus();

    expect(runCommand(`part:switch:${active}`)).toBe(true);
    expect($activePartId.get()).toBe(active);
    expect(flash()).toBeNull();
  });
});

describe('activatePartAtIndex — the ⌥1…⌥9 slot chords', () => {
  it('activates the i-th entry in registry order and names it', () => {
    const [a, , c] = withParts(3);

    activatePartAtIndex(0);
    expect($activePartId.get()).toBe(a);
    expect(flash()).toBe('Editing: Part 1');

    activatePartAtIndex(2);
    expect($activePartId.get()).toBe(c);
    expect(flash()).toBe('Editing: Part 3');
  });

  it('no-ops for a slot the project does not have — no switch, no flash', () => {
    const [a] = withParts(2);
    expect(switchPart(a)).toBe(true);
    clearStatus();

    activatePartAtIndex(2); // ⌥3 in a two-part project
    activatePartAtIndex(8); // ⌥9
    activatePartAtIndex(-1); // not reachable from a chord, but the guard must hold anyway
    expect($activePartId.get()).toBe(a);
    expect(flash()).toBeNull();
  });
});

describe('the rest of the File ▸ part section', () => {
  it('part.new appends a part, lands you in it, and names it', () => {
    expect(getCommand('part.new')?.enabled?.() ?? true).toBe(true);

    expect(runCommand('part.new')).toBe(true);
    expect(names()).toEqual(['Part 1', 'Part 2']);
    expect($activePartId.get()).toBe($partEntries.get()[1].id);
    expect(flash()).toBe('New part: Part 2');
  });

  it('part.rename opens its dialog with no params — the dialog targets the active part itself', () => {
    expect(runCommand('part.rename')).toBe(true);
    expect($openDialog.get()).toEqual({ id: 'part-rename' });
  });
});
