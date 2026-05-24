---
title: "Chip"
description: "Compact label for tags, statuses, and inline metadata."
links:
  doc: https://cladd.io/react/components/chip/
  api: https://cladd.io/react/components/chip/#api-reference
---

# Chip

`Chip` is a compact, surface-backed label — the right primitive for status badges, tags, version markers, filter pills, and inline metadata. It shares the same accent palette and sizing scale as the rest of the application controls, so chips line up with [`Button`](/react/components/button/), [`Shortcut`](/react/components/shortcut/), and [`Spinner`](/react/components/spinner/) without any extra plumbing. By default it renders as a non-interactive `<span>`; pass `as="button"` or `as="a"` and it becomes clickable automatically.

![Overview](https://cladd.io/screenshots/components/chip/overview.png)

```tsx
<Chip color="green">Active</Chip>
<Chip color="yellow">Pending</Chip>
<Chip color="red">Failed</Chip>
<Chip icon={CheckIcon} color="green">
  Verified
</Chip>
<Chip color="brand" rounded>
  v1.2.3
</Chip>
<Chip as="button" size="lg" icon={PlusIcon}>
  Add tag
</Chip>
<Chip size="sm" color="red">
  12
</Chip>
```

## Usage

```tsx
import { Chip } from '@cladd-ui/react';

<Chip color="green">Active</Chip>;
```

A bare `Chip` renders a small filled-gradient label sized `md`. Pass `outline` for the more common "tag" treatment — a transparent surface with a colored ring. Pass `as="button"` (or any element/component) to make it interactive: pointer cursor, hover overlay, and pressed state turn on automatically.

## Examples

### Sizes

`size` accepts the standard cladd scale — `2xs`, `xs`, `sm`, `md` (default), `lg`, `xl`, `2xl`. The same scale is used by [`Button`](/react/components/button/), [`Shortcut`](/react/components/shortcut/), and [`Spinner`](/react/components/spinner/), so a chip lined up with one of those controls reads at the right proportion when both share the size token.

In practice, stick to `sm` and up for standalone chips. `2xs` and `xs` exist for the rare case where a chip is nested inside something denser (a tight inline indicator, a table cell label) — at those sizes the glyph and label proportions get tight enough that the chip starts to look fragile rather than legible.

![Size](https://cladd.io/screenshots/components/chip/size.png)

```tsx
<Chip size={size} color="brand" icon={CheckIcon}>
  Active
</Chip>
```

### Inside a button

Chips and buttons are designed to nest. Pass the same `size` token to both and the chip sits one step smaller than the button's content row — the right proportion for a count, status pill, or shortcut indicator riding alongside the label. Same trick works for [`Spinner`](/react/components/spinner/) and [`Shortcut`](/react/components/shortcut/).

![Inside button](https://cladd.io/screenshots/components/chip/inside-button.png)

```tsx
<Button size={size}>
  Deployments
  <Chip size={size} color="green">
    3 live
  </Chip>
</Button>
```

### Variants

`variant` is the same surface variant token used by [`Surface`](/react/components/surface/) and [`Button`](/react/components/button/). `gradient` is the default — a subtle highlight that gives the chip a soft, pill-button feel. `solid` is a flat fill; `transparent` drops the background entirely so only the ring and label remain — the classic "tag" treatment when paired with `outline`. `solid-fill` and `gradient-fill` flood the chip with the accent color and invert the text — the loud option for status pills that need to read at a glance.

![Variant](https://cladd.io/screenshots/components/chip/variant.png)

```tsx
<Chip variant={variant} color="brand">
  {variant}
</Chip>
```

### Outline

`outline` toggles the colored ring around the chip's edge. With `outline` (the default), the ring picks up the accent `color`; without it, the chip leans entirely on its surface fill and text color. Pair `outline` with `variant="transparent"` for the classic ring-only tag, or drop the outline on a `gradient-fill` chip for a clean, unbordered status pill.

![Outline](https://cladd.io/screenshots/components/chip/outline.png)

```tsx
<Chip outline={outline}>Default</Chip>
<Chip outline={outline} color="brand">
  Brand
</Chip>
<Chip outline={outline} color="green">
  Active
</Chip>
<Chip outline={outline} color="red">
  Error
</Chip>
```

### Colors

`color` accepts any of the eleven cladd accent tokens. The accent always tints the text; on outlined chips it also tints the ring; on the fill variants it floods the surface. Try the variant control alongside the color picker to see how the same accent reads across treatments.

![Color](https://cladd.io/screenshots/components/chip/color.png)

```tsx
<Chip variant={variant} color={color}>
  {color}
</Chip>
```

### With icon

The `icon` prop takes a component (not an element) — `Chip` renders it ahead of `children` and applies a size-matched glyph dimension. Forward extra props through `iconProps`. The icon size is locked to the chip's `size` (ramping 6 → 16 px across the scale), so you don't pass dimensions yourself — and the same applies to any direct `<svg>` child, whether it comes through `icon` or not. Adding `className="size-3.5"` to the SVG is a no-op because the chip's selector wins; only `size-3.5!` would override it, and in practice you almost never want to.

![Icon](https://cladd.io/screenshots/components/chip/icon.png)

```tsx
<Chip icon={CheckIcon} color="green">
  Verified
</Chip>
<Chip icon={PlusIcon} as="button" outline>
  New
</Chip>
<Chip icon={CheckIcon} color="brand" rounded outline>
  Subscribed
</Chip>
<Chip
  icon={PlusIcon}
  iconProps={{ className: 'rotate-45' }}
  color="red"
  outline
>
  Remove
</Chip>
```

### Rounded

`rounded` swaps the size-specific corner radius for `rounded-full` — the pill shape used for tags, filter chips, and "subscribed"-style toggles. The size-specific default keeps a softer, app-shell feel; `rounded` is the right call for free-standing tags.

![Rounded](https://cladd.io/screenshots/components/chip/rounded.png)

```tsx
<Chip rounded={rounded} color="brand" outline>
  Brand
</Chip>
<Chip rounded={rounded} color="green" icon={CheckIcon}>
  Verified
</Chip>
<Chip rounded={rounded} size="lg" color="purple" outline>
  Premium
</Chip>
```

### Clickable

When `as` is `'button'` or `'a'`, `clickable` flips on automatically — the chip picks up a pointer cursor, hover overlay, and pressed-state animation. Use this for filter chips, removable tags, or any interactive label. You can also force a `<span>` to be clickable by passing `clickable` explicitly, or suppress the default for an `<a>` used purely as a navigation anchor.

![Clickable](https://cladd.io/screenshots/components/chip/clickable.png)

```tsx
{TAGS.map((tag) => {
  const active = selected.includes(tag);
  return (
    <Chip
      key={tag}
      as="button"
      color={active ? 'brand' : 'neutral'}
      outline={!active}
      icon={active ? CheckIcon : undefined}
      onClick={() => toggle(tag)}
    >
      {tag}
    </Chip>
  );
})}
```

### Polymorphic root

`as` swaps the underlying element — `'span'` (default), `'button'`, `'a'`, or any component. Forwarded props are typed against the chosen element, so `href` is valid on `as="a"` and `onClick` is valid on `as="button"` without any extra typing on your side.

![Polymorphic](https://cladd.io/screenshots/components/chip/polymorphic.png)

```tsx
<Chip color="green" outline>
  span (default)
</Chip>
<Chip as="button" color="brand" outline>
  button
</Chip>
<Chip
  as="a"
  href="https://cladd.io/"
  target="_blank"
  rel="noreferrer"
  color="cyan"
  outline
>
  anchor
</Chip>
```

### On nested surfaces

Chips read correctly across nesting depth — the underlying [`Surface`](/react/components/surface/) picks up the contextual level, so a chip inside a nested surface stays distinct from its background without you having to pick a level by hand. Override with `surfaceLevel` if you need to push the chip up or down explicitly (e.g. `surfaceLevel="+1"` to lift it off a recessed parent).

![Surface level](https://cladd.io/screenshots/components/chip/surface-level.png)

```tsx
<Surface
  outline
  className="w-80 rounded-2xl"
  contentClassName="flex flex-col gap-4 p-4"
>
  <div className="flex items-center justify-between">
    <span className="font-semibold">Deployment</span>
    <Chip color="green">Live</Chip>
  </div>
  <Surface
    outline
    className="rounded-xl"
    contentClassName="flex items-center justify-between px-4 py-2"
  >
    <span className="text-cladd-fg-soft">api/v2</span>
    <div className="flex gap-1">
      <Chip color="neutral" outline>
        prod
      </Chip>
      <Chip color="brand" outline>
        v1.4.2
      </Chip>
    </div>
  </Surface>
</Surface>
```

### Playground

`variant`, `size`, `color`, `outline`, `rounded`, and the icon slot compose freely. Try a `transparent` outlined red chip for an inline error count, a `lg` rounded `gradient-fill` brand chip with an icon for a "subscribed" pill, or a default `md` neutral chip as a quiet metadata tag.

![Playground](https://cladd.io/screenshots/components/chip/playground.png)

```tsx
<Chip
  variant={variant}
  color={color}
  size={size}
  outline={outline}
  rounded={rounded}
  icon={withIcon ? CheckIcon : undefined}
>
  {color}
</Chip>
```

## API Reference

**Generics:** `C extends ElementType = 'span'`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'span'` | Polymorphic root element. Defaults to `'span'`. When set to `'a'` or `'button'`, the chip becomes interactive automatically (see `clickable`). |
| `children?` | `ReactNode` | — | Chip content - typically a short label, optionally with an icon. |
| `className?` | `string` | — | Extra classes for the chip surface root. |
| `clickable?` | `boolean` | — | Make the chip react to pointer activity (active/pressed state, hover overlay).<br>Auto-computed when omitted: `true` if `as === 'a'` or `'button'`, otherwise `false`.<br>Set explicitly to override (e.g. force a `<span>` to be clickable, or suppress the default for an `<a>` used purely as a navigation anchor). |
| `color?` | `Color` | — | Accent color token. Sets the chip's `cladd-color-{name}` class - drives text and ring colors. |
| `contentClassName?` | `string` | — | Extra classes for the inner content row. |
| `disabled?` | `boolean` | — | Currently unused in styling - reserved for future "disabled chip" state. |
| `hoverable?` | `boolean` | — | Show hover affordance. Implicitly enabled when the chip is clickable. |
| `icon?` | `ElementType<any>` | — | Icon component rendered before `children`. Receives `iconProps`. |
| `iconProps?` | `Record<string, unknown>` | — | Props forwarded to the `icon` component. |
| `outline?` | `boolean` | `true` | Render an outline ring around the chip. Forwarded to the underlying `Surface`. Default `true`. |
| `rounded?` | `boolean` | — | Apply `rounded-full` (pill) corners. When `false` (default), uses size-specific corner radii. |
| `size?` | `ChipSize` | `'md'` | Chip size token. Drives height, padding, and font size. Default `'md'`. |
| `surfaceLevel?` | `string \| number` | — | Forwarded to the underlying `Surface` as `level` - see `SurfaceProps.level` for the relative-offset (`"+1"`/`"-1"`) syntax. |
| `variant?` | `SurfaceVariant` | `'gradient'` | Surface variant. Forwarded to the underlying `Surface`. Default `'gradient'`. |
