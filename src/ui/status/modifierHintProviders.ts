import { registerModifierHints } from '../../state/modifierStore';

/**
 * The modifier-hint providers flexo ships TODAY (design:
 * `plans/flexo_v2/design/design-system-services.md` §1.4).
 *
 * A provider is registered DATA, not a component: it answers "what would holding a modifier
 * do right now, for the surface under the pointer". The rule for adding one is strict —
 * **only gestures that actually exist may be advertised**. A hint for a gesture that does
 * nothing is worse than no hint at all, so the roster below is limited to the two pointer
 * modifiers verified in the v1 code (additive click-select in `SelectionManager`, and the
 * shift-range/toggle selection in the list hooks).
 *
 * **Not registered here, on purpose** — each lands with the phase that builds its gesture,
 * registered next to the gesture itself so the two can never drift apart:
 *
 * | Provider | Gesture | Owner |
 * |---|---|---|
 * | `timeline` ⌃ Snap to keys | keyframe drag snapping | Animation phase |
 * | `animation-pose` ⇧ Axis lock | pose-gizmo axis lock | Animation phase |
 *
 * (`⌥ Duplicate drag` LANDED in P5B.18 and lives on the `gizmo-drag` provider below,
 * beside the ⌃ snap-invert row it shares a gesture with.)
 *
 * **Known interim limitation**: `HintContext` carries `hover`, `hasSelection` and
 * `dialogOpen` only — there is no mode, active-tool or dragging field yet, because
 * `modeStore` / the `$activeTool` slot do not exist (they arrive with the mode phase). The
 * design writes its providers in mode terms (`ctx.mode === 'build' && …`); the two below are
 * therefore expressed with the narrower context, which makes them mode-agnostic. That is
 * honest — additive click-select works in every mode today. When the mode machine lands,
 * `viewport-select` becomes the design's `build-viewport` provider and gains its ⌥ and ⌃
 * rows.
 *
 * Also interim: the scene reports no per-entity hover, so `$hoverContext` never takes the
 * `'viewport-entity'` value. The viewport provider matches BOTH viewport contexts so it
 * fires correctly either way once hover raycasting starts reporting.
 */

let registered = false;

/** Registers the shipped providers. Idempotent (StrictMode / hot-reload safe). */
export function initModifierHintProviders(): void {
  if (registered) return;
  registered = true;

  // ⌘/⌃-click and ⇧-click both add to the selection in the viewport (v1
  // `SelectionManager.handleClick` additive path). Only meaningful once something is
  // selected — with an empty selection every click is a plain pick.
  registerModifierHints('viewport-select', (ctx) =>
    ctx.hover.startsWith('viewport') && ctx.hasSelection
      ? [
          { mod: 'shift', label: 'Add to selection', priority: 20 },
          { mod: 'meta', label: 'Toggle in selection', priority: 30 },
        ]
      : [],
  );

  // The marquee: ⇧-drag from empty canvas box-selects additively, ⌥⇧-drag subtracts. Both
  // gestures are live (EditorScene's marquee handlers), so both may be advertised. They are
  // useful with an empty selection too — a plain ⇧-drag is how you box-select at all — so
  // unlike `viewport-select` this does not gate on `hasSelection`.
  registerModifierHints('marquee', (ctx) =>
    ctx.hover.startsWith('viewport')
      ? [
          { mod: 'shift', label: 'Drag box-select', priority: 40 },
          { mod: 'alt', label: 'Drag to subtract (with ⇧)', priority: 50 },
        ]
      : [],
  );

  // The two gizmo-drag modifiers, both live since P5B.18 (foundation §14.2, LOCKED #7):
  // ⌥ held AT drag start duplicates the selection and drags the copies as ONE undo step
  // (`EditorScene.beginDuplicateDrag`), and ⌃ held DURING the drag inverts snapping
  // (`applySnapToGizmo`). Advertised on the gizmo hover context, and — because nothing
  // stamps `'gizmo'` yet — also over the viewport WITH a selection, which is exactly when a
  // gizmo is on screen and both gestures are live. Never with an empty selection: there is
  // no gizmo to drag, so the hints would be a lie.
  registerModifierHints('gizmo-drag', (ctx) =>
    ctx.hover === 'gizmo' || (ctx.hover.startsWith('viewport') && ctx.hasSelection)
      ? [
          { mod: 'alt', label: 'Duplicate drag', priority: 25 },
          { mod: 'ctrl', label: 'Snap (invert while dragging)', priority: 35 },
        ]
      : [],
  );

  // DEVIATION (logged, P8.04): design-surface-assets.md §1.5 asks for the Surface-mode hint
  // `⌥ Duplicate drag · click Pick face`. Its FIRST half is already live — the `gizmo-drag`
  // provider above advertises ⌥ Duplicate drag over the viewport with a selection, in every
  // mode. Its second half is NOT a modifier gesture (a plain click), and this roster is
  // modifier-keyed by construction (`HintRow.mod: keyof HeldModifiers`), so advertising it
  // here would mean inventing a "no modifier" row the segment has no way to render. The
  // Surface status segment (`SurfaceSegment.tsx`) carries `mesh: … · face …` instead, which
  // is where the click's RESULT is visible.

  // The list hooks: ⇧ extends a range from the anchor (grow-only), ⌘/⌃ toggles one row.
  registerModifierHints('list', (ctx) =>
    ctx.hover === 'list'
      ? [
          { mod: 'shift', label: 'Range select', priority: 10 },
          { mod: 'meta', label: 'Toggle', priority: 20 },
        ]
      : [],
  );
}
