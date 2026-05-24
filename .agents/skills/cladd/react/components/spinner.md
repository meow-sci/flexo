---
title: "Spinner"
description: "Spinning indicator for inline loading states."
links:
  doc: https://cladd.io/react/components/spinner/
  api: https://cladd.io/react/components/spinner/#api-reference
---

# Spinner

`Spinner` is the inline loading indicator — a slim accent-coloured ring that spins until the work behind it finishes. It shares the same `2xs → 2xl` sizing scale as [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), and [`Shortcut`](/react/components/shortcut/), so it slots into any control or surface at a matched proportion. Pass it as the icon of a [`Toast`](/react/components/toast/) for "Uploading…", drop it inside a [`Button`](/react/components/button/) for an inline "Saving" state, or stick it in an [`Input`](/react/components/input/) suffix for an async-validation indicator.

![Overview](https://cladd.io/screenshots/components/spinner/overview.png)

```tsx
<Spinner size="2xs" />
<Spinner size="xs" color="brand" />
<Spinner size="sm" color="green" />
<Spinner size="md" color="red" />
<Spinner size="lg" color="purple" />
<Spinner size="xl" color="cyan" />
<Spinner size="2xl" color="yellow" />
```

## Usage

```tsx
import { Spinner } from '@cladd-ui/react';

<Spinner size="lg" color="brand" />;
```

A bare `Spinner` is a single self-contained element — no portal, no overlay, no surrounding text. Size and accent color are the only knobs. It picks up the theme accent automatically; pass `color` to override.

## Examples

### Sizes

`size` accepts the standard cladd scale — `2xs`, `xs`, `sm` (default), `md`, `lg`, `xl`, `2xl`. Reach for `2xs` / `xs` for the rare case where the spinner sits inline with very small text, `sm` and `md` for typical inline usage, and `lg` and up for standalone "loading panel" states where the spinner is the main thing on the surface.

When the spinner is nested inside a [`Button`](/react/components/button/), [`Input`](/react/components/input/), or other sized control, **pass the same size token to both**. The size scale is calibrated so that a `md` spinner is already a touch smaller than a `md` button — same way a `md` chip is — so they line up at the right proportion without any extra adjustment. The spinner itself renders at the same dimension whether it's free-standing or nested; the "smaller-than-the-button" feel is baked into the token, not the context. So a `md` button gets a `md` spinner, a `lg` input gets a `lg` spinner, etc.

[`Chip`](/react/components/chip/) is the one exception. A chip already sits at that "one step down from a button" proportion, so dropping a same-size spinner inside it would crowd the label — the convention there is one step smaller (see [Inside a chip](#inside-a-chip) below).

![Size](https://cladd.io/screenshots/components/spinner/size.png)

```tsx
<Spinner size={size} color="brand" />
```

### Colors

`color` accepts any of the eleven cladd accent tokens — the ring takes the accent's primary tone. By default the spinner inherits the theme accent set on [`CladdProvider`](/react/components/cladd-provider/), so a brand spinner doesn't usually need a `color` prop at all. Pass one when you want to signal severity (`red` for failing work, `yellow` for a warning state) or match the spinner to a non-default control like a green "deploying" pill.

![Color](https://cladd.io/screenshots/components/spinner/color.png)

```tsx
<Spinner size="xl" color={color} />
```

### Inside a button

The most common spot for a spinner — a button that needs to communicate "in flight" without changing footprint. Drop `<Spinner size={size} />` into the button's children and pass the same `size` token to both, and the spinner sits at the right proportion for the button's content row. Pair it with `readOnly` on the button to prevent double-submits while still keeping the button at full opacity (`disabled` works too but reads as "unavailable" rather than "busy").

![Inside button](https://cladd.io/screenshots/components/spinner/inside-button.png)

```tsx
<Button size={size} color="brand" readOnly={loading}>
  {loading ? <Spinner size={size} /> : null}
  {loading ? 'Saving' : 'Save changes'}
</Button>
<Button size={size} variant="solid" readOnly={loading}>
  {loading ? 'Loading' : 'Refresh'}
  {loading ? <Spinner size={size} /> : null}
</Button>
```

### Inside a chip

[`Chip`](/react/components/chip/) accepts any component in its `icon` slot — including `Spinner`. The convention here is **one step smaller than the chip**: a `md` chip pairs with a `sm` spinner, a `lg` chip with a `md` spinner, and so on. The chip already reserves a slot for a glyph, and the spinner reads as that glyph rather than a co-equal element — sizing it down keeps the ring from crowding the label. Forward the chip's `color` through `iconProps` so the ring tone matches the rest of the chip.

Useful for "deploying", "indexing", or any other ambient background-job indicator that wants a tag-shaped pill instead of a full button.

![Inside chip](https://cladd.io/screenshots/components/spinner/inside-chip.png)

```tsx
<Chip
  size={size}
  color="brand"
  outline
  icon={Spinner}
  iconProps={{ size: spinnerSize, color: 'brand' }}
>
  Deploying
</Chip>
<Chip
  size={size}
  color="yellow"
  icon={Spinner}
  iconProps={{ size: spinnerSize, color: 'yellow' }}
>
  Indexing
</Chip>
```

### Inside an input

[`Input`](/react/components/input/) exposes `prefix` / `suffix` slots that accept any ReactNode — drop a `Spinner` into `suffix` while an async check is in flight (username availability, search debounce, autosave). Stick to `xs` or `2xs` here so the indicator stays out of the way of the text.

![Inside input](https://cladd.io/screenshots/components/spinner/inside-input.png)

```tsx
<Input
  size={size}
  className="w-72"
  value={value}
  onChange={(next) => setValue(next)}
  placeholder="Pick a username"
  prefix={<span className="ml-2 text-cladd-fg-softer">@</span>}
  suffix={checking ? <Spinner size={size} className="mr-2" /> : null}
/>
```

### Inside a toast

[`Toast`](/react/components/toast/)'s `icon` prop takes an `ElementType` — pass `Spinner` for a "still working" notification. Pair it with `timeout={0}` so the toast doesn't auto-dismiss while the job is running, then drive it closed from your code when the work completes. Forward `color` through `iconProps` to keep the spinner's ring tone aligned with the toast's accent.

The same trick works with the imperative `useToast` hook — pass `icon: Spinner` and `iconProps: { color: 'brand' }` in the options bag.

![Inside toast](https://cladd.io/screenshots/components/spinner/inside-toast.png)

```tsx
<ToastRoot>
  <ToastTrigger>
    <Button>Upload file</Button>
  </ToastTrigger>
  <Toast
    icon={Spinner}
    iconProps={{ color: 'brand' }}
    title="Uploading hero.png"
    text="This shouldn’t take long."
    timeout={0}
  />
</ToastRoot>
<Button
  color="brand"
  variant="gradient"
  onClick={() =>
    toast({
      icon: Spinner,
      iconProps: { color: 'brand' },
      title: 'Syncing workspace',
      text: 'Pulling the latest from origin/main.',
      timeout: 0,
    })
  }
>
  Sync (useToast)
</Button>
```

### Standalone loading surface

For full-panel loading states — a tab that hasn't finished fetching, a settings sheet waiting on server data — center a large `Spinner` inside a [`Surface`](/react/components/surface/) with a quiet caption underneath. `xl` and `2xl` are the right sizes here; below `lg` the spinner reads as decoration rather than the focal point.

![Inside surface](https://cladd.io/screenshots/components/spinner/inside-surface.png)

```tsx
<Surface
  outline
  className="w-72 rounded-2xl"
  contentClassName="flex flex-col items-center justify-center gap-4 p-8"
>
  <Spinner size="xl" color="brand" />
  <span className="text-cladd-fg-soft">Fetching data…</span>
</Surface>
```

### Playground

`size` and `color` are the only two knobs — but they compose with every accent in the theme, so a quick scroll through both axes is the fastest way to find the right pairing for your context.

![Playground](https://cladd.io/screenshots/components/spinner/playground.png)

```tsx
<Spinner size={size} color={color} />
```

## API Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `className?` | `string` | — | Extra classes for the spinner root element. |
| `color?` | `Color` | — | Accent color for the spinning ring. Default: theme accent. |
| `size?` | `SpinnerSize` | `'sm'` | Spinner dimension. Default `'sm'`. |
