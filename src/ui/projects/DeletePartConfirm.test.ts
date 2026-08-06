import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DeletePartConfirm } from './DeletePartConfirm';
import {
  $activePartId,
  $partEntries,
  createPart,
  initPartsForNewProject,
  switchPart,
} from '../../state/partsStore';
import { newPart } from '../../state/editorStore';
import { $layerView } from '../../state/layerStore';
import { $statusMessage, clearStatus } from '../../state/statusStore';

/**
 * **The delete confirm must name — and destroy — the part that is active RIGHT NOW**
 * (`plans/MULTI_PART_PLAN.md` P4.02, tests P4.07).
 *
 * This is the suite's one React render, and it is a render on purpose: the bug it guards is a
 * *rendering* bug, invisible to any store-level assertion. The confirm used to be a
 * `ConfirmDialog` inlined into `DialogRoot`'s switch, reading `$activePartMeta.get()` in that
 * render body — a non-reactive read the React Compiler caches in an EMPTY-dependency memo slot.
 * `DialogRoot` mounts once at app root and never unmounts, so the slot outlives every open:
 * open the confirm over part A, cancel, switch to part B, re-open, and it still said "Delete
 * part “A”?" — and confirming deleted A. Deleting a part is not undoable (I6), so that is
 * unrecoverable data loss.
 *
 * The mounted component tracking a switch is the strictly stronger form of the same guarantee
 * (a stale memo slot and a missing subscription both fail it), so that is what is asserted.
 * Regress `useStore($activePartMeta)` to a bare `.get()` and both tests below go red.
 */

// React needs this to run `act()` outside a testing-library harness; the repo has none.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
/** Every `onOpenChange(open)` the confirm asked for, oldest first. */
let openChanges: boolean[];

/** Mounts the confirm exactly as `DialogRoot` does: no params, `dismiss` as `onOpenChange`. */
async function mountConfirm(): Promise<void> {
  await act(async () => {
    root.render(
      createElement(DeletePartConfirm, { onOpenChange: (open) => openChanges.push(open) }),
    );
  });
}

/** The confirm's rendered text — it portals to `document.body`, outside the host div. */
function rendered(): string {
  return document.body.textContent ?? '';
}

/** The dialog's Delete button, or undefined when the confirm rendered nothing. */
function deleteButton(): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent === 'Delete',
  );
}

beforeEach(() => {
  newPart();
  $layerView.set({});
  clearStatus();
  initPartsForNewProject();
  openChanges = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  clearStatus();
});

describe('DeletePartConfirm', () => {
  it('re-targets the NEW active part when the part is switched under it', async () => {
    const first = $activePartId.get();
    createPart(); // "Part 2", and `createPart` lands us in it
    await mountConfirm();
    expect(rendered()).toContain('Delete part “Part 2”?');

    // The regression scenario, minus the cancel/re-open (which only mattered because the stale
    // read survived it): the ACTIVE part changes while the confirm is mounted.
    await act(async () => {
      expect(switchPart(first)).toBe(true);
    });
    expect(rendered()).toContain('Delete part “Part 1”?');
    expect(rendered()).not.toContain('Part 2”?');
  });

  it('confirms against the NEW active part, not the one it first rendered', async () => {
    const first = $activePartId.get();
    createPart();
    await mountConfirm();
    await act(async () => {
      expect(switchPart(first)).toBe(true);
    });

    await act(async () => {
      deleteButton()!.click();
    });

    // "Part 1" is gone — the part named on screen. The stale-read regression deleted "Part 2".
    expect($partEntries.get().map((entry) => entry.name)).toEqual(['Part 2']);
    expect($statusMessage.get()?.text).toBe('Deleted part: Part 1');
    expect(openChanges).toContain(false);
  });

  it('renders nothing when no part is active (pre-hydration only)', async () => {
    $activePartId.set('pt_nosuchentry');
    await mountConfirm();
    expect(rendered()).toBe('');
    expect(deleteButton()).toBeUndefined();
  });
});
