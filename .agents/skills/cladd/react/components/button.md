---
title: "Button"
description: "Clickable control for primary actions, forms, toolbars, and menus."
links:
  doc: https://cladd.io/react/components/button/
  api: https://cladd.io/react/components/button/#api-reference
---

# Button

`Button` is a polymorphic, surface-backed control. It inherits the full [`Surface`](/react/components/surface/) palette — every variant, every accent color, the same outline ring — and layers on the application-grade bits a button actually needs: a consistent `2xs → 2xl` size scale, automatic focus ring, `multiline` for wrapping labels, `rounded` for pill shapes, a built-in `loading` state, and `disabled` / `readOnly` states that suppress interaction without losing the visual.

![Overview](https://cladd.io/screenshots/components/button/overview.png)

```tsx
<Button color="brand">Save changes</Button>
<Button>Cancel</Button>
<Button variant="solid" color="red">
  Delete
</Button>
<Button variant="transparent" outline={false}>
  Ghost
</Button>
<Button rounded color="green" size="sm">
  <PlusIcon />
  Add
</Button>
<Button color="orange" size="sm" outline={false}>
  Done
  <CheckIcon />
</Button>
<Button rounded color="brand" size="sm">
  <PlusIcon />
</Button>
```

## Usage

```tsx
import { Button } from '@cladd-ui/react';

<Button color="brand" size="lg">
  Save changes
</Button>;
```

By default `Button` renders a `<button>` element with `variant="gradient"`, `outline`, and the medium size. Pass `as="a"` (or any component) to render as a link while keeping the same look — pointer cursor flips on automatically.

## Examples

### Sizes

`size` accepts the standard cladd scale — `2xs`, `xs`, `sm`, `md` (default), `lg`, `xl`, `2xl`. [`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), and [`Spinner`](/react/components/spinner/) share the same scale, so when you nest one inside a button you can pass the matching `size` token and it sits at the right proportion — see the [loading example](#loading) below.

![Size](https://cladd.io/screenshots/components/button/size.png)

```tsx
<Button size={size} color="brand">
  Save changes
</Button>
```

Direct `<svg>` children are sized automatically — `Button` applies a size-matched glyph dimension (12 px at `2xs`/`xs`, 16 px from `sm` upward), so you can drop a Lucide or Heroicons component in as a child without passing dimensions. Don't add `className="size-3.5"` (or similar) on the icon — the button's selector wins and your class is a no-op unless you escalate with `size-3.5!`. In practice you almost never need to: pick the right button `size` and the icon follows.

### Loading

`loading` swaps the button's content for a centered [`Spinner`](/react/components/spinner/) sized to the current `size` token. The label fades out in place and the button keeps its exact dimensions, so submit toolbars and inline forms don't reflow when an action starts working. The component also sets `data-loading` for any extra styling hooks you want to layer on top.

`loading` only handles the visuals — it doesn't suppress clicks on its own. Pair it with `readOnly` (keeps the button looking active) or `disabled` (dims it) to keep handlers from firing twice while the action is in flight.

```tsx
<Button size={size} color="brand" loading={loading} readOnly={loading}>
  Save changes
</Button>
```

If you need to swap the label too — e.g. "Save changes" → "Saving…" — skip `loading` and compose a [`Spinner`](/react/components/spinner/) inline as a child instead, passing the same `size` to both.

### Variants

`variant` is the same surface variant token used by [`Surface`](/react/components/surface/). `gradient` is the default — slight diagonal highlight, the most "button-like" look. `solid` is a flat fill; `transparent` removes the background entirely (pair it with `outline={false}` for a true ghost button); `solid-fill` and `gradient-fill` paint the accent color across the entire surface with inverted text — the loud, primary-action treatment.

![Variant](https://cladd.io/screenshots/components/button/variant.png)

```tsx
<Button variant={variant} color="brand" className="w-32">
  {variant}
</Button>
```

### Colors

`color` accepts any of the eleven cladd accent tokens. On the non-fill variants the accent tints the text and the outline ring; on `solid-fill` and `gradient-fill` it floods the whole button. Try the variant control alongside the color picker to see how the same accent reads across treatments.

![Color](https://cladd.io/screenshots/components/button/color.png)

```tsx
<Button variant={variant} color={color} className="w-32">
  {color}
</Button>
```

### Multiline

By default a button is a single fixed-height row — the label is truncated to one line. Set `multiline` to let long labels wrap; the height switches to `min-h-*` and the corner radii adjust to a pill shape that stays correct at any height.

![Multiline](https://cladd.io/screenshots/components/button/multiline.png)

```tsx
<Button multiline={multiline} color="brand" className="max-w-64">
  Approve and merge this very long pending change request
</Button>
```

### Rounded

`rounded` swaps the size-specific corner radius for `rounded-full` — useful for pill-shaped CTAs, icon buttons, and toolbar chips. With `multiline`, it picks a matching pill radius that works at any line count.

![Rounded](https://cladd.io/screenshots/components/button/rounded.png)

```tsx
<div className="flex flex-wrap items-center justify-center gap-4">
  <Button rounded={rounded} color="brand">
    Save changes
  </Button>
  <Button rounded={rounded} variant="solid">
    Edit
  </Button>
  <Button rounded={rounded} variant="transparent" outline={false}>
    Ghost
  </Button>
</div>
```

### Square

`square` forces the button into an `aspect-square` box and drops horizontal padding, sizing it from its `size` token alone. It's the right prop for icon-only buttons in toolbars, segmented controls, and dense action rows — pass a single `<svg>` child and the glyph dimension still tracks the `size` scale, so the icon stays centered without manual width tweaking. Combine with `rounded` for a circular icon button, or leave it off for a soft-cornered square.

```tsx
<div className="flex flex-wrap items-center justify-center gap-2">
  <Button square size={size} color="brand">
    <BoldIcon />
  </Button>
  <Button square size={size}>
    <ItalicIcon />
  </Button>
  <Button square size={size}>
    <UnderlineIcon />
  </Button>
  <Button square size={size} rounded color="green">
    <PlusIcon />
  </Button>
  <Button
    square
    size={size}
    variant="transparent"
    outline={false}
    color="red"
  >
    <CheckIcon />
  </Button>
</div>
```

### Disabled

`disabled` dims the button to 40% opacity and disables pointer events. The native `disabled` attribute is forwarded to the underlying `<button>`, so it correctly suppresses clicks, focus, and form submission.

![Disabled](https://cladd.io/screenshots/components/button/disabled.png)

```tsx
<div className="flex flex-col items-center gap-4">
  <Button
    disabled={disabled}
    color="brand"
    onClick={() => setCount((c) => c + 1)}
  >
    Save changes
  </Button>
  <span className="font-mono text-cladd-fg-softer">clicks: {count}</span>
</div>
```

### Read-only

`readOnly` blocks clicks (and the `onClick` handler) while keeping the button visually enabled — no dimming, full opacity. It's the right state for controls that read as active but shouldn't react: the currently-selected segmented option, a "current page" pagination button, or a button locked while a parallel action is in flight.

![Read only](https://cladd.io/screenshots/components/button/read-only.png)

```tsx
<div className="flex flex-col items-center gap-4">
  <Button
    readOnly={readOnly}
    color="brand"
    onClick={() => setCount((c) => c + 1)}
  >
    Save changes
  </Button>
  <span className="font-mono text-cladd-fg-softer">clicks: {count}</span>
</div>
```

### Playground

`variant`, `color`, `size`, `outline`, and `rounded` are designed to compose. Try combinations — a `2xs` `solid-fill` pill in `red` for a tiny destructive chip, an `xl` `gradient` outlined button in `brand` for a hero CTA, a `transparent` button with no outline as a quiet ghost.

![Playground](https://cladd.io/screenshots/components/button/playground.png)

```tsx
<Button
  variant={variant}
  color={color}
  size={size}
  outline={outline}
  rounded={rounded}
>
  Save changes
</Button>
```

## API Reference

**Generics:** `C extends ElementType = 'button'`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'button'` | Polymorphic element to render. Defaults to `'button'`. Pass `'a'` for links (cursor switches to pointer automatically), or any custom component to retain Button styling on a different DOM node. The component's own props become valid here. |
| `children?` | `ReactNode` | — | Button content (label, icons, etc.). |
| `className?` | `string` | — | Extra classes for the button surface root. |
| `clickable?` | `boolean` | `true` | Forwarded to the underlying surface. Defaults to `true`.  Suppressed automatically when `disabled` or `readOnly`. |
| `color?` | `Color` | — | Accent color token. Sets the button's `cladd-color-{name}` class - drives text and ring colors. |
| `contentClassName?` | `string` | — | Extra classes for the inner content row. |
| `disabled?` | `boolean` | — | Visually dim the button (40% opacity) and disable pointer events. |
| `focusable?` | `boolean` | `true` | Renders a `FocusableLayer` ring on keyboard focus. Defaults to `true`. Suppressed automatically when `disabled` or `readOnly`. |
| `focused?` | `boolean` | — | Force the focus ring on, regardless of actual keyboard focus. |
| `hoverable?` | `boolean` | `true` | Forwarded to the underlying surface. Defaults to `true`.  Suppressed automatically when `disabled` or `readOnly`. |
| `loading?` | `boolean` | — | Show a centered `Spinner` overlay and fade the button's content out. Also sets `data-loading` for styling hooks. |
| `multiline?` | `boolean` | — | Allow text to wrap onto multiple lines, switching height to `min-h-*` and using pill radii compatible with multi-line content. |
| `outline?` | `boolean` | `true` | Render the surface outline ring. Defaults to `true`. |
| `pressed?` | `boolean` | — | Force the pressed visual state, regardless of pointer activity. |
| `readOnly?` | `boolean` | — | Block clicks while keeping the button visually enabled - useful for "selected" segmented buttons. |
| `rounded?` | `boolean` | — | When `true`, applies fully rounded corners (`rounded-full`, or matching pill radius for `multiline`).<br>Default size-specific corner radii are used when `false`. |
| `size?` | `ButtonSize` | `'md'` | Button size token. Drives height, padding, font size, and corner radius. Default `'md'`. |
| `square?` | `boolean` | — | Render as an icon-only square button: forces `aspect-square` and drops horizontal padding. |
| `style?` | `CSSProperties` | — | Native `style` forwarded to the surface root. |
| `surface?` | `ButtonSurface` | — | Which surface primitive to wrap with:<br>- `'surface'` (default) - uses `Surface` (standard tinted/outlined panel).<br>- `'cut'` - uses `SurfaceCut` (inset/recessed look - for buttons that sit inside another surface). |
| `surfaceLevel?` | `string \| number` | — | Forwarded to the underlying `Surface` as `level` - see `SurfaceProps.level` for the relative-offset (`"+1"`/`"-1"`) syntax. |
| `variant?` | `SurfaceVariant` | `'gradient'` | Underlying `Surface` variant - see `SurfaceVariant`. Defaults to `'gradient'`. |
