import { computed } from 'nanostores';
import { setToolStatus, type ToolStatus } from '../../state/statusStore';
import { $seatView } from '../../state/ivaStore';
import { $part } from '../../state/editorStore';
import { $measureTool } from '../../state/measurementStore';
import { $activeNozzleTarget, $isExhaustPlacing, nozzleTargetLabel } from '../../state/engineStore';

/**
 * Feeds the status bar's tool segment (`statusStore.$toolStatus`) from the v1 tool-ish
 * sessions (design: `plans/flexo_v2/design/design-system-services.md` §1.2 #3; foundation
 * §2.6 "each tool owns a status segment").
 *
 * **Interim by design.** The end state is a single `$activeTool` slot whose owning store
 * hooks write their own status model on arm and clear it on disarm; that slot arrives with
 * the mode phase. Until then the three sessions are three independent flags in three
 * stores, so this module derives ONE model from them and pushes it into the atom. The mode
 * phase deletes this file and moves each model next to its tool.
 *
 * The chain session is deliberately absent: chain is NOT a tool (foundation §2.6 — it is a
 * parallel non-modal session that co-exists with any tool), so `ToolSegment` mirrors it
 * from `$chainSession`/`$chainEval` as a second, compact chip instead.
 *
 * Undo enrollment: NONE. Nothing here writes document state.
 */

/**
 * Priority when more than one session is live. Seat view wins: it takes the camera over
 * completely, and its segment carries the only pointer route back out (Exit). Exhaust
 * placement is Engine-mode-scoped and outranks the measure toggle, which survives
 * everything because nothing in v1 disarms it.
 */
const $derivedToolStatus = computed(
  [$seatView, $part, $isExhaustPlacing, $activeNozzleTarget, $measureTool],
  (seatId, part, exhaustPlacing, nozzleTarget, measureTool): ToolStatus | null => {
    if (seatId !== null) {
      const index = part.ivaSeats.findIndex((seat) => seat.id === seatId);
      // A vanished seat is torn down by EditorScene a beat later; show nothing meanwhile
      // rather than "Seat 0 / 3".
      if (index >= 0) {
        return {
          toolId: 'seat-view',
          icon: 'Eye',
          text: `Seat ${index + 1} / ${part.ivaSeats.length}`,
        };
      }
    }

    if (exhaustPlacing && nozzleTarget) {
      return {
        toolId: 'exhaust',
        icon: 'Flame',
        text: `Exhaust: ${nozzleTargetLabel(nozzleTarget)}`,
      };
    }

    if (measureTool === 'point') {
      // INTERIM text. The live "click first point" → "click second point" instruction needs
      // the half-placed pick state, which lives inside EditorScene and is not exposed to any
      // store yet; the Build phase lifts it. Until then this says what the tool wants
      // overall, which is still infinitely more than v1's completely invisible armed state.
      //
      // No `Esc` hint: nothing in the v1 registry disarms the measure tool (the only
      // Escape binding is `seat.exit`). The escape ladder gives every tool a rung in the
      // hotkey phase — the hint goes in when the key actually works, not before.
      return { toolId: 'measure', icon: 'Ruler', text: 'Measure — click two points' };
    }

    return null;
  },
);

let started = false;

/**
 * Starts the subscription. Idempotent, so React StrictMode's double-invoked effects and a
 * hot reload are both harmless (the same guard `initModifierListeners` uses).
 */
export function initToolStatusWiring(): void {
  if (started) return;
  started = true;
  // A `computed` is lazy — subscribing is what makes it evaluate at all. Never unsubscribed:
  // the tool segment exists for the life of the app.
  let last = '';
  $derivedToolStatus.subscribe((model) => {
    // The computed depends on `$part`, so it rebuilds its object on every document edit.
    // Writing an equal-but-new object would re-render the segment on every keystroke of a
    // gizmo drag for nothing, so compare the rendered content and skip.
    const key = model ? `${model.toolId}|${model.icon}|${model.text}` : '';
    if (key === last) return;
    last = key;
    setToolStatus(model);
  });
}
