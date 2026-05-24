---
title: "Slider"
description: "Range control for picking a value between a min and max."
links:
  doc: https://cladd.io/react/components/slider/
  api: https://cladd.io/react/components/slider/#api-reference
---

# Slider

`Slider` is the continuous-range control: a recessed [`SurfaceCut`](/react/components/surface-cut/) track, a gradient thumb that takes the theme accent, and a floating value bubble that lifts above the thumb while the user drags or focuses. Reach for it when the user cares about the _proportion_ more than the exact digit — volume, brightness, opacity, font size, zoom, mix levels. A real `<input type="range">` lives underneath, so arrow keys, Home/End, screen readers, and form submission all work out of the box.

![Overview](https://cladd.io/screenshots/components/slider/overview.png)

```tsx
<Slider value={volume} onChange={setVolume} className="w-72" />
<Slider
  value={bright}
  onChange={setBright}
  color="yellow"
  size="md"
  className="w-72"
/>
<Slider
  value={opacity}
  onChange={setOpacity}
  min={0}
  max={1}
  step={0.01}
  color="purple"
  className="w-72"
/>
```

## Usage

```tsx
import { Slider } from '@cladd-ui/react';

<Slider value={volume} onChange={setVolume} />;
```

`Slider` works in both controlled and uncontrolled modes. Pass `value` + `onChange` for controlled, or `defaultValue` for uncontrolled. `onChange` fires on every step while the user drags or arrows through values — pair it with [`debounce`](#debounce) or [`throttle`](#throttle) when the consumer is expensive (a network call, a heavy re-render in a sibling pane).

### Slider, NumberField, or NumberScrubber?

Reach for `Slider` when the value is continuous and the user benefits from seeing where they are in the range — a 30 / 100 brightness reads at a glance from the filled segment. Reach for [`NumberField`](/react/components/number-field/) when the value is _discrete_ and the user mostly nudges in steps (quantity, tip percent, page count) — the `+` / `−` buttons own the writes. Reach for [`NumberScrubber`](/react/components/number-scrubber/) when the value is _arbitrary precision_ and the user wants both a draggable handle and a typeable input in the same compact slot — the inspector pattern from design tools (`16px`, `1.45`, `-0.4`).

## Examples

### Sizes

`size` accepts `xs`, `sm` (default), and `md`. Like its siblings [`Checkbox`](/react/components/checkbox/) and [`Radio`](/react/components/radio/), `Slider` rides the thumb-scale ramp instead of the full `2xs → 2xl` scale — a track-and-thumb control doesn't earn its keep at button sizes. `sm` (20px thumb) is the inline default; reach for `md` (24px) when the slider is the focal control of its row or the surrounding controls are `md`-sized; reach for `xs` (16px) in tight inspector rows where every pixel of vertical space matters.

![Size](https://cladd.io/screenshots/components/slider/size.png)

```tsx
<Slider size={size} value={a} onChange={setA} className="w-72" />
<Slider size={size} value={b} onChange={setB} className="w-72" />
```

### Colors

`color` accepts any of the eleven cladd accent tokens — the accent drives both the filled segment of the track and the thumb's gradient fill. When unset, the slider inherits the theme accent from [`CladdProvider`](/react/components/cladd-provider/), so a brand-coloured slider doesn't usually need a `color` prop. Pass one when the slider signals semantics (`red` for "destructive volume", `yellow` for brightness) or when it sits alongside a non-default control that needs to read as a single unit.

![Color](https://cladd.io/screenshots/components/slider/color.png)

```tsx
<Slider
  color={color}
  value={value}
  onChange={setValue}
  className="w-72"
/>
```

### Min, max, step

`min` (default `0`), `max` (default `100`), and `step` (default `1`) define the value space. The defaults are calibrated for percentage-shaped values; override all three for normalised ranges (`0 → 1` with `step={0.01}` for opacity), wide ranges (`25 → 400` with `step={25}` for zoom levels), or signed ranges (`-2 → 8` for letter spacing). The thumb snaps to `step` on drag and on keyboard arrow presses.

![Min max step](https://cladd.io/screenshots/components/slider/min-max-step.png)

```tsx
<Slider value={pct} onChange={setPct} step={5} className="w-72" />
<Slider
  value={opacity}
  onChange={setOpacity}
  min={0}
  max={1}
  step={0.01}
  color="purple"
  className="w-72"
/>
<Slider
  value={zoom}
  onChange={setZoom}
  min={25}
  max={400}
  step={25}
  color="cyan"
  className="w-72"
/>
```

### Scale

`scale` controls how user values map to thumb position on the track. The default `'linear'` is right for percentages, opacity, brightness — anything where equal pixel movement should feel like equal numerical change. Reach for `'log'` (requires `min > 0`) when the user cares about _ratios_, not absolute differences: an audio frequency picker spans 20 Hz → 20 kHz, but the interesting region for human hearing is the lower decade, so a linear track wastes most of its travel on near-inaudible high frequencies. Compare the two below — the logarithmic slider gives 1 kHz about half the track instead of 5% of it.

For curves that aren't logarithmic — quadratic, S-curve, custom price brackets — pass a `{ toSlider, fromSlider }` pair instead, where `toSlider(value) → position` returns 0..1 and `fromSlider(position) → value` is the inverse. `min`, `max`, and `value` stay in user-value space, and `step` is still applied after the inverse mapping, so the emitted value stays grid-aligned.

```tsx
<div className="flex w-72 flex-col gap-4">
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <SectionTitle>Linear</SectionTitle>
      <span className="text-cladd-fg-soft tabular-nums">
        {linearHz.toLocaleString()} Hz
      </span>
    </div>
    <Slider
      value={linearHz}
      onChange={setLinearHz}
      min={20}
      max={20000}
      color="cyan"
    />
  </div>
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <SectionTitle>Logarithmic</SectionTitle>
      <span className="text-cladd-fg-soft tabular-nums">
        {logHz.toLocaleString()} Hz
      </span>
    </div>
    <Slider
      value={logHz}
      onChange={setLogHz}
      min={20}
      max={20000}
      scale="log"
      color="cyan"
    />
  </div>
</div>
```

### Value display

The slider renders a floating value bubble above the thumb while the user drags or focuses — handy for confirming the exact landing value mid-gesture. For the resting state, pair the slider with an external readout: a [`SectionTitle`](/react/components/section-title/) label on the left, the formatted value on the right, the track between them. Format the value however the unit calls for — raw integer for volume, `xx%` for normalised opacity, `xxpx` for size.

![Value display](https://cladd.io/screenshots/components/slider/value-display.png)

```tsx
<div className="flex w-72 flex-col gap-4">
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <SectionTitle>Volume</SectionTitle>
      <span className="text-cladd-fg-soft tabular-nums">{volume}</span>
    </div>
    <Slider value={volume} onChange={setVolume} color="brand" />
  </div>
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <SectionTitle>Opacity</SectionTitle>
      <span className="text-cladd-fg-soft tabular-nums">
        {Math.round(opacity * 100)}%
      </span>
    </div>
    <Slider
      value={opacity}
      onChange={setOpacity}
      min={0}
      max={1}
      step={0.01}
      color="purple"
    />
  </div>
</div>
```

### Debounce

`debounce` (in ms, default `0`) delays the `onChange` call until the user pauses. The internal value still updates immediately, so the thumb tracks the drag with no visual lag — only the parent's `onChange` callback is throttled. Useful when the consumer is expensive: a colour-picker that re-renders a canvas, a search that hits an API, a Monaco editor that has to relayout. Drag the second slider below to feel the pause — the readout only catches up when you let go.

![Debounce](https://cladd.io/screenshots/components/slider/debounce.png)

```tsx
<div className="flex w-72 flex-col gap-4">
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <SectionTitle>Immediate</SectionTitle>
      <span className="text-cladd-fg-soft tabular-nums">{immediate}</span>
    </div>
    <Slider value={immediate} onChange={setImmediate} color="brand" />
  </div>
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <SectionTitle>Debounced 400ms</SectionTitle>
      <span className="text-cladd-fg-soft tabular-nums">{debounced}</span>
    </div>
    <Slider
      defaultValue={debounced}
      onChange={setDebounced}
      debounce={400}
      color="orange"
    />
  </div>
</div>
```

### Throttle

`throttle` (in ms, default `0`) is the lighter-touch sibling of [`debounce`](#debounce). The callback fires immediately on the first change, then at most once per N ms while the user keeps changing, with a final trailing call when they stop — so the consumer sees regular updates _during_ the drag instead of one big jump at the end. Reach for it when the side effect is too expensive to run on every step but the user still benefits from live feedback (a waveform that has to re-render, a colour preview, a live-filtered list). `throttle` takes precedence over `debounce` when both are set.

```tsx
<div className="flex w-72 flex-col gap-4">
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <SectionTitle>Immediate</SectionTitle>
      <span className="text-cladd-fg-soft tabular-nums">{immediate}</span>
    </div>
    <Slider value={immediate} onChange={setImmediate} color="brand" />
  </div>
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <SectionTitle>Throttled 200ms</SectionTitle>
      <span className="text-cladd-fg-soft tabular-nums">{throttled}</span>
    </div>
    <Slider
      defaultValue={throttled}
      onChange={setThrottled}
      throttle={200}
      color="green"
    />
  </div>
</div>
```

### Disabled and read-only

`disabled` dims the whole slider to 50% and blocks all pointer and keyboard interaction — read as "not available right now" (the audio source is muted at the OS level, the layer is locked). `readOnly` is the subtler one: the slider keeps full opacity but stops responding to drags and keys — read as "live indicator, but you can't move it from here" (an enforced organisation policy, a value driven by a sibling control).

![States](https://cladd.io/screenshots/components/slider/states.png)

```tsx
<div className="flex w-72 flex-col gap-2">
  <SectionTitle>Disabled</SectionTitle>
  <Slider defaultValue={30} disabled />
</div>
<div className="flex w-72 flex-col gap-2">
  <SectionTitle>Read-only</SectionTitle>
  <Slider defaultValue={70} readOnly color="red" />
</div>
```

### Inspector row

The canonical design-tool pattern: a [`Surface`](/react/components/surface/) panel with a label column, a slider column, and a value column on a single grid. Each row sets its own `min` / `max` / `step` because the unit is different (px for size, unitless for line-height, em-fractions for letter-spacing). The shared accent colour ties the group together; the value column does the formatting. This is what cladd was designed for: dense, but not crowded.

![Inspector](https://cladd.io/screenshots/components/slider/inspector.png)

```tsx
<div className="flex w-72 flex-col gap-2">
  <SectionTitle>Typography</SectionTitle>
  <div className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2">
    <span className="text-cladd-fg-soft">Size</span>
    <Slider
      value={fontSize}
      onChange={setFontSize}
      min={8}
      max={64}
      color="brand"
    />
    <span className="text-right text-cladd-fg-soft tabular-nums">
      {fontSize}px
    </span>
    <span className="text-cladd-fg-soft">Line height</span>
    <Slider
      value={lineHeight}
      onChange={setLineHeight}
      min={1}
      max={2}
      step={0.05}
      color="brand"
    />
    <span className="text-right text-cladd-fg-soft tabular-nums">
      {lineHeight.toFixed(2)}
    </span>
    <span className="text-cladd-fg-soft">Letter spacing</span>
    <Slider
      value={letter}
      onChange={setLetter}
      min={-2}
      max={8}
      step={0.1}
      color="brand"
    />
    <span className="text-right text-cladd-fg-soft tabular-nums">
      {letter.toFixed(1)}
    </span>
  </div>
</div>
```

### Playground

`size`, `color`, and the state toggles compose freely. `sm` covers most cases; reach for `md` when the slider is the focal control of its row, and `xs` for very tight inspector rows.

![Playground](https://cladd.io/screenshots/components/slider/playground.png)

```tsx
<Slider
  value={value}
  onChange={setValue}
  size={size}
  color={color}
  disabled={disabled}
  readOnly={readOnly}
  className="w-72"
/>
```

## API Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `className?` | `string` | — | Extra classes for the slider container. |
| `color?` | `Color` | — | Accent color for the active track segment and thumb. Default: theme accent. |
| `debounce?` | `number` | — | Debounce onChange calls in ms. Fires once after the user stops changing for N ms. Defaults to 0 (immediate). |
| `defaultValue?` | `number` | `0` | Initial value (uncontrolled). Default `0`.<br>Ignored when `value` is provided. |
| `disabled?` | `boolean` | — | Visually dim the slider and disable interaction. |
| `input?` | `boolean` | — | Reserved - currently unused in the rendered output (the underlying `<input type="range">` is always present). Kept for parity with other form components. |
| `max?` | `number` | `100` | Default `100`. |
| `min?` | `number` | `0` | Default `0`. |
| `onChange?` | `(value: number, event?: ChangeEvent<HTMLInputElement>) => void` | — | Fires while the user drags or types a new value (subject to `debounce` / `throttle`). |
| `readOnly?` | `boolean` | — | Block dragging without the disabled visual treatment. |
| `scale?` | `SliderScale` | `'linear'` | Value-to-position mapping. Default `'linear'`.<br>Use `'log'` (requires `min > 0`) for ranges where ratios matter more than absolute differences — audio frequency, zoom, price brackets.<br>Pass a custom `{ toSlider, fromSlider }` pair for any other curve (quadratic, S-curve, etc.).<br>`min`, `max`, and `value` are always in user-value space. `step` is applied to the emitted value after the inverse mapping (see `step`). |
| `size?` | `SliderSize` | `'sm'` | Slider size token. Drives track and thumb dimensions. Default `'sm'`. |
| `step?` | `number` | `1` | Step size for the emitted value. Default `1`.<br>For non-linear `scale`, the user value is rounded to the nearest `step` after the inverse mapping — so a `log` slider with `step={1}` still emits integer values, but those steps are spaced logarithmically on the track. |
| `throttle?` | `number` | — | Throttle onChange calls in ms. Fires immediately, then at most once per N ms while changing, with a trailing call for the final value. Defaults to 0 (immediate).<br>Takes precedence over `debounce` when both are set. |
| `thumbOutline?` | `boolean` | `true` | Outline ring on the thumb surface. Default `true`. |
| `value?` | `number` | — | Controlled value. When omitted, the component falls back to uncontrolled mode using `defaultValue`. |
