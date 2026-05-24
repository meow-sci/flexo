---
title: "Segmented"
description: "Inline control for choosing one option from a small set."
links:
  doc: https://cladd.io/react/components/segmented/
  api: https://cladd.io/react/components/segmented/#api-reference
---

# Segmented

`Segmented` is a single-select group of buttons — the canonical "view switcher" control. The group is the `Segmented` element; each option is a `SegmentedButton` with an `active` flag on the selected one. cladd handles the active-vs-inactive styling difference via context, so individual buttons stay terse.

This page covers `Segmented` together with its child, `SegmentedButton`.

![Overview](https://cladd.io/screenshots/components/segmented/overview.png)

```tsx
<ExampleToolbar>
  <Segmented>
    {VIEWS.map((v) => (
      <SegmentedButton
        key={v}
        active={v === view}
        onClick={() => setView(v)}
      >
        {v}
      </SegmentedButton>
    ))}
  </Segmented>
</ExampleToolbar>
```

## Usage

```tsx
import { Segmented, SegmentedButton, Toolbar } from '@cladd-ui/react';

<Toolbar>
  <Segmented>
    <SegmentedButton active>List</SegmentedButton>
    <SegmentedButton>Grid</SegmentedButton>
    <SegmentedButton>Calendar</SegmentedButton>
  </Segmented>
</Toolbar>;
```

`Segmented` is **layout only** — it renders a flex row of buttons with no fill, outline, or padding of its own. Pair it with a container that supplies the visual housing; [`Toolbar`](/react/components/toolbar/) is the canonical match (it sets `size`, `rounded`, and accent context that `Segmented` reads automatically).

`SegmentedButton` extends [`Button`](/react/components/button/) — every `Button` prop works on it. The only addition is `active`. When set, it switches the button to the surrounding `Segmented`'s `activeColor` / `activeVariant` / `activeOutline`, lifts it one surface level for visual elevation, and sets `readOnly` so the already-selected option isn't pressable again.

## Examples

### Inside a container

`Segmented` doesn't draw a wrapper — bare, it's just three buttons floating in the parent. Wrap it in [`Toolbar`](/react/components/toolbar/) for the standard pill-toolbar look, or inside any [`Surface`](/react/components/surface/) when you want a custom shell.

![Container](https://cladd.io/screenshots/components/segmented/container.png)

```tsx
<div className="flex flex-col items-center gap-2">
  <span className="font-mono text-cladd-fg-softer">bare</span>
  <Segmented>
    <SegmentedButton active>List</SegmentedButton>
    <SegmentedButton>Grid</SegmentedButton>
    <SegmentedButton>Calendar</SegmentedButton>
  </Segmented>
</div>
<div className="flex flex-col items-center gap-2">
  <span className="font-mono text-cladd-fg-softer">
    inside &lt;Toolbar&gt;
  </span>
  <ExampleToolbar>
    <Segmented>
      <SegmentedButton active>List</SegmentedButton>
      <SegmentedButton>Grid</SegmentedButton>
      <SegmentedButton>Calendar</SegmentedButton>
    </Segmented>
  </ExampleToolbar>
</div>
<div className="flex flex-col items-center gap-2">
  <span className="font-mono text-cladd-fg-softer">
    inside &lt;Surface&gt;
  </span>
  <Surface outline className="rounded-full" contentClassName="p-1">
    <Segmented>
      <SegmentedButton active>List</SegmentedButton>
      <SegmentedButton>Grid</SegmentedButton>
      <SegmentedButton>Calendar</SegmentedButton>
    </Segmented>
  </Surface>
</div>
```

Inside `Toolbar`, `Segmented` reads the toolbar's `size` from context — so you only need to set `size` on the toolbar (or omit it for the `md` default), and the segments follow. Same goes for accent color set on the toolbar.

### Sizes

`size` accepts the standard `2xs → 2xl` scale. The value is forwarded to every child `SegmentedButton` through context, so individual buttons stay clean. Inside a `Toolbar`, you can omit `size` on `Segmented` and it'll pick up the toolbar's size instead.

![Size](https://cladd.io/screenshots/components/segmented/size.png)

```tsx
<ExampleToolbar>
  <Segmented size={size}>
    {VIEWS.map((v) => (
      <SegmentedButton
        key={v}
        active={v === view}
        onClick={() => setView(v)}
      >
        {v}
      </SegmentedButton>
    ))}
  </Segmented>
</ExampleToolbar>
```

### Active segment style

`activeVariant`, `activeColor`, and `activeOutline` control the look of the **selected** segment. The defaults — `gradient` variant with the theme accent and an outline ring — make the active option pop against the muted inactive ones. Try a `solid-fill` for a louder selection state, or pick a color that matches the page's accent.

![Active style](https://cladd.io/screenshots/components/segmented/active-style.png)

```tsx
<ExampleToolbar>
  <Segmented activeVariant={activeVariant} activeColor={activeColor}>
    {VIEWS.map((v) => (
      <SegmentedButton
        key={v}
        active={v === view}
        onClick={() => setView(v)}
      >
        {v}
      </SegmentedButton>
    ))}
  </Segmented>
</ExampleToolbar>
```

### Inactive segment style

`variant`, `color`, and `outline` control the **unselected** segments. The default `transparent` variant with no outline lets inactive options fade into the parent surface — when paired with a `Toolbar`, only the selected segment reads as a real button. Switch to `solid` if you want every option to look pressable, or add `outline` to make inactive segments look like buttons sitting in their own slots.

![Inactive style](https://cladd.io/screenshots/components/segmented/inactive-style.png)

```tsx
<ExampleToolbar>
  <Segmented variant={variant} color={color} outline={outline}>
    {DENSITIES.map((d) => (
      <SegmentedButton
        key={d}
        active={d === density}
        onClick={() => setDensity(d)}
      >
        {d}
      </SegmentedButton>
    ))}
  </Segmented>
</ExampleToolbar>
```

### Rounded

`rounded` controls the corner shape of the segments — pill (`true`, default) or matching the size-specific radius. The flag is forwarded via context just like `size`, so each segment picks it up automatically.

![Rounded](https://cladd.io/screenshots/components/segmented/rounded.png)

```tsx
<ExampleToolbar rounded={rounded}>
  <Segmented rounded={rounded}>
    {VIEWS.map((v) => (
      <SegmentedButton
        key={v}
        active={v === view}
        onClick={() => setView(v)}
      >
        {v}
      </SegmentedButton>
    ))}
  </Segmented>
</ExampleToolbar>
```

### Disabled

`disabled` dims the entire group to 40% opacity and disables pointer events. For per-segment disabling, use the [`Button`](/react/components/button/) `disabled` or `readOnly` props directly on a `SegmentedButton`.

![Disabled](https://cladd.io/screenshots/components/segmented/disabled.png)

```tsx
<ExampleToolbar>
  <Segmented disabled={disabled}>
    {VIEWS.map((v) => (
      <SegmentedButton
        key={v}
        active={v === view}
        onClick={() => setView(v)}
      >
        {v}
      </SegmentedButton>
    ))}
  </Segmented>
</ExampleToolbar>
```

### Playground

`Segmented` exposes two parallel sets of style props — one for active, one for inactive — plus the shared layout knobs. They compose freely; the playground below combines them all.

![Playground](https://cladd.io/screenshots/components/segmented/playground.png)

```tsx
<ExampleToolbar rounded={rounded}>
  <Segmented
    size={size}
    activeVariant={activeVariant}
    activeColor={activeColor}
    variant={variant}
    color={color}
    rounded={rounded}
  >
    {VIEWS.map((v) => (
      <SegmentedButton
        key={v}
        active={v === view}
        onClick={() => setView(v)}
      >
        {v}
      </SegmentedButton>
    ))}
  </Segmented>
</ExampleToolbar>
```

## API Reference

### Segmented

**Generics:** `C extends ElementType = 'div'`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `activeColor?` | `Color` | — | Color applied to the **active** segment button. Default: theme accent color. |
| `activeOutline?` | `boolean` | `true` | Outline ring on the **active** segment button. Default `true`. |
| `activeVariant?` | `SurfaceVariant` | `'gradient'` | `Surface` variant applied to the **active** segment button. Default `'gradient'`. |
| `as?` | `ElementType` | `'div'` | Polymorphic root element. Defaults to `'div'`. Use `'fieldset'`/`'ul'`/etc. for semantic groupings. |
| `children?` | `ReactNode` | — | Should be one or more `SegmentedButton` elements. |
| `className?` | `string` | — | Extra classes for the segmented container. |
| `color?` | `Color` | — | Accent color applied to **inactive** segment buttons. |
| `disabled?` | `boolean` | — | Visually dim the entire group and disable pointer events. |
| `outline?` | `boolean` | `false` | Outline ring on **inactive** segment buttons. Default `false`. |
| `rounded?` | `boolean` | `true` | Pill-style segment buttons. Default `true`. Forwarded via context. |
| `size?` | `ButtonSize` | `'md'` | Segment button size. Default `'md'`. Forwarded via context. |
| `variant?` | `SurfaceVariant` | `'transparent'` | `Surface` variant applied to **inactive** segment buttons through context.<br>Default `'transparent'` - inactive segments fade into the parent surface. |

### SegmentedButton

**Generics:** `C extends ElementType = 'button'`

**Inherits from:** [`Button`](/react/components/button/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `active?` | `boolean` | — | Marks this button as the selected segment.<br>When `true`, switches to the `activeColor` / `activeVariant` / `activeOutline` from the surrounding `Segmented`, raises `surfaceLevel` by `+2` for visual elevation, and sets `readOnly` so the already-selected segment is not pressable again. |
