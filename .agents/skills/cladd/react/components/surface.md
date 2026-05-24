---
title: "Surface"
description: "Surface is the foundational container in cladd — every panel, card, button, and toolbar is built from it."
links:
  doc: https://cladd.io/react/components/surface/
  api: https://cladd.io/react/components/surface/#api-reference
---

# Surface

`Surface` is the foundational container in cladd. Almost every other component — [`Button`](/react/components/button/), [`Toolbar`](/react/components/toolbar/), [`Input`](/react/components/input/), [`Switch`](/react/components/switch/), [`Segmented`](/react/components/segmented/) — is composed from it. It carries the **depth level**, the **variant**, the **accent color**, and the optional interactive states (`hoverable`, `clickable`, `pressed`) that the rest of the kit reuses.

This page covers `Surface` together with its content slot, `SurfaceContent`.

![Overview](https://cladd.io/screenshots/components/surface/overview.png)

```tsx
<Surface
  outline
  className="w-80 rounded-2xl"
  contentClassName="flex flex-col gap-4 p-4"
>
  <div className="flex flex-col gap-1">
    <div className="font-semibold">Surface</div>
    <div className="text-cladd-fg-soft">
      Foundational container — carries depth, variant, and accent color.
    </div>
  </div>
  <Surface
    outline
    className="rounded-xl"
    contentClassName="flex items-center justify-between px-4 py-2"
  >
    <span className="text-cladd-fg-soft">Nested surface</span>
    <span className="text-cladd-fg-softer">level +1</span>
  </Surface>
</Surface>
```

## Usage

```tsx
import { Surface } from '@cladd-ui/react';

<Surface outline className="w-64 rounded-xl" contentClassName="flex gap-4 p-4">
  <span>Hello,</span>
  <span>surface</span>
</Surface>;
```

`Surface` is built from three layers — see [Anatomy](#anatomy) below for the full picture. The short version: `className` styles the outer box (size, corner radius, accent color, ring), `contentClassName` styles the inner content area (padding, `flex`, `grid`). Putting `flex p-4` on `className` won't lay out the children, because the children live one wrapper deeper.

## Anatomy

A `Surface` renders up to four layers, in this order:

1. **Root element** — the polymorphic node (`div` by default, swappable via `as`). Carries `className`, the depth-level class (`cladd-surface-level-N`), the accent-color class (`cladd-color-{name}`), and any forwarded element props. Positioned `relative` so the other layers can sit inside it.
2. **Background layer** — an absolutely-positioned `div` sized to the root. Paints the variant fill (`solid`, `gradient`, `*-fill`) and the outline ring. Style it via `bgClassName` if you need to tweak it.
3. **Overlay layer** — an absolutely-positioned sibling of the bg, rendered only when `hoverable` or `clickable` is on. Paints the hover and pressed tints. Where it stacks is controlled by `overlayPosition`: `'above'` (default) places it above the content so the tint covers everything; `'below'` places it between the bg and the content so the tint only sits on the fill. Style it via `overlayClassName`.
4. **Content wrapper** — a `relative h-full` `div` (`SurfaceContent`) that wraps `children`. The `relative` positioning is the whole point: it lifts the content above the absolute bg and overlay layers so the children render on top. It has no padding, `flex`, or other layout of its own — that's `contentClassName`'s job.

This split is why `className` and `contentClassName` are separate props. `className` shapes the **box**: width, rounded corners, accent token, outline. `contentClassName` shapes the **content layout**: padding, `flex`, `grid`, gap, alignment. The two never collide.

### Bypassing the content wrapper

Pass `wrapContent={false}` to render `children` directly instead of wrapping them in `SurfaceContent`. You rarely need this — the default wrapper is invisible until you put styles on it via `contentClassName`. Reach for it only when you want multiple stacked content slots (e.g. header / divider / body, each in its own `SurfaceContent`), or you want full manual control of the inner DOM.

### `beforeContent`

The `beforeContent` prop renders a sibling slot between the bg layer and the content wrapper — outside the `SurfaceContent` flow. Use it for focus rings, decorative gradients, or any overlay that needs to sit above the fill but not inside the content layout.

## Levels

Every `Surface` resolves to a depth `level` from 1 to 5. The level drives the background tone via the `cladd-surface-level-N` class and propagates to nested surfaces through React context. By default a surface renders **one level deeper than its parent**, so nesting "just works" without you tracking depth manually.

![Levels grid](https://cladd.io/screenshots/components/surface/levels-grid.png)

```tsx
{[1, 2, 3, 4, 5].map((level) => (
  <Surface
    key={level}
    level={level}
    outline
    className="rounded-lg"
    contentClassName="p-4 text-cladd-fg"
  >
    Level {level}
  </Surface>
))}
```

### Nested surfaces auto-bump

A `Surface` with no `level` prop reads the current context and renders at `parent + 1`. Stack them and each child sits one shade above its container, up to the clamp at 5.

![Nested levels](https://cladd.io/screenshots/components/surface/nested-levels.png)

```tsx
<Surface
  outline
  className="rounded-2xl"
  contentClassName="p-4 flex flex-col gap-4 font-mono"
>
  <span>Level 1</span>
  <Surface
    outline
    className="rounded-xl"
    contentClassName="p-4 flex flex-col gap-4"
  >
    <span>Level 2</span>
    <Surface
      outline
      className="rounded-lg"
      contentClassName="p-4 flex flex-col gap-4"
    >
      <span>Level 3</span>
      <Surface
        outline
        className="rounded-md"
        contentClassName="p-4 flex flex-col gap-4"
      >
        <span>Level 4</span>
        <Surface outline className="rounded-md" contentClassName="p-4">
          <span>Level 5</span>
        </Surface>
      </Surface>
    </Surface>
  </Surface>
</Surface>
```

### Relative offsets

Pass a string like `"+1"` or `"-1"` to render relative to the parent context. Useful when a surface needs to break out of the default downward stacking — e.g. an inner panel that should match a sibling rather than its container.

![Relative levels](https://cladd.io/screenshots/components/surface/relative-levels.png)

```tsx
<Surface
  level={3}
  outline
  className="rounded-2xl"
  contentClassName="p-4 flex flex-col gap-4 font-mono text-cladd-fg-soft"
>
  <span>level={'{3}'}</span>
  <div className="flex flex-wrap gap-4">
    <Surface
      level="-1"
      outline
      className="rounded-lg"
      contentClassName="p-4"
    >
      level=&quot;-1&quot; → 2
    </Surface>
    <Surface outline className="rounded-lg" contentClassName="p-4">
      (default) → 4
    </Surface>
    <Surface
      level="+2"
      outline
      className="rounded-lg"
      contentClassName="p-4"
    >
      level=&quot;+2&quot; → 5
    </Surface>
  </div>
</Surface>
```

### Transparent inherits the parent

A `variant="transparent"` surface publishes its parent's level (not its own) to descendants. Children render at the same depth as the transparent wrapper — handy for grouping without adding a visual layer.

![Transparent nesting](https://cladd.io/screenshots/components/surface/transparent-nesting.png)

```tsx
<Surface
  level={2}
  outline
  className="rounded-2xl"
  contentClassName="p-4 flex flex-col gap-4"
>
  <span className="text-cladd-fg-soft">Parent (level 2)</span>
  <Surface
    variant="transparent"
    className="rounded-xl border border-dashed border-cladd-outline"
    contentClassName="p-4 flex flex-col gap-4"
  >
    <span>transparent wrapper</span>
    <Surface outline className="rounded-lg" contentClassName="p-4">
      Child Surface — still level 2
    </Surface>
  </Surface>
</Surface>
```

## Examples

### Variants

`variant` controls the surface's visual treatment. `transparent` renders no background (children sit at the parent level), `solid` is the default flat fill, `gradient` adds a diagonal highlight, and the `*-fill` variants paint the accent color across the whole surface with inverted text.

![Variants](https://cladd.io/screenshots/components/surface/variants.png)

```tsx
<Surface
  variant={variant}
  outline
  className="w-48 rounded-xl"
  contentClassName="px-10 py-8 font-medium text-center"
>
  {variant}
</Surface>
```

### Colors

`Surface` accepts any of the eleven cladd accent tokens through `color`. The token sets `cladd-color-{name}` on the root, which flows into accent-aware fills, outlines, and inverted text colors on the `*-fill` variants.

![Colors](https://cladd.io/screenshots/components/surface/colors.png)

```tsx
<Surface
  color={color}
  variant="gradient-fill"
  outline
  className="w-48 rounded-xl"
  contentClassName="px-10 py-8 font-medium text-center"
>
  {color}
</Surface>
```

### Outline

`outline` adds a 1px ring around the surface. The ring switches to a fill-aware token automatically when `variant` ends in `-fill`, so it stays legible against accent backgrounds.

![Outline](https://cladd.io/screenshots/components/surface/outline.png)

```tsx
<Surface
  outline={outline}
  variant="solid"
  className="rounded-xl"
  contentClassName="px-10 py-8 font-medium"
>
  Surface
</Surface>
```

### Interactive states

`hoverable` reveals a hover overlay; `clickable` adds an active scale + pressed background; `pressed` forces the pressed state regardless of pointer activity (controlled press). Combine them to turn a surface into a fully interactive target. Use `as="button"` (or `as="a"`) so the surface itself is the interactive element.

![Interactive](https://cladd.io/screenshots/components/surface/interactive.png)

```tsx
<Surface
  as="button"
  clickable={clickable}
  hoverable={hoverable}
  pressed={pressed}
  variant="solid"
  className="rounded-xl"
  contentClassName="px-10 py-8 font-medium"
>
  Try me
</Surface>
```

### Polymorphic root

`Surface` is polymorphic. Render it as a button, anchor, or any custom component — props of the target element are forwarded automatically.

![Polymorphic](https://cladd.io/screenshots/components/surface/polymorphic.png)

```tsx
<Surface
  as="a"
  href="https://github.com/cladd-ui"
  target="_blank"
  rel="noreferrer"
  clickable
  hoverable
  outline
  className="rounded-xl text-cladd-primary"
  contentClassName="px-8 py-4 font-medium"
>
  Open the cladd repo →
</Surface>
```

### Playground

`variant`, `color`, `outline`, and nesting are designed to compose. The outer surface sets the context — accent color flows down through `cladd-color-{name}`, and nested surfaces auto-bump one level deeper for visual depth.

![Playground](https://cladd.io/screenshots/components/surface/playground.png)

```tsx
<Surface
  variant={variant}
  color={color}
  outline={outline}
  className="w-80 rounded-2xl"
  contentClassName="flex flex-col gap-4 p-4"
>
  <div className="font-semibold capitalize">
    {variant} · {color}
  </div>
  <div className="text-cladd-fg-soft">
    Each nested surface auto-bumps one level deeper.
  </div>
  <Surface
    variant={variant}
    outline={outline}
    className="rounded-xl"
    contentClassName="flex flex-col gap-4 p-4"
  >
    <span>level 2</span>
    <Surface
      variant={variant}
      outline={outline}
      className="rounded-lg"
      contentClassName="flex flex-col gap-4 p-4"
    >
      <span>level 3</span>
      <Surface
        variant={variant}
        outline={outline}
        className="rounded-md"
        contentClassName="flex flex-col gap-4 p-4"
      >
        <span>level 4</span>
        <Surface
          variant={variant}
          outline={outline}
          className="rounded-md"
          contentClassName="p-4"
        >
          <span>level 5</span>
        </Surface>
      </Surface>
    </Surface>
  </Surface>
</Surface>
```

## API Reference

### Surface

**Generics:** `C extends ElementType = 'div'`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'div'` | Polymorphic root element. Defaults to `'div'`. Use `'button'`, `'a'`, etc. when the surface is itself the interactive target (forwarding props of that element). |
| `beforeContent?` | `ReactNode` | — | Slot rendered between the background layer and the content wrapper, **outside** the `SurfaceContent` flex layout (e.g. `FocusableLayer`, decorative overlays). |
| `bgClassName?` | `string` | — | Extra classes for the absolutely-positioned background layer (the tinted/outlined fill behind content). |
| `children?` | `ReactNode` | — | Surface content. |
| `className?` | `string` | — | Extra classes for the root element. |
| `clickable?` | `boolean` | — | Enables active/pressed visual states (scale + pressed background). Combine with `hoverable`. |
| `color?` | `Color` | — | Accent color token. Sets the surface's `cladd-color-{name}` class - drives accent-aware borders, fills, and text colors. |
| `contentClassName?` | `string` | — | Extra classes for the inner `SurfaceContent` wrapper. Ignored when `wrapContent` is `false`. |
| `hoverable?` | `boolean` | — | Enables hover background overlay. For `variant="transparent"`, also reveals the surface fill on hover. |
| `level?` | `number \| string` | — | Surface depth level (1–5). Drives the background tone via `cladd-surface-level="N"` class<br>and propagates to nested surfaces through `SurfaceContext`.<br>Accepts:<br>- An absolute number/string (e.g. `2`, `"3"`).<br>- A relative offset against the parent context level (e.g. `"+1"`, `"-1"`).<br>- `undefined` (default): one level deeper than the parent context.<br>Result is clamped to `[1, 5]`. For `variant="transparent"`, children inherit<br>`currentLevel - 1` so they appear at the same depth as this surface. |
| `outline?` | `boolean` | — | Render a 1px outline ring around the surface. Uses fill-aware token when `variant` ends in `-fill`. |
| `overlayClassName?` | `string` | — | Extra classes for the hover/press overlay layer. |
| `overlayPosition?` | `'below' \| 'above'` | — | Where to stack the hover/press overlay:<br>- `'below'` (default) - inside the background layer, behind content (overlay tints only the bg).<br>- `'above'` - on top of content as a separate sibling layer (overlay tints content too). |
| `pressed?` | `boolean` | — | Force the pressed visual state regardless of pointer activity (controlled press). |
| `variant?` | `SurfaceVariant` | — | Visual treatment of the surface background:<br>- `transparent` - no background; children render at the parent level (used for nested groupings).<br>- `solid` - flat surface fill (default).<br>- `gradient` - diagonal highlight→surface gradient.<br>- `solid-fill` - flat primary/accent fill (text inverts to `text-cladd-on-primary`).<br>- `gradient-fill` - diagonal accent gradient (text inverts). |
| `wrapContent?` | `boolean` | — | When `true` (default), `children` are rendered inside a `SurfaceContent` flex wrapper styled by `contentClassName`.<br>Set to `false` to render `children` directly - useful when the surface is the layout root and you want full control of the inner DOM. |

### SurfaceContent

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | Content rendered inside the surface's content layer (above tint/outline, below focus ring). |
| `className?` | `string` | — | Extra classes for the content wrapper. |
