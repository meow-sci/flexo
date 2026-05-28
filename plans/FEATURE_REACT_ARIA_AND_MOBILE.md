# problem

right now we are using a combination of react-aria and cladd components

i want to shift to all customize react-aria components and eliminate cladd

a new core goal is to support mobile and desktop and react-aria excels here compared to cladd

this will require creating custom react-aria components, tailwind styling is fine.

- MUST create reusable styled component patterns, i DONT want to repeat huge sets of tailwind classes every time a <Select> is used, for example.  centralize this using appropriate React/Tailwind patterns.
- MUST use good design principles and architecture for sensible componentization
- change cladd toolbar to react-aria Toolbar
- use lucide icons for svg icons (ask me whenever there is no obvious icon to choose and i will pick one)
- all UI must account for Desktop/Tablet (use same design) or Phone friendly designs, utilize react-aria and tailwind best practices to accomplish this

use the react-aria and cladd skills in .agents/skills 

do a deep dive analysis and make a detailed plan to refactor our current UI with new well designed architecture, reusable styled components, centralized styling and put a plan into the `# plan` section of @plans/FEATURE_REACT_ARIA_AND_MOBILE.md and then implement that plan expertly as a react and ui and tailwind expert

# plan

## Goals & decisions

- Eliminate `@cladd-ui/react` entirely; rebuild every piece of chrome on
  `react-aria-components` with Tailwind v4 styling.
- Centralize styling so a `<Select>` / `<Button>` usage is a single tag, never a
  repeated blob of Tailwind classes. Done via **tailwind-variants** (`tv`) +
  **tailwindcss-react-aria-components** plugin (short `selected:`/`pressed:` state
  modifiers) + a tiny `composeTailwindRenderProps` helper.
- Visual identity: **refreshed dark theme**, primary accent = radioactive green
  `#2cfa1f`. All color usage routed through semantic Tailwind `@theme` tokens
  (no more `cladd-*`).
- **Responsive:** desktop + tablet share one design (floating panels). Phone
  (≤ `sm`, ~640px) reshapes to a draggable **bottom sheet** for the inspector and
  a compact top bar with an **overflow menu** for secondary toolbar actions.
- Delivered in 3 verified phases; `@cladd-ui/react` stays installed until the
  last cladd import is removed (end of Phase 2).

## Design tokens (Phase 1, `src/index.css`)

Semantic Tailwind `@theme` color tokens (dark), e.g.:
`canvas, panel, panel-raised, panel-sunken, overlay, border, border-strong,
fg, fg-muted, fg-subtle, accent, accent-hover, accent-press, accent-fg,
danger, danger-fg, warning, warning-fg`. Radius/elevation tokens for popovers.
Accent ramp keyed to `#2cfa1f`; `accent-fg` is a near-black green for legible
text/icons on the bright accent.

## Component kit (Phase 1, `src/ui/kit/`)

One file per primitive, each owning its variants via `tv`:
`styles.ts` (focusRing, helpers) · `Button` · `ToggleButton`(+Group) ·
`Toolbar`(+Separator, +Bar surface) · `TextField`/`Input` · `NumberField`
(stepper) + rebuilt `PreciseNumberInput` · `SearchField` · `Select`
(Select+Popover+ListBox) · `ListBox` · `Menu`(+Trigger/Item/Submenu) ·
`Popover` (styled surface) · `Modal`/`Dialog` (+ full-screen + bottom-sheet
variants) · `ConfirmDialog` (replaces cladd `useDialog`) · `Checkbox` · `Switch`
· `Slider` · `Tooltip` · `Tag`/`TagGroup` + `Chip` · `ProgressBar` ·
`Separator` · `SectionTitle`/`Label` · `Toast` (global `ToastQueue` + `toast()`
+ `<GlobalToastRegion>` replacing cladd `useToast`). Barrel `index.ts`.
Plus `useIsPhone()` (matchMedia) for layout branching.

## Phase 2 — swap cladd surface-by-surface

Replace cladd imports in every `src/ui/*` file with the kit, and replace all
`cladd-*` color classes (incl. 3D preview panels, LoadProgress) with the new
tokens. Order: Toolbar/buttons → SelectionToolbar/MultiSelectToolbar →
RightPanel/PlacementList/TransformInspector/LayersPanel → popups (Add Part/
SubPart, Settings, PartData, Export, Project) → EditorTagsField/History.
Remove `CladdProvider` + cladd CSS import; mount `<GlobalToastRegion>`.
Uninstall `@cladd-ui/react`. Typecheck + run.

## Phase 3 — responsive / mobile shell

- App shell branches on `useIsPhone()`: inspector → bottom sheet (drag handle,
  snap heights), top toolbar → compact primary actions + overflow `Menu`.
- Touch target sizing (≥ 44px) via component `size` props; selection toolbars
  reflow; full-screen browser popups already adapt.
- Verify on a narrow viewport.
