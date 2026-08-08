# Mobile audit — 2026-08-07

Four parallel audits drove the real app through Playwright at phone viewports (390×844, 360×640,
844×390 landscape), **touch-only** — no hotkeys, no hover, no mouse drags — one per area: Build,
Animation, Data + Engine, Surface. A fifth pass audited secure-context / mobile-browser APIs.

The rule the audits applied: *if the only route to a feature is a keyboard chord, a hover, or a
mouse drag, that feature does not exist on a phone.*

## Root cause of the original report ("animations don't show up on mobile")

Not an animation bug. `crypto.randomUUID` is **undefined outside a secure context**, which a phone
on a plain-HTTP LAN URL (`http://<host>:5173/flexo/`) always is. `partImport.ts` called it directly
to mint ids for imported clips, *inside* `addPart`'s `buildAnimations` callback — which runs before
`$part.set`. It threw, so the entire import rolled back: no SubParts, no animation, dialog stuck
open. Parts without animations imported fine, which made it look animation-specific.

`state/ids.ts` has had the correct `randomId()` fallback all along, and its doc comment names this
exact scenario. Three call sites had bypassed it. `src/util/secureContextApis.test.ts` now fails the
build if a fourth appears.

## Fixed

| Area | Defect | Fix |
| --- | --- | --- |
| Import | `crypto.randomUUID` aborted any animated built-in Part import off-HTTPS | `randomId()` in `partImport`, `animationStore`, `customAssetStore` |
| Archive | `crypto.subtle` undefined off-HTTPS killed archive export/import for projects with custom assets | `util/sha256.ts` pure-JS fallback, byte-identical to `crypto.subtle` (cross-device dedup depends on it) |
| Boot | unguarded `localStorage` in `buildCheck` could abort startup when Safari blocks all cookies | try/catch |
| Share | Copy button was a silent no-op off-HTTPS | selects the link + explains |
| Projects | "Multi-tab protection unavailable" blamed the browser for an `http://` origin | says which |
| Animation | imported clip left `$activeAnimationId` null → phone chip read "No clip", desktop dock read "No animation clips" while CLIPS showed 1 | import opens the first clip |
| Shell | landscape phone got the desktop shell, which needs ~880px → 11 controls off-window on an iPhone 14, 23 on an SE, no scroll | `useIsPhone` gains a short-and-coarse-pointer arm |
| Engine | **every** module editor unreachable by touch — `onPointerUp` closed the sheet before react-aria's press ran `focusModule` | `onClick`, matching Data mode |
| Animation | dopesheet had no touch route to vertical scroll — hard ceiling of ~31 joints | two-finger pan gained its Y axis |
| Animation | `Edit joint members` wrote the store but opened no sheet — no visible effect at all | pairs `openPanelSheet()`, as `PhonePaintChip` already did |
| Animation | timeline's "no members" ⚠ had the same dead-tap | same |
| Data/Engine | tapping a validation finding moved focus but never opened the sheet holding the destination | pairs `openInspectorSheet()` |
| Animation | paint chip + transport chip stacked, 4 strips deep, during the one session needing the viewport | transport yields its slot |
| Build | arming Measure left the 92dvh MenuSheet over the viewport the tool needs next | viewport-arming toggles dismiss |
| Build | tool strip Move/Rotate/Scale had no accessible name on phone | `sr-only` label |
| Window menu | Left Sidebar / Right Sidebar / Timeline were checkboxes that toggled nothing on phone | disabled with a reason (`disabledReason` now accepts a thunk) |
| Menus | phone MenuSheet advertised `⌘A` / `⌥⌘A` / `B` chords | hidden at phone density |

## Open — reported, not fixed

Ordered by severity. None of these are one-line fixes; each needs its own decision.

1. **Transform gizmo swallows viewport taps in Surface mode.** Once a placement is selected the
   gizmo footprint (~140×130px) is larger than a 1 m box renders on a phone (~110px), so most of a
   small mesh becomes un-pickable. `ToolMode` has no "off". Workaround (tap empty space first) is
   undocumented.
2. **Tooltip-only content is unreachable on touch.** react-aria's `TooltipTrigger` is hover/focus
   only. This hides the "KSA emissive is white-only" explanation and — worse — the ⚠ that is the
   *only* place the app says a template has no placements and will not be exported.
3. **Failure toasts are invisible under fullscreen phone dialogs.** `variant="fullscreen"` dialogs
   cover the `CondensedStatusBar` where danger toasts land, so "Encode failed", "Create failed" and
   "Save failed" are in the DOM but off-screen. Desktop is unaffected.
4. **Tapping a joint makes the Clip card unreachable.** `$activeJointId` clears only via an
   Esc-ladder rung (keyboard) or a clip switch; the phone Escape chip only calls `disarmTool()`.
   In a single-clip project, clip duration and mode become uneditable.
5. **Joint ⋮ submenus render at negative x** (−102, −118), truncating labels — and this is the
   designated phone fallback for the drag grip that `JointTreeSection` hides on phone.
6. **Data-mode Gimbals/Wiring cards overflow an `overflow-hidden` section** (scrollWidth 487 vs
   clientWidth 372): the phone-only "show in viewport" eye lands entirely past the right edge.
   Likely a missing `min-w-0` on `Field.tsx`'s ItemCard title.
7. **Sub-44px tap targets are the rule, not the exception.** Dopesheet rows 18px, kebabs 20×20,
   engine tree expand/add 16×16, section disclosures 16px, inputs 28px, Outliner layer headers
   packing nine 20×20 targets at a 22px pitch. The codebase already knows the fix — `DataNavigator`
   uses `isPhone ? 'size-11' : 'size-4'` — it just wasn't applied broadly. This is a sweep, not a fix.
8. **Slider scroll-stomp** (reported by the Surface audit, **not reproduced** in a follow-up
   harness): a vertical swipe starting on a slider inside a scrolling sheet rewrote its value.
   `touch-action: none` plus jump-on-pointer-down is the suspected mechanism. An attempted fix broke
   thumb dragging and was reverted — the original passes all three touch checks in isolation, so
   this needs a real-device repro before anyone touches `kit/Slider.tsx`.
9. **`navigator.storage.persist` is unavailable off-HTTPS**, so a phone using the LAN URL cannot
   request storage persistence — and iOS evicts site data after 7 days of no interaction. Projects
   created there are on a fuse with no UI hinting at it.
10. Head-truncated labels (`CoreElectricalA_...`, `CorePropulsionA_Subpart_EngineA…`) cut exactly the
    discriminating tail; `＋` on a collapsed Data section adds an item with no visible feedback;
    `safe-area-inset-top` is never applied despite `viewport-fit=cover`; Panel sheet has no close
    control while Inspector sheet has one.

## Verified genuinely fine

Numeric-input discipline holds everywhere reachable (`.06`, `-`, `-0.5` stay typable, no 0-stomp on
blur, `inputMode="url"` throughout). Sheet gestures are correct (body swipe scrolls, grabber
dismisses). No horizontal page overflow at any tested width. Every File System Access path degrades
cleanly to a zip download — no dead-ends on iOS. Add SubPart / Add Part, multi-select (row toggle
and Box Select), `TouchNudgeCluster` (44px), the glow painter, `EasingCurveEditor` (41px grab
circles), Paint-in-3D, and long-press-to-retime all work touch-only.
