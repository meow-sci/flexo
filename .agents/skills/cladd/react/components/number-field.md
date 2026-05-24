---
title: "NumberField"
description: "Numeric input with stepper buttons for picking a bounded value."
links:
  doc: https://cladd.io/react/components/number-field/
  api: https://cladd.io/react/components/number-field/#api-reference
---

# NumberField

`NumberField` is the stepper-style numeric control: a [`Surface`](/react/components/surface/) container with a `−` [`Button`](/react/components/button/) on the left, the current value in the middle, and a `+` [`Button`](/react/components/button/) on the right. Each press fires `onChange` with the new value, already clamped to `[min, max]` and offset by `step`. It's the right pick for quantities in a cart, a zoom level in an inspector, a tip percentage — anywhere the value moves in discrete increments and the user mostly nudges rather than types.

![Overview](https://cladd.io/screenshots/components/number-field/overview.png)

```tsx
<NumberField value={qty} onChange={setQty} min={1} max={99} />
<NumberField
  value={tip}
  onChange={setTip}
  min={0}
  max={100}
  step={5}
  color="brand"
  size="lg"
/>
<NumberField
  value={zoom}
  onChange={setZoom}
  input={false}
  min={25}
  max={400}
  step={25}
  rounded={false}
/>
```

## Usage

```tsx
import { NumberField } from '@cladd-ui/react';

<NumberField value={qty} onChange={setQty} min={1} max={99} />;
```

`NumberField` is controlled — pass `value` and an `onChange` handler. Increments happen via the `+` / `−` buttons; the value is clamped to `[min, max]` (defaults `0` and `1_000_000`) and offset by `step` (default `1`) before `onChange` fires. The buttons auto-disable when `value` is already at `min` or `max`, so you don't need to gate them yourself.

The middle slot renders the value in an [`Input`](/react/components/input/) by default — focusable and selectable so the user can copy the value out — but the stepper buttons own the writes. Set [`input={false}`](#input-mode) when you want a read-only chip instead.

## Examples

### Sizes

`size` accepts `sm`, `md` (default), `lg`, `xl`, `2xl` — the same scale as [`Input`](/react/components/input/) and [`Textarea`](/react/components/textarea/), forwarded to both the `+` / `−` [`Button`](/react/components/button/)s and the value display so the whole row scales as one unit. (NumberField doesn't go down to `2xs` / `xs` — those are reserved for sub-controls like the inline clear button on [`Input`](/react/components/input/).)

![Size](https://cladd.io/screenshots/components/number-field/size.png)

```tsx
<NumberField size={size} value={value} onChange={setValue} />
```

### Container variant

`variant` is the [`Surface`](/react/components/surface/) variant token applied to the **container** — `gradient` (default), `solid`, `transparent`, `solid-fill`, `gradient-fill`. The `*-fill` variants flood the container with the accent color and invert the text, useful when the field is the loud primary control on a settings card.

![Variant](https://cladd.io/screenshots/components/number-field/variant.png)

```tsx
<NumberField variant={variant} value={value} onChange={setValue} />
```

### Button variant

`buttonVariant` controls the surface variant on just the `+` / `−` buttons — `transparent` (default) keeps them as quiet glyphs inside the container, `gradient-fill` / `solid-fill` paints them in the accent color for a punchier stepper. Pair with `buttonOutline` to add an outline ring around each button independently of the container.

![Button variant](https://cladd.io/screenshots/components/number-field/button-variant.png)

```tsx
<NumberField
  value={value}
  onChange={setValue}
  buttonVariant={buttonVariant}
  buttonOutline={buttonOutline}
/>
```

### Input mode

`input` toggles how the middle slot is rendered. `input={true}` (default) renders the value in an [`Input`](/react/components/input/) — same recessed [`SurfaceCut`](/react/components/surface-cut/) chrome as a regular text field, focusable so the user can select and copy the value. `input={false}` swaps it for a read-only [`SurfaceCut`](/react/components/surface-cut/) chip — flatter, narrower, no caret. Reach for the chip variant when you don't want a focus ring competing with the buttons (toolbar steppers, sidebar zoom controls, anywhere the value is purely informational between two clicks).

![Input mode](https://cladd.io/screenshots/components/number-field/input-mode.png)

```tsx
<NumberField value={editable} onChange={setEditable} />
<NumberField value={chip} onChange={setChip} input={false} step={25} />
```

### Min, max, step

`min` (default `0`) and `max` (default `1_000_000`) clamp the value at both ends. The `−` button disables itself once `value <= min` and the `+` button once `value >= max`, so the bounds are visually obvious without extra wiring. `step` (default `1`) is the offset applied on each press — pick `5` for a tip percentage, `10` for a price, `25` for a zoom level.

![Min max step](https://cladd.io/screenshots/components/number-field/min-max-step.png)

```tsx
<NumberField value={qty} onChange={setQty} min={1} max={5} />
<NumberField
  value={price}
  onChange={setPrice}
  min={0}
  max={100}
  step={10}
  color="green"
/>
```

### Rounded

`rounded` (default `true`) pill-shapes the container and the `+` / `−` buttons; turn it off for a more rectangular, app-shell look. `valueRounded` (default `false`) pill-shapes just the middle value display — useful when you want a pill chip nested inside a squared container.

![Rounded](https://cladd.io/screenshots/components/number-field/rounded.png)

```tsx
<NumberField
  rounded={rounded}
  valueRounded={valueRounded}
  value={value}
  onChange={setValue}
/>
```

### Disabled and read-only

`disabled` dims the field to 50% and disables both buttons entirely. `readOnly` is the subtler one: the buttons stay at full opacity but stop responding to clicks, so the field reads as live but won't change — handy when a parallel action is in flight or the value is locked by a higher-level state.

![States](https://cladd.io/screenshots/components/number-field/states.png)

```tsx
<NumberField
  value={value}
  onChange={setValue}
  readOnly={readOnly}
  disabled={disabled}
/>
```

### Playground

`size`, `color`, `variant`, `rounded`, and `input` are designed to compose. Try a `2xl` `gradient-fill` field in `brand` for a hero quantity selector, or a compact `sm` `transparent` field with `input={false}` as an inline sidebar zoom control.

![Playground](https://cladd.io/screenshots/components/number-field/playground.png)

```tsx
<NumberField
  size={size}
  color={color}
  variant={variant}
  rounded={rounded}
  input={input}
  value={value}
  onChange={setValue}
  min={0}
  max={100}
/>
```

## API Reference

**Inherits from:** [`Surface`](/react/components/surface/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `buttonOutline?` | `boolean` | `false` | Outline ring on the +/− buttons. Default `false`. |
| `buttonVariant?` | `SurfaceVariant` | `'transparent'` | Surface variant applied to the +/− buttons. Default `'transparent'`. |
| `children?` | `ReactNode` | — | Custom content rendered inside the number field container (rare - most usage is value-only). |
| `className?` | `string` | — | Extra classes for the number field container. |
| `color?` | `Color` | — | Accent color token. Sets the container's `cladd-color-{name}` class - cascades to the +/− buttons. |
| `contentClassName?` | `string` | — | Extra classes for the inner `SurfaceContent` wrapper (where the −/value/+ row is laid out). |
| `disabled?` | `boolean` | — | Visually dim the number field and disable both buttons. |
| `input?` | `boolean` | — | When `true` (default), the value is rendered in an editable `Input`.<br>When `false`, the value is rendered in a read-only `SurfaceCut` chip - useful when keyboard entry is not desired. |
| `inputClassName?` | `string` | — | Extra classes for the value `Input` (or `SurfaceCut`). |
| `max?` | `number` | `1_000_000` | Default `1_000_000`. |
| `min?` | `number` | `0` | Default `0`. |
| `onChange?` | `(value: number) => void` | — | Fires after a +/− button press, with the new value (already clamped to `[min, max]`). |
| `outline?` | `boolean` | `true` | Outline ring on the number field **container**. Default `true`. |
| `readOnly?` | `boolean` | — | Block changes without the disabled visual treatment. |
| `rounded?` | `boolean` | `true` | Pill-shape the container and the +/− buttons. Default `true`. |
| `size?` | `NumberFieldSize` | `'md'` | Size token. Drives container/button height, padding, and font size. Default `'md'`. |
| `step?` | `number` | `1` | Increment per +/− press. Default `1`. |
| `surfaceLevel?` | `number \| string` | — | Forwarded to the underlying `Surface` as `level` - see `SurfaceProps.level`. |
| `value?` | `number` | `0` | Default `0`. |
| `valueRounded?` | `boolean` | `false` | Pill-shape the value display. Default `false`. |
| `variant?` | `SurfaceVariant` | `'gradient'` | Surface variant for the number field **container**. Default `'gradient'`. |
