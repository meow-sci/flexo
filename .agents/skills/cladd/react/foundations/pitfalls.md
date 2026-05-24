---
title: "Pitfalls"
description: "Common anti-patterns that make cladd code feel generic — and the primitive, token, or prop to reach for instead."
links:
  doc: https://cladd.io/react/foundations/pitfalls/
---

# Pitfalls

These are the moves that make cladd code feel generic — the failure mode the kit cares most about. Most of them stem from the same instinct: when a `<div>` with cladd Tailwind tokens _looks right_, there's almost always a primitive that does the job better and reads as native cladd code. The rules below are the ones that matter most in practice.

## Reinventing primitives

Cladd ships application-grade controls — [`Toolbar`](/react/components/toolbar/), [`List`](/react/components/list/), [`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), [`SectionTitle`](/react/components/section-title/) — specifically so you don't have to assemble them from `<div>`s. The most common failure mode is styling a `<div>` to look like one instead of reaching for the real component.

- **Don't** assemble a button row with `<div className="flex gap-2">` — that's a [`Toolbar`](/react/components/toolbar/).
- **Don't** style a `<span>` with rounded background and small padding for a tag — that's a [`Chip`](/react/components/chip/).
- **Don't** build a vertical menu with `<ul>` and per-row classes — that's a [`List`](/react/components/list/) with [`ListButton`](/react/components/list/) rows.
- **Don't** type `⌘K` into a `<kbd>` — that's a [`Shortcut`](/react/components/shortcut/).

Reach for the primitive even if the styled `<div>` "works". Context-aware behaviour — toolbar forwarding `size` to children, list rows sharing rhythm, chip auto-shrinking to nested height inside a button — only kicks in when the real component is in the tree.

## Surface misuse

[`Surface`](/react/components/surface/) is the foundational container, and most `<div>`s that pile up `bg-*`, `border`, and `rounded-*` together are really Surfaces. Two surface-specific traps are also common:

- **Don't** write `<div className="bg-cladd-surface border border-cladd-outline rounded-2xl">`. That's literally what [`Surface`](/react/components/surface/) is, and it gets the contextual depth, accent ring, and `variant` / `outline` API you'd be reinventing.
- **Don't** nest a [`SurfaceCut`](/react/components/surface-cut/) inside another `SurfaceCut`. Recessed-on-recessed produces no visible depth — the inner one looks broken. To lift a panel back up above a recessed parent, use a `Surface` with `surfaceLevel="+1"`, not another cut.
- **Don't** stack `Surface` wrappers to "feel deeper". Surfaces track depth via `surfaceLevel` and context — adding wrappers without changing the level isn't visible to the reader, only to the DOM.

If you find yourself reaching for cladd Tailwind tokens with `border` and `rounded-*`, ask whether the right answer is a `Surface` instead.

## Sizing

The seven-step `2xs → 2xl` scale is a contract. [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), and [`Spinner`](/react/components/spinner/) all assume you pass the same `size` token everywhere in a row, and that nested-ramp pieces will auto-fit. The most common violations:

- **Don't** pick `2xs` or `xs` for a standalone control. At `2xs`, nested-ramp components are only 8 px tall — unreadable as a standalone. Those sizes are reserved for elements rendered _inside_ a denser container (a clear button inside an [`Input`](/react/components/input/), a `⌘K` hint inside a [`SearchField`](/react/components/search-field/)).
- **Don't** mix sizes in a row to fit content. If a `Chip` "looks too tall" next to its label, the label is the wrong size, not the Chip.
- **Don't** override heights with `h-*` or `size-*` Tailwind utilities on sized cladd components. The component already honours `size` through `h-cladd-*` classes; stacking `h-7` on top fights the scale and breaks the nesting math.
- **Don't** size icons inside a [`Button`](/react/components/button/) or [`Chip`](/react/components/chip/). Both apply a size-matched dimension to direct `<svg>` children (Button: 12–16 px, Chip: 6–16 px across the scale). A `className="size-3.5"` on the icon is a no-op because the parent's selector wins — only `size-3.5!` would override it, and you almost never need to. Pass the right `size` to the parent and the icon follows.
- **Don't** put `<Input size="sm">` next to `<Button size="md">`. Input's floating label needs the `lg` row to breathe; at `sm` it crowds the value.

Default to `md`; reach for `lg` for primary inputs and hero CTAs. The full per-size height table lives in [Sizing](/react/foundations/sizing/).

## Color & accent

Cladd ships eleven accent tokens, each carrying a specific role (`green` for success, `red` for destructive, `brand` for the app accent, etc.). Mixing them noisily or substituting Tailwind palette colors makes the UI read as generic.

- **Don't** stack three different accents in a single toolbar. Pick one — usually the app accent — plus at most one semantic accent on the loud action (a green `Publish`, a red `Delete`).
- **Don't** override accent with raw text utilities (`text-red-500`, `text-blue-400`). Use the component's `color` prop, or `text-cladd-primary` for the app accent — named tokens retune correctly with theme and respect the OKLCH variables.
- **Don't** introduce arbitrary hex colors when an accent token would do. If you find yourself reaching for `bg-[#5d8cff]`, you wanted `color="brand"`.

The full eleven-token palette and how to retune them lives in [Colors](/react/foundations/colors/).

## Tokens

The exposed Tailwind tokens are intentionally a small set. There is no `bg-cladd-surface-2` or `text-cladd-fg-2`, and substituting raw Tailwind palette colors breaks theme/accent retuning.

- **Don't** invent suffixes — `bg-cladd-surface-2`, `text-cladd-fg-2`, `border-cladd-outline-strong` — they don't exist. The exposed names are listed on [Quickstart](/react/foundations/quickstart/).
- **Don't** substitute `text-white` / `text-zinc-400` for `text-cladd-fg` / `text-cladd-fg-soft`. The cladd tokens retune correctly across themes; native palette colors don't.
- **Don't** put accent colors directly in `style={{ color: '...' }}`. If a component has a `color` prop, use it; otherwise reach for `text-cladd-primary` for the app accent.

## Density

The kit is intentionally dense by default. A 28 px `md` button is smaller than what most kits ship as their default — resist the urge to size up.

- **Don't** default to `lg` everywhere. Toolbars, header rows, list rows, and inspector panels all want `md`. `lg` is reserved for primary inputs and hero CTAs.
- **Don't** add per-row breathing room with extra padding or margin. If a row feels cramped at `md`, the issue is usually that an `Input` or `Toolbar` is already supplying its own padding — strip the outer space, not the component's.
- **Don't** treat cladd like a marketing kit. The defaults are tuned for editor sidebars, kanban boards, settings panels — information-rich screens. The space budget is tighter than most kits assume.

When in doubt: `md`.
