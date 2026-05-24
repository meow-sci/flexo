---
title: "SurfaceCut"
description: "SurfaceCut is the recessed counterpart to Surface — for inset slots, fields, code blocks, and any UI that should read as carved into the parent."
links:
  doc: https://cladd.io/react/components/surface-cut/
  api: https://cladd.io/react/components/surface-cut/#api-reference
---

# SurfaceCut

`SurfaceCut` is the recessed counterpart to [`Surface`](/react/components/surface/). Where `Surface` reads as a panel sitting **on top of** its container, `SurfaceCut` reads as a slot **carved into** it — darker fill, an inset outline, no depth level of its own. Reach for it whenever a region should feel inset rather than raised: input wrappers, code blocks, status pills, settings rows, and the troughs that hold sliders, scrubbers, and toolbars.

This page covers `SurfaceCut` together with its content slot, `SurfaceCutContent`.

![Overview](https://cladd.io/screenshots/components/surface-cut/overview.png)

```tsx
<Surface
  outline
  className="w-80 rounded-2xl"
  contentClassName="flex flex-col gap-4 p-4"
>
  <div className="flex flex-col gap-1">
    <div className="font-semibold">SurfaceCut</div>
    <div className="text-cladd-fg-soft">
      The recessed counterpart to Surface — for inset slots, fields, and
      wells.
    </div>
  </div>
  <SurfaceCut
    className="rounded-xl"
    contentClassName="flex items-center justify-between px-4 py-2"
  >
    <span className="font-mono text-cladd-fg-soft">PORT</span>
    <span className="font-mono">3000</span>
  </SurfaceCut>
</Surface>
```

## Usage

```tsx
import { SurfaceCut } from '@cladd-ui/react';

<SurfaceCut className="rounded-xl" contentClassName="flex gap-2 px-4 py-2">
  <span>PORT</span>
  <span>3000</span>
</SurfaceCut>;
```

`SurfaceCut` is built from the same three-layer model as [`Surface`](/react/components/surface/) — see [Anatomy](#anatomy) below. The short version: `className` styles the outer box (size, corner radius, accent color), `contentClassName` styles the inner content area (padding, `flex`, `grid`). Putting `flex p-4` on `className` won't lay out the children, because the children live one wrapper deeper.

## Anatomy

A `SurfaceCut` renders up to four layers, in this order:

1. **Root element** — the polymorphic node (`div` by default, swappable via `as`). Carries `className`, the accent-color class (`cladd-color-{name}`), and any forwarded element props. Positioned `relative` so the other layers can sit inside it.
2. **Background layer** — an absolutely-positioned `div` sized to the root. Paints the recessed fill (`bg-cladd-surface-cut`) and the inset outline ring (when `outline`). There's no `bgClassName` here — the cut's fill is fixed, by design.
3. **Overlay layer** — an absolutely-positioned sibling of the bg, rendered only when `hoverable` or `clickable` is on. Paints the hover and pressed tints. Where it stacks is controlled by `overlayPosition`: `'above'` (default) places it above the content so the tint covers everything; `'below'` places it between the bg and the content so the tint only sits on the fill. Style it via `overlayClassName`.
4. **Content wrapper** — a `relative h-full` `div` (`SurfaceCutContent`) that wraps `children`. The `relative` positioning lifts the content above the absolute bg and overlay layers so the children render on top of the recessed fill. It has no padding or layout of its own — that's `contentClassName`'s job.

This split is why `className` and `contentClassName` are separate props. `className` shapes the **box**: width, rounded corners, accent token. `contentClassName` shapes the **content layout**: padding, `flex`, `grid`, gap, alignment. The two never collide.

Unlike `Surface`, `SurfaceCut` has no level prop and no variants — its fill is fixed, and it doesn't participate in depth stacking. Internally it publishes `parent − 1` to its descendants, so a default `Surface` rendered inside a cut auto-bumps back to the parent's level rather than continuing to climb.

### Bypassing the content wrapper

Pass `wrapContent={false}` to render `children` directly instead of wrapping them in `SurfaceCutContent`. You rarely need this — the default wrapper is invisible until you put styles on it via `contentClassName`. Reach for it only when you want multiple stacked content slots (e.g. header / divider / body, each in its own `SurfaceCutContent`), or you want to opt out of the default `h-full` behavior via `SurfaceCutContent`'s `fullHeight` prop (see the [full height example](#full-height)).

## Surface vs SurfaceCut

`Surface` and `SurfaceCut` are visual opposites built from the same primitive. Use `Surface` when content should feel raised, `SurfaceCut` when it should feel sunken. They compose: a cut slot inside a raised panel is the canonical "inset field on a card" pattern.

![Surface vs cut](https://cladd.io/screenshots/components/surface-cut/surface-vs-cut.png)

```tsx
<Surface
  outline
  className="w-96 rounded-2xl"
  contentClassName="grid grid-cols-2 gap-4 p-4"
>
  <Surface
    outline
    className="rounded-xl"
    contentClassName="flex items-center justify-center px-4 py-6 font-medium"
  >
    Surface
  </Surface>
  <SurfaceCut
    className="rounded-xl"
    contentClassName="flex items-center justify-center px-4 py-6 font-medium"
  >
    SurfaceCut
  </SurfaceCut>
</Surface>
```

## Examples

### Outline

`outline` is **on by default** — the inset ring is what sells the "carved" look. Turning it off leaves only the darker fill, useful when the cut is bordered by something else (a divider, another surface) or when you want a softer well.

![Outline](https://cladd.io/screenshots/components/surface-cut/outline.png)

```tsx
<Surface outline className="rounded-2xl" contentClassName="p-4">
  <SurfaceCut
    outline={outline}
    className="rounded-xl"
    contentClassName="px-10 py-8 font-medium"
  >
    SurfaceCut
  </SurfaceCut>
</Surface>
```

### Colors

The accent token (`cladd-color-{name}`) flows down through context, so the cut picks up its color from any ancestor that sets one. In the demo below, `color` is set on the wrapping `Surface` and the inner `SurfaceCut` inherits it — most visible on the hover and pressed overlays since the cut itself is `hoverable` and `clickable`.

You can also set `color` directly on the `SurfaceCut` if you want the cut to differ from its parent — same eleven tokens (`neutral`, `brand`, `red`, `pink`, `purple`, `blue`, `cyan`, `lime`, `green`, `yellow`, `orange`).

![Colors](https://cladd.io/screenshots/components/surface-cut/colors.png)

```tsx
<Surface
  color={color}
  outline
  className="rounded-2xl"
  contentClassName="p-4"
>
  <SurfaceCut
    as="button"
    hoverable
    clickable
    className="rounded-xl"
    contentClassName="px-10 py-8 font-medium"
  >
    Hover me
  </SurfaceCut>
</Surface>
```

### Interactive states

`hoverable` reveals a hover overlay; `clickable` adds an active scale + pressed background; `pressed` forces the pressed state regardless of pointer activity (controlled press). Combine them to turn a cut into a fully interactive target. Use `as="button"` (or `as="a"`) so the cut itself is the interactive element.

![Interactive](https://cladd.io/screenshots/components/surface-cut/interactive.png)

```tsx
<Surface outline className="rounded-2xl" contentClassName="p-4">
  <SurfaceCut
    as="button"
    clickable={clickable}
    hoverable={hoverable}
    pressed={pressed}
    className="rounded-xl"
    contentClassName="px-10 py-8 font-medium"
  >
    Try me
  </SurfaceCut>
</Surface>
```

### Polymorphic root

`SurfaceCut` is polymorphic. Render it as a button, anchor, or any custom component — props of the target element are forwarded automatically.

![Polymorphic](https://cladd.io/screenshots/components/surface-cut/polymorphic.png)

```tsx
<Surface outline className="rounded-2xl" contentClassName="p-4">
  <SurfaceCut
    as="a"
    href="https://github.com/cladd-ui"
    target="_blank"
    rel="noreferrer"
    clickable
    hoverable
    className="rounded-xl text-cladd-primary"
    contentClassName="px-8 py-4 font-medium"
  >
    Open the cladd repo →
  </SurfaceCut>
</Surface>
```

### Full height

`SurfaceCutContent` defaults to `h-full` so the cut fills its container — handy when cuts sit side-by-side in a flex or grid and need to align. Set `fullHeight={false}` when you'd rather the content size to its intrinsic height.

![Full height](https://cladd.io/screenshots/components/surface-cut/full-height.png)

```tsx
<Surface
  outline
  className="h-40 w-72 rounded-2xl"
  contentClassName="flex h-full gap-4 p-4"
>
  <SurfaceCut
    className="flex-1 rounded-xl"
    contentClassName="flex items-center justify-center text-cladd-fg-soft"
  >
    fullHeight
  </SurfaceCut>
  <SurfaceCut className="flex-1 rounded-xl" wrapContent={false} as="div">
    <SurfaceCutContent
      fullHeight={false}
      className="m-4 px-4 py-2 text-cladd-fg-soft"
    >
      intrinsic
    </SurfaceCutContent>
  </SurfaceCut>
</Surface>
```

### Field rows

A common application of `SurfaceCut` is the inset field row — labelled values stacked inside a raised `Surface`. The recessed slots read as data, the surrounding card as chrome.

![Field](https://cladd.io/screenshots/components/surface-cut/field.png)

```tsx
<Surface
  outline
  className="w-80 rounded-2xl"
  contentClassName="flex flex-col gap-4 p-4"
>
  <SurfaceCut
    className="rounded-lg"
    contentClassName="flex items-center gap-2 px-4 py-2 text-cladd-fg-soft"
  >
    <span className="font-mono text-xs uppercase">scheme</span>
    <span className="ml-auto font-mono text-cladd-fg">https://</span>
  </SurfaceCut>
  <SurfaceCut
    className="rounded-lg"
    contentClassName="flex items-center gap-2 px-4 py-2 text-cladd-fg-soft"
  >
    <span className="font-mono text-xs uppercase">host</span>
    <span className="ml-auto font-mono text-cladd-fg">cladd.io</span>
  </SurfaceCut>
  <SurfaceCut
    className="rounded-lg"
    contentClassName="flex items-center gap-2 px-4 py-2 text-cladd-fg-soft"
  >
    <span className="font-mono text-xs uppercase">port</span>
    <span className="ml-auto font-mono text-cladd-fg">443</span>
  </SurfaceCut>
</Surface>
```

## API Reference

### SurfaceCut

**Generics:** `C extends ElementType = 'div'`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'div'` | Polymorphic root element. Defaults to `'div'`. |
| `beforeContent?` | `ReactNode` | — | Slot rendered between the background layer and the content wrapper, **outside** the `SurfaceCutContent` flex layout (e.g. `FocusableLayer`, decorative overlays). |
| `children?` | `ReactNode` | — | Surface-cut content. |
| `className?` | `string` | — | Extra classes for the root element. |
| `clickable?` | `boolean` | `false` | Enable active/pressed visual states (scale + pressed background). Default `false`. |
| `color?` | `Color` | — | Accent color token. Sets the surface's `cladd-color-{name}` class. |
| `contentClassName?` | `string` | — | Extra classes for the inner `SurfaceCutContent` wrapper. Ignored when `wrapContent` is `false`. |
| `hoverable?` | `boolean` | `false` | Show hover overlay on the cut surface. Default `false`. |
| `outline?` | `boolean` | `true` | Render the inset outline ring. Default `true`. |
| `overlayClassName?` | `string` | — | Extra classes for the hover/press overlay layer. |
| `overlayPosition?` | `'below' \| 'above'` | — | Where to stack the hover/press overlay:<br>- `'below'` (default) - inside the background layer, behind content (overlay tints only the bg).<br>- `'above'` - on top of content as a separate sibling layer (overlay tints content too). |
| `pressed?` | `boolean` | — | Force the pressed visual state regardless of pointer activity. |
| `wrapContent?` | `boolean` | — | When `true` (default), `children` are wrapped in `SurfaceCutContent`.<br>Set to `false` to render `children` directly when you need full layout control of the inner DOM. |

### SurfaceCutContent

**Generics:** `C extends ElementType = 'div'`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'div'` | Polymorphic root element. Defaults to `'div'`. |
| `children?` | `ReactNode` | — | Content rendered inside the cut surface's content layer. |
| `className?` | `string` | — | Extra classes for the wrapper. |
| `fullHeight?` | `boolean` | `true` | Stretch the content to `h-full`. Default `true`. Set `false` for content sized by intrinsic height. |
