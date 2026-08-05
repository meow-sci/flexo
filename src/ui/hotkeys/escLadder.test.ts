import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dispatchEsc, escRungs } from './escLadder';
// Importing the registry is what REGISTERS the rungs (they are declared beside the key
// bindings, see registry.ts), and importing the command modules is what makes
// `runCommand('seat.exit')` resolve — exactly the wiring `app.tsx` performs at boot.
import './registry';
import '../commands';
import { $openDialog } from '../../state/dialogStore';
import { $paletteOpen } from '../../state/commandStore';
import { $chainSession } from '../../state/chainStore';
import { $measureTool, setMeasureTool } from '../../state/measurementStore';
import { $engineExhaustGizmo } from '../../state/engineStore';
import { $activeJointId, $editKeyframeId } from '../../state/animationStore';
import { $mode, disarmTool } from '../../state/modeStore';
import { $seatView } from '../../state/ivaStore';
import { $gizmoDragging, $gizmoCancel } from '../../state/viewStore';
import { $selection, addSubPart, newPart, select } from '../../state/editorStore';

/**
 * The Escape ladder (design: `plans/flexo_v2/design/foundation.md` §11.4). Every test drives
 * `dispatchEsc` with a synthetic event and asserts BOTH what ran and what survived — the
 * ladder's whole point is that exactly one rung fires per press, in a fixed order.
 */

function esc(): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
}

let input: HTMLInputElement | null = null;

function typeInAField(): void {
  input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();
}

beforeEach(() => {
  $openDialog.set(null);
  $paletteOpen.set(false);
  $chainSession.set(null);
  // Every transient tool is a `$activeTool` tenant now, so the slot — not the feature
  // atom — is what a test must clear; `disarmTool` runs the armed tool's own teardown.
  disarmTool();
  $engineExhaustGizmo.set(false);
  $mode.set('build');
  $editKeyframeId.set(null);
  $activeJointId.set(null);
  $seatView.set(null);
  $gizmoDragging.set(false);
  $gizmoCancel.set(null);
  newPart(); // also clears the selection
});

afterEach(() => {
  input?.remove();
  input = null;
});

describe('rung order', () => {
  it('registers rungs 3–8, strictly ascending', () => {
    expect(escRungs().map((r) => r.rung)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('does nothing when something above already consumed the event (rungs 1–2)', () => {
    // A dirty numeric field's revert preventDefaults + stopPropagations; if the event does
    // reach the document, `defaultPrevented` is the tell.
    $chainSession.set({ seedIds: ['a'], ops: [] });
    const event = esc();
    event.preventDefault();
    dispatchEsc(event);
    expect($chainSession.get()).not.toBe(null);
  });

  it('lets an open overlay dialog own Escape (rung 2 beats every flexo rung)', () => {
    $openDialog.set({ id: 'chain-discard-confirm' });
    $seatView.set('seat1');
    $chainSession.set({ seedIds: ['a'], ops: [] });
    dispatchEsc(esc());
    expect($seatView.get()).toBe('seat1');
    expect($chainSession.get()).not.toBe(null);
  });

  it('closes the palette (3) before cancelling a chain session (6)', () => {
    $paletteOpen.set(true);
    $chainSession.set({ seedIds: ['a'], ops: [] });
    const event = esc();
    dispatchEsc(event);
    expect($paletteOpen.get()).toBe(false);
    expect($chainSession.get()).not.toBe(null);
    expect(event.defaultPrevented).toBe(true);
  });

  it('cancels a gizmo drag (4) before disarming a tool (5)', () => {
    $gizmoDragging.set(true);
    setMeasureTool('point');
    dispatchEsc(esc());
    expect($gizmoCancel.get()).not.toBe(null);
    expect($measureTool.get()).toBe('point');
  });

  it('disarms the measure tool (5) before cancelling a chain session (6)', () => {
    setMeasureTool('point');
    $chainSession.set({ seedIds: ['a'], ops: [] });
    dispatchEsc(esc());
    expect($measureTool.get()).toBe('none');
    expect($chainSession.get()).not.toBe(null);
  });

  it('cancels the chain from inside a text field (rung 6 enableWhileTyping)', () => {
    typeInAField();
    $chainSession.set({ seedIds: ['a'], ops: [] });
    const event = esc();
    dispatchEsc(event);
    expect($chainSession.get()).toBe(null);
    // v1 contract: the chain cancel never preventDefaults.
    expect(event.defaultPrevented).toBe(false);
  });

  it('skips a typing-guarded rung while a text field has focus', () => {
    typeInAField();
    setMeasureTool('point');
    dispatchEsc(esc());
    expect($measureTool.get()).toBe('point');
  });

  it('unwinds animation keyframe → joint, then stops (the mode never exits via Esc)', () => {
    $mode.set('animation');
    $editKeyframeId.set('kf1');
    $activeJointId.set('joint1');

    dispatchEsc(esc());
    expect($editKeyframeId.get()).toBe(null);
    expect($activeJointId.get()).toBe('joint1');

    dispatchEsc(esc());
    expect($activeJointId.get()).toBe(null);

    const third = esc();
    dispatchEsc(third);
    expect($mode.get()).toBe('animation');
    expect(third.defaultPrevented).toBe(false);
  });

  it('leaves seat view (8) without preventDefaulting the event', () => {
    $seatView.set('seat1');
    const event = esc();
    dispatchEsc(event);
    expect($seatView.get()).toBe(null);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing at all when no rung applies — rung 9', () => {
    addSubPart('Core.A');
    addSubPart('Core.B');
    select([
      { kind: 'subpart', id: 'a_1' },
      { kind: 'subpart', id: 'b_1' },
    ]);
    const event = esc();
    dispatchEsc(event);
    expect(event.defaultPrevented).toBe(false);
    // Escape never clears the selection (foundation §11.4 rung 9).
    expect($selection.get().map((r) => r.id)).toEqual(['a_1', 'b_1']);
  });
});
