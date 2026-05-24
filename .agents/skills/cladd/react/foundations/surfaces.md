---
title: "Surfaces"
description: "Surface levels, tone tokens, extending the ramp, and the content composition rules that drive every cladd panel."
links:
  doc: https://cladd.io/react/foundations/surfaces/
---

# Surfaces

Surfaces are the layered, level-aware containers cladd is built on. Every panel, card, button, toolbar, dialog, and recessed input ultimately wraps a [`Surface`](/react/components/surface/) or a [`SurfaceCut`](/react/components/surface-cut/) — and they all share one **depth model**: a numeric `level` that drives the background tone via OKLCH color mixing.

This page covers the **underlying system**: how levels are computed, the tokens you can use to build your own surface-aware elements, how to extend the ramp past five levels, how to retune the tone delta, and the composition rules that make `wrapContent` / `contentClassName` predictable. For the prop reference on the components themselves, see [`Surface`](/react/components/surface/) and [`SurfaceCut`](/react/components/surface-cut/).

## Levels

Every surface in cladd resolves to a level — an integer from `1` (the page) to `5` (the deepest panel). Each step up the ramp tints the surface fill a little further toward `--cladd-surface-mix-color` (white in dark mode, black in light mode), so deeper levels read as raised — or, for [`SurfaceCut`](/react/components/surface-cut/), recessed.

A [`Surface`](/react/components/surface/) with no `level` prop reads its parent's level from context and renders **one step deeper**. Stack them and each child sits one shade above its container, automatically.

![Levels stack](https://cladd.io/screenshots/foundations/surfaces/levels-stack.png)

```tsx
<Surface level={1} outline className="rounded-cladd-lg p-3">
  <span className="font-mono text-xs text-cladd-fg-soft">level 1</span>
  <Surface outline className="mt-2 rounded-cladd-md p-3">
    <span className="font-mono text-xs text-cladd-fg-soft">level 2</span>
    <Surface outline className="mt-2 rounded-cladd-md p-3">
      <span className="font-mono text-xs text-cladd-fg-soft">
        level 3
      </span>
      <Surface outline className="mt-2 rounded-cladd-md p-3">
        <span className="font-mono text-xs text-cladd-fg-soft">
          level 4
        </span>
        <Surface outline className="mt-2 rounded-cladd-md p-3">
          <span className="font-mono text-xs text-cladd-fg-soft">
            level 5
          </span>
        </Surface>
      </Surface>
    </Surface>
  </Surface>
</Surface>
```

Under the hood, every `cladd-surface-level-N` class sets a single CSS variable — `--cladd-surface-multiplier` — to `N − 1`. The surface tokens then mix the base surface color with the mix color, scaled by that multiplier:

```css
.cladd-surface-level-1 {
  --cladd-surface-multiplier: 0;
}
.cladd-surface-level-2 {
  --cladd-surface-multiplier: 1;
}
.cladd-surface-level-3 {
  --cladd-surface-multiplier: 2;
}
.cladd-surface-level-4 {
  --cladd-surface-multiplier: 3;
}
.cladd-surface-level-5 {
  --cladd-surface-multiplier: 4;
}
```

That's the whole mechanic. The `bg-cladd-surface` utility resolves to a `color-mix(...)` that reads the multiplier — so any element inside a `cladd-surface-level-N` automatically picks up the right tone.

### Extending the ramp

Adding more levels is one CSS rule per step. There's no need to redefine the mixing formula or touch any other variable:

```css
.cladd-surface-level-6 {
  --cladd-surface-multiplier: 5;
}
.cladd-surface-level-7 {
  --cladd-surface-multiplier: 6;
}
/* …keep going as far as you need */
```

Add those once next to your Tailwind setup, and `bg-cladd-surface`, `bg-cladd-surface-prev`, `-next`, `-minus`, `-plus`, and `bg-cladd-surface-cut` all keep working at the new levels — they're all defined in terms of `--cladd-surface-multiplier`.

![Extend levels](https://cladd.io/screenshots/foundations/surfaces/extend-levels.png)

```tsx
<div className="flex flex-wrap items-center gap-2">
  {[1, 2, 3, 4, 5, 6, 7].map((level) => (
    <div
      key={level}
      className={`flex h-16 w-20 items-center justify-center rounded-cladd-md bg-cladd-surface shadow-cladd-outline cladd-surface-level-${level}`}
      style={
        {
          '--cladd-surface-multiplier': level - 1,
        } as CSSProperties
      }
    >
      <span className="font-mono text-xs text-cladd-fg-soft">
        L{level}
      </span>
    </div>
  ))}
</div>
```

The [`Surface`](/react/components/surface/) component itself clamps `level` to `[1, 5]` — if you extend the ramp and want to render a [`Surface`](/react/components/surface/) at level 6, you'll need to apply the class directly (`<div className="cladd-surface-level-6 bg-cladd-surface" />`) or bump the component's clamp in a fork. For app-level density, five is usually plenty.

### Tuning the tone delta

The amount each step shifts is controlled by two variables on the theme root:

```css
:root {
  --cladd-surface-mix-amount: 6%; /* dark mode */
  --cladd-surface-mix-color: var(--cladd-surface-white);
}

:root.light {
  --cladd-surface-mix-amount: 4%; /* light mode (cladd default) */
  --cladd-surface-mix-color: var(--cladd-surface-black);
}
```

`--cladd-surface-mix-amount` is the per-step delta — raise it for a more dramatic ramp, lower it for subtler nesting. `--cladd-surface-mix-color` is the direction: mixing toward white lifts each level (dark-mode default), mixing toward black recesses each level (light-mode default).

![Tone delta](https://cladd.io/screenshots/foundations/surfaces/tone-delta.png)

```tsx
<div className="flex flex-1 flex-col gap-2">
  <span className="font-mono text-xs text-cladd-fg-soft">
    Default (6% / 4%)
  </span>
  <div className="cladd-surface-level-1 flex h-12 items-center justify-center rounded-cladd-sm bg-cladd-surface shadow-cladd-outline">
    <span className="font-mono text-xs text-cladd-fg-soft">L1</span>
  </div>
  <div
    className="cladd-surface-level-2 flex h-12 items-center justify-center rounded-cladd-sm bg-cladd-surface shadow-cladd-outline"
    style={{ '--cladd-surface-multiplier': 1 } as CSSProperties}
  >
    <span className="font-mono text-xs text-cladd-fg-soft">L2</span>
  </div>
  <div
    className="cladd-surface-level-3 flex h-12 items-center justify-center rounded-cladd-sm bg-cladd-surface shadow-cladd-outline"
    style={{ '--cladd-surface-multiplier': 2 } as CSSProperties}
  >
    <span className="font-mono text-xs text-cladd-fg-soft">L3</span>
  </div>
  <div
    className="cladd-surface-level-4 flex h-12 items-center justify-center rounded-cladd-sm bg-cladd-surface shadow-cladd-outline"
    style={{ '--cladd-surface-multiplier': 3 } as CSSProperties}
  >
    <span className="font-mono text-xs text-cladd-fg-soft">L4</span>
  </div>
</div>
<div
  className="flex flex-1 flex-col gap-2"
  style={{ '--cladd-surface-mix-amount': '14%' } as CSSProperties}
>
  <span className="font-mono text-xs text-cladd-fg-soft">
    Tuned (14%)
  </span>
  <div className="cladd-surface-level-1 flex h-12 items-center justify-center rounded-cladd-sm bg-cladd-surface shadow-cladd-outline">
    <span className="font-mono text-xs text-cladd-fg-soft">L1</span>
  </div>
  <div
    className="cladd-surface-level-2 flex h-12 items-center justify-center rounded-cladd-sm bg-cladd-surface shadow-cladd-outline"
    style={{ '--cladd-surface-multiplier': 1 } as CSSProperties}
  >
    <span className="font-mono text-xs text-cladd-fg-soft">L2</span>
  </div>
  <div
    className="cladd-surface-level-3 flex h-12 items-center justify-center rounded-cladd-sm bg-cladd-surface shadow-cladd-outline"
    style={{ '--cladd-surface-multiplier': 2 } as CSSProperties}
  >
    <span className="font-mono text-xs text-cladd-fg-soft">L3</span>
  </div>
  <div
    className="cladd-surface-level-4 flex h-12 items-center justify-center rounded-cladd-sm bg-cladd-surface shadow-cladd-outline"
    style={{ '--cladd-surface-multiplier': 3 } as CSSProperties}
  >
    <span className="font-mono text-xs text-cladd-fg-soft">L4</span>
  </div>
</div>
```

Both can be scoped to a region by setting them on a wrapper. You don't have to retune the whole theme — a single panel can have its own contrast policy by overriding the variables locally.

## Surface tokens

Every surface fill is exposed as a Tailwind utility. They all read the current level's `--cladd-surface-multiplier` and apply a `color-mix` against `--cladd-surface-mix-color`, so the same class name picks up the right tone wherever it lands in the level stack.

![Surface tokens](https://cladd.io/screenshots/foundations/surfaces/surface-tokens.png)

```tsx
<Surface
  level={3}
  contentClassName="flex flex-col gap-2"
  className="rounded-2xl p-4"
  outline
  variant="solid"
>
  <span className="font-mono text-xs">Surface Level 3</span>
  <span className="bg-cladd-surface-prev px-4 py-2 font-mono">
    bg-cladd-surface-prev
  </span>
  <span className="bg-cladd-surface-minus px-4 py-2 font-mono">
    bg-cladd-surface-minus
  </span>
  <span className="bg-cladd-surface px-4 py-2 font-mono">
    bg-cladd-surface
  </span>
  <span className="bg-cladd-surface-plus px-4 py-2 font-mono">
    bg-cladd-surface-plus
  </span>
  <span className="bg-cladd-surface-next px-4 py-2 font-mono">
    bg-cladd-surface-next
  </span>
  <span className="bg-cladd-surface-cut px-4 py-2 font-mono">
    bg-cladd-surface-cut
  </span>
  <span className="bg-cladd-surface-highlight px-4 py-2 font-mono">
    bg-cladd-surface-highlight
  </span>
</Surface>
```

| Token                        | Renders                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `bg-cladd-surface`           | The surface fill **at the current level**.                                                                         |
| `bg-cladd-surface-prev`      | One level back. The color the parent surface would have.                                                           |
| `bg-cladd-surface-next`      | One level forward. The color a child surface would auto-bump to.                                                   |
| `bg-cladd-surface-minus`     | Half-step back. Useful for inner dividers that need to recess slightly without going a full level.                 |
| `bg-cladd-surface-plus`      | Half-step forward. Useful for nudging an element above its container without a full level bump.                    |
| `bg-cladd-surface-cut`       | The recessed fill used by [`SurfaceCut`](/react/components/surface-cut/) — darker than the surface, in both modes. |
| `bg-cladd-surface-highlight` | The lighter top color used in the `gradient` surface variant. Mostly internal — you'll rarely apply it directly.   |

There are also state tokens for interactive surfaces: `bg-cladd-surface-hover`, `bg-cladd-surface-hover-fill` (for accent-filled surfaces), and `bg-cladd-surface-pressed`. These are translucent overlays — the underlying `Surface` and `Button` apply them automatically when `hoverable` / `clickable` are on, but you can reach for them directly when building custom interactive elements.

The `prev` / `next` / `minus` / `plus` tokens compute correctly even at level 1 or the deepest level — the variables clamp at the multiplier boundaries, so you won't get inverted or out-of-range colors.

## Building a custom surface-aware element

You don't always need a [`Surface`](/react/components/surface/) component. When you're hand-rolling a panel — a fixed layout, a custom shape, a small primitive that shouldn't carry the full Surface API — combine **two classes** and you get the same level-aware fill:

```tsx
<div className="cladd-surface-level-3 bg-cladd-surface shadow-cladd-outline rounded-cladd-md">
  …
</div>
```

The first class publishes the level (sets `--cladd-surface-multiplier`). The second resolves to the surface fill at that level. Add `shadow-cladd-outline` for the ring and `rounded-cladd-md` for the corner — that's a passable surface in three utilities.

![Custom surface element](https://cladd.io/screenshots/foundations/surfaces/custom-surface-element.png)

```tsx
<Surface level={3} outline className="rounded-cladd-md">
  <div className="flex items-center gap-3 px-4 py-3">
    <span className="font-mono text-xs text-cladd-fg-soft">
      &lt;Surface level=&#123;3&#125; outline&gt;
    </span>
  </div>
</Surface>
<div className="cladd-surface-level-3 rounded-cladd-md bg-cladd-surface shadow-cladd-outline">
  <div className="flex items-center gap-3 px-4 py-3">
    <span className="font-mono text-xs text-cladd-fg-soft">
      cladd-surface-level-3 + bg-cladd-surface
    </span>
  </div>
</div>
```

You can also drop the level class and let context provide it — any element inside a [`Surface`](/react/components/surface/) already sits inside a `cladd-surface-level-N` ancestor, so `bg-cladd-surface` on a plain `<div>` inside a [`Surface`](/react/components/surface/) will pick up that surface's level.

Use a real [`Surface`](/react/components/surface/) when you need its variants, hover/clickable states, accent prop, context propagation, focus ring, or polymorphic root. Use the utility pair when you don't need any of that and just want a tone-correct box.

## Content composition

Both [`Surface`](/react/components/surface/) and [`SurfaceCut`](/react/components/surface-cut/) split their styling into **two slots**:

- `className` — shapes the **box**: width, height, corner radius, accent token, outline.
- `contentClassName` — shapes the **inner layout**: padding, `flex`, `grid`, `gap`, alignment.

The split exists because surfaces render in three stacked layers — a root, an absolutely-positioned background fill, and a content wrapper. `className` ends up on the root; the layout you put on the children needs to land on the inner wrapper, which is what `contentClassName` targets.

This is the single most common thing to get wrong. Putting `flex` and `p-4` on `className` does nothing useful — the flex container becomes the outer root, but the children live inside a separate wrapper one layer deeper.

![Wrap content wrong](https://cladd.io/screenshots/foundations/surfaces/wrap-content-wrong.png)

```tsx
<div className="flex flex-col gap-2">
  <span className="font-mono text-xs text-cladd-fg-soft">
    Don&apos;t — flex/padding on className
  </span>
  <Surface
    outline
    className="flex items-center gap-3 rounded-cladd-md p-4"
  >
    <Chip color="red">Status</Chip>
    <span className="text-sm">Layout doesn&apos;t apply to children</span>
  </Surface>
</div>
<div className="flex flex-col gap-2">
  <span className="font-mono text-xs text-cladd-fg-soft">
    Do — flex/padding on contentClassName
  </span>
  <Surface
    outline
    className="rounded-cladd-md"
    contentClassName="flex items-center gap-3 p-4"
  >
    <Chip color="green">Status</Chip>
    <span className="text-sm">Children laid out correctly</span>
  </Surface>
</div>
```

If you find yourself wanting to wrap a [`Surface`](/react/components/surface/)'s children in your own `<div className="flex p-4">`, **don't** — that's what `contentClassName` is for. Adding an extra wrapper makes the DOM heavier, breaks `h-full` flows, and signals to a reader that the component is being fought instead of used.

### Bypassing the wrapper with `wrapContent`

There's one case where you do want to skip the inner wrapper: when you need **multiple stacked content slots** with their own padding (a header row + a body row, each padded independently), or when you want full DOM control of the inner tree. Pass `wrapContent={false}` and `children` render as direct siblings of the background and overlay layers.

![Wrap content bypass](https://cladd.io/screenshots/foundations/surfaces/wrap-content-bypass.png)

```tsx
<Surface outline className="w-full rounded-cladd-md" wrapContent={false}>
  <div className="relative border-b border-cladd-outline px-4 py-2">
    <span className="font-mono text-xs text-cladd-fg-softer">Header</span>
  </div>
  <div className="relative flex items-center gap-3 px-4 py-3">
    <Chip color="blue">Body</Chip>
    <span className="text-sm">
      Stacked sections with their own padding
    </span>
  </div>
</Surface>
```

There's one gotcha when you do this: the background layer (and the hover/press overlay layer, when `hoverable` / `clickable` is on) is `position: absolute inset-0`, which paints **above** normal-flow siblings. Children rendered without `wrapContent` need `position: relative` (the Tailwind `relative` class) on each direct child so they lift above those layers into the same stacking context. The default `SurfaceContent` wrapper sets this for you — when you skip it, you take that responsibility back. Without `relative`, your content visually disappears behind the surface fill.

`contentClassName` has no effect when `wrapContent` is `false` — the wrapper it would style isn't being rendered. Reach for this sparingly: most surfaces only need one content area, and the default `wrapContent={true}` + `contentClassName` is the right tool nine times out of ten.

## Cut vs Surface

[`SurfaceCut`](/react/components/surface-cut/) is the **recessed** counterpart to [`Surface`](/react/components/surface/). It uses a single bg token (`bg-cladd-surface-cut`) — darker than the surface around it — and an inset outline shadow that reads as pressed-into rather than raised-from. The two components are interchangeable in the layout API (`className`, `contentClassName`, `wrapContent`, `as`, `color`), but they differ in two important ways:

- **The visual.** Surface looks raised; Cut looks inset. Inputs, recessed buttons, and any element that should read as "pressed into" its parent want Cut.
- **The level context.** A [`Surface`](/react/components/surface/) publishes `currentLevel + 1` to its children, so nested content auto-bumps deeper. A [`SurfaceCut`](/react/components/surface-cut/) publishes `currentLevel − 1` — children render at the **parent's** level, not deeper. That's what makes a cut feel like a "well" carved into the surface rather than a new layer stacked on top.

![Cut vs surface](https://cladd.io/screenshots/foundations/surfaces/cut-vs-surface.png)

```tsx
<Surface
  outline
  level={2}
  className="w-full rounded-cladd-lg"
  contentClassName="flex flex-col gap-3 p-4"
>
  <span className="font-mono text-xs text-cladd-fg-soft">
    Surface L2 (outer)
  </span>
  <Surface
    outline
    className="rounded-cladd-md"
    contentClassName="p-4 text-sm"
  >
    Nested Surface — auto-bumps to L3
  </Surface>
  <SurfaceCut
    outline
    className="rounded-cladd-md"
    contentClassName="flex flex-col gap-4 p-4 text-sm"
  >
    <span>Nested SurfaceCut (recessed)</span>
    <Surface
      outline
      className="rounded-cladd-sm"
      contentClassName="p-4 text-sm"
    >
      Surface inside Cut — back to L2
    </Surface>
  </SurfaceCut>
  <div className="flex items-center gap-2">
    <Button>Save</Button>
    <Button surface="cut">Cancel</Button>
  </div>
</Surface>
```

This is also why [`Button`](/react/components/button/) exposes a `surface="cut"` option — it swaps the underlying primitive for a recessed look that fits naturally inside denser toolbars and input rows, without changing any other prop.

## Pitfalls

- **Don't put `flex` / `grid` / `p-*` on `className`.** Those belong on `contentClassName`. Putting them on `className` styles the outer box, not the children — the layout silently doesn't apply.
- **Don't wrap [`Surface`](/react/components/surface/) children in your own `<div className="flex p-4">`.** That's what `contentClassName` is for. Wrapping signals you're working against the component instead of with it.
- **Don't reach for `wrapContent={false}` just to get padding right.** If you only have one content area, you almost never need it. Use it only when you have multiple stacked slots that each need their own padding, or you genuinely need full DOM control.
- **When you do use `wrapContent={false}`, put `relative` on every direct child.** The bg layer (and the hover/press overlay layer, when used) is absolutely positioned and paints above normal-flow siblings — without `relative`, your content disappears behind the surface fill. The default `SurfaceContent` wrapper handles this for you; bypassing it means you handle it yourself.
- **Don't override `--cladd-surface-multiplier` to "skip" a level on a real [`Surface`](/react/components/surface/).** Use the `level` prop instead — it goes through the same clamp and context-propagation logic that nested children depend on. Setting the variable directly works for hand-rolled divs but breaks the inheritance for real cladd components inside.
- **Don't apply `bg-cladd-surface` to an element with no `cladd-surface-level-*` ancestor and no accent class.** The leveled tokens only compute on elements that match `[class*="cladd-surface-level-"]` or `[class*="cladd-color-"]`. Outside both, `bg-cladd-surface` falls back to the base surface color, which is fine — but `bg-cladd-surface-next` and friends will resolve to the same thing as `-prev`, because there's no multiplier to step from.
- **Don't add a [`SurfaceCut`](/react/components/surface-cut/) expecting children to render deeper.** Cut shifts context **back** one level on purpose. If you want a deeper child inside a cut, set `level` on that child explicitly.
