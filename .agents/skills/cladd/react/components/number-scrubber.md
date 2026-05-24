---
title: "NumberScrubber"
description: "Drag-to-change numeric control for inspector and design-tool inputs."
links:
  doc: https://cladd.io/react/components/number-scrubber/
  api: https://cladd.io/react/components/number-scrubber/#api-reference
---

# NumberScrubber

`NumberScrubber` is the inspector control — the compact field you drag horizontally to nudge a number and click to type one in. It's what powers the font-size, padding, opacity, and rotation rows in a design-tool sidebar: a single value, no spinner buttons, no slider rail, just a draggable handle that doubles as an editable input. Click the value to edit, drag to scrub, hold <kbd>Shift</kbd> mid-drag for a different precision.

![Overview](https://cladd.io/screenshots/components/number-scrubber/overview.png)

```tsx
<div className="flex w-72 flex-col gap-2">
  <SectionTitle>Type</SectionTitle>
  <div className="grid grid-cols-2 gap-2">
    <NumberScrubber
      value={fontSize}
      onChange={setFontSize}
      min={8}
      max={120}
      displayValue={(v) => `${v}px`}
    />
    <NumberScrubber
      value={tracking}
      onChange={setTracking}
      min={-20}
      max={200}
      step={1}
      displayValue={(v) => `${v > 0 ? '+' : ''}${v}`}
    />
  </div>
  <SectionTitle className="mt-2">Layer</SectionTitle>
  <div className="grid grid-cols-2 gap-2">
    <NumberScrubber
      value={opacity}
      onChange={setOpacity}
      min={0}
      max={100}
      displayValue={(v) => `${v}%`}
    />
    <NumberScrubber
      value={rotation}
      onChange={setRotation}
      min={-360}
      max={360}
      displayValue={(v) => `${v}°`}
    />
  </div>
</div>
```

It pairs with [`NumberField`](/react/components/number-field/) — same value shape, different gesture. `NumberField` is the explicit `−/+` stepper for forms and settings (clear affordance, no hidden gesture); `NumberScrubber` is the dense inspector control for apps where the user is going to touch dozens of numeric values and a `±` button per field would crowd the panel.

## Usage

```tsx
import { NumberScrubber } from '@cladd-ui/react';

<NumberScrubber
  value={fontSize}
  onChange={setFontSize}
  min={8}
  max={120}
  displayValue={(v) => `${v}px`}
/>;
```

`NumberScrubber` is controlled — pass `value` and an `onChange` handler. `onChange` fires once per gesture: on pointer-up after a drag, on <kbd>Enter</kbd> / blur after an edit. The displayed value updates imperatively during a drag (so the field stays in sync without forcing a re-render per pixel) and then commits the final, clamped, rounded value through `onChange`. If you also need a per-pixel signal for live preview, see [`onTemporaryChange`](#temporary-change).

## Examples

### Sizes

`size` accepts `sm`, `md` (default), `lg`, `xl`, `2xl`. The size scale matches [`Input`](/react/components/input/), [`Button`](/react/components/button/), and the rest of the form controls — drop a scrubber into a [`Toolbar`](/react/components/toolbar/) or alongside a sibling control with the same `size` and the heights line up automatically. Default is `md` (not `lg` like `Input`) because the scrubber's home is dense inspector rows where every pixel of height counts.

![Size](https://cladd.io/screenshots/components/number-scrubber/size.png)

```tsx
<NumberScrubber
  size={size}
  value={value}
  onChange={setValue}
  min={0}
  max={100}
  displayValue={(v) => `${v}px`}
  className="w-28"
/>
```

### Scrub and edit

The trigger has two modes. **Drag** horizontally to scrub the value — the cursor switches to `ew-resize`, the value updates imperatively in place, and `onChange` fires once when you release. **Click** without dragging to switch into edit mode — the trigger swaps for an [`Input`](/react/components/input/), the text is auto-selected, and <kbd>Enter</kbd> or blur commits while <kbd>Escape</kbd> cancels. The two are disambiguated by movement: any pointer move past the click threshold counts as a drag, so a click never accidentally opens edit mode after a scrub, and a drag never accidentally commits a typed value.

Hold <kbd>Shift</kbd> mid-drag to switch precision — by default `altDragStep` equals `step` (one pixel per integer step, coarse) and `dragStep` is `step / 5` (five pixels per step, fine). The anchor re-locks the moment <kbd>Shift</kbd> changes, so the precision swap isn't a value jump — the cursor stays where it is and only the rate changes from that point.

![Scrub and edit](https://cladd.io/screenshots/components/number-scrubber/scrub-and-edit.png)

```tsx
<NumberScrubber
  value={value}
  onChange={setValue}
  min={0}
  max={200}
  displayValue={(v) => `${v}px`}
  className="w-32"
/>
```

### Display value

`displayValue` formats the number for display only — the underlying `value` stays numeric. Use it for units (`12px`, `45%`, `320ms`), signed values (`+5` / `-5`), degrees (`90°`), or locale-formatted counts (`1,284`). The format applies in both modes: the idle trigger renders `displayValue(value)`, and the same string is what updates imperatively during a drag. Edit mode swaps to the raw numeric string so typing isn't fighting a formatter mid-keystroke.

![Display value](https://cladd.io/screenshots/components/number-scrubber/display-value.png)

```tsx
<NumberScrubber
  value={percent}
  onChange={setPercent}
  min={0}
  max={100}
  displayValue={(v) => `${v}%`}
  className="w-28"
/>
<NumberScrubber
  value={duration}
  onChange={setDuration}
  min={0}
  max={2000}
  step={10}
  displayValue={(v) => `${v}ms`}
  className="w-28"
/>
<NumberScrubber
  value={tracking}
  onChange={setTracking}
  min={-20}
  max={20}
  displayValue={(v) => `${v > 0 ? '+' : ''}${v}`}
  className="w-28"
/>
<NumberScrubber
  value={count}
  onChange={setCount}
  min={0}
  max={1000000}
  step={1}
  displayValue={(v) => v.toLocaleString('en-US')}
  className="w-32"
/>
```

### Range and step

`min` and `max` clamp the value at both ends (defaults are `0` and `1_000_000`). `step` is the keyboard / commit increment — typed values get rounded to the nearest multiple, and drag values do too. The two drag rates are independent of `step`:

- `dragStep` — value per pixel without modifier. Defaults to `step / 5` (slow, fine — five pixels per integer step).
- `altDragStep` — value per pixel while <kbd>Shift</kbd> is held. Defaults to `step` (fast, coarse — one pixel per integer step).

You can invert the relationship — make the default fast and <kbd>Shift</kbd> precise — by passing `altDragStep` smaller than `dragStep`. This is the right default for fractional values where the integer step is already "fine" and you want <kbd>Shift</kbd> to give you sub-step nudges.

![Range step](https://cladd.io/screenshots/components/number-scrubber/range-step.png)

```tsx
<NumberScrubber
  value={coarse}
  onChange={setCoarse}
  min={0}
  max={100}
  step={5}
  dragStep={1}
  altDragStep={0.25}
  displayValue={(v) => `${v}%`}
  className="w-32"
/>
<NumberScrubber
  value={fine}
  onChange={setFine}
  min={0}
  max={5}
  step={0.05}
  dragStep={0.01}
  altDragStep={0.5}
  displayValue={(v) => v.toFixed(2)}
  className="w-32"
/>
```

### Temporary change

`onChange` is commit-only — it fires on pointer-up, not per pixel — so a controlled `value` only re-renders once per gesture. That's the right default for most cases. When you need a live preview (the canvas updating as the user drags, a CSS variable retargeting the actual styled element, an undo stack that should record one entry per gesture), wire up `onTemporaryChange` as well. It fires continuously during the drag with the in-progress value, already clamped and rounded — use it to drive ephemeral UI state, then let `onChange` commit the final value to whatever you persist.

![Temporary change](https://cladd.io/screenshots/components/number-scrubber/temporary-change.png)

```tsx
<NumberScrubber
  value={committed}
  onTemporaryChange={setPreview}
  onChange={(v) => {
    setCommitted(v);
    setPreview(v);
  }}
  min={0}
  max={128}
  displayValue={(v) => `${v}px`}
  className="w-32"
/>
<span
  className="cladd-color-brand block h-2 self-start rounded-lg bg-cladd-primary"
  style={{ width: preview }}
/>
<div className="flex items-center gap-3 font-mono text-cladd-fg-softer">
  <span className="w-25 text-right">preview: {preview}</span>
</div>
<div className="font-mono text-cladd-fg-softer">
  committed: {committed}
</div>
```

### Disabled, read-only, and the scrubber icon

`disabled` dims the trigger and disables both drag and edit. `readOnly` is the subtler one — the trigger stays at full opacity and remains focusable (so the value can be read or copied) but neither gesture is wired up. `scrubberIcon` toggles the small chevron on the left that hints at the drag affordance — keep it on inside an inspector panel where the gesture isn't otherwise telegraphed, drop it when the scrubber is read-only or when the field is small enough that the icon would dominate.

![States](https://cladd.io/screenshots/components/number-scrubber/states.png)

```tsx
<NumberScrubber
  value={48}
  onChange={() => {}}
  min={0}
  max={200}
  scrubberIcon={scrubberIcon}
  readOnly={readOnly}
  disabled={disabled}
  displayValue={(v) => `${v}px`}
  className="w-32"
/>
```

### Playground

`size`, `color`, `variant`, `outline`, `rounded`, and `scrubberIcon` compose freely. The same [`SurfaceVariant`](/react/components/surface/) values that `Surface` and `Button` accept apply here — `transparent` for a flush inspector row, `gradient` (default) for a lifted control, `solid-fill` / `gradient-fill` for a stronger accent presence. `outline` toggles the ring on the idle trigger; in edit mode the inner [`Input`](/react/components/input/) handles its own focus chrome.

![Playground](https://cladd.io/screenshots/components/number-scrubber/playground.png)

```tsx
<NumberScrubber
  size={size}
  color={color}
  variant={variant}
  outline={outline}
  rounded={rounded}
  scrubberIcon={scrubberIcon}
  value={value}
  onChange={setValue}
  min={0}
  max={200}
  displayValue={(v) => `${v}px`}
  className="w-32"
/>
```

## API Reference

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `altDragStep?` | `number` | `step` | Value advanced per pixel of drag while `Shift` is held. Default `step` (1 pixel per step - coarser scrubbing). Set lower than `dragStep` to invert the gesture. |
| `children?` | `ReactNode` | — | Optional content rendered after the formatted value (e.g. badges, suffix nodes). |
| `className?` | `string` | — | Extra classes for the trigger root (Button when idle, Input when editing). |
| `color?` | `Color` | — | Accent color token. Sets `cladd-color-{name}` on the trigger - drives text and ring colors. |
| `contentClassName?` | `string` | — | Extra classes for the inner content row of the trigger. |
| `disabled?` | `boolean` | — | Visually dim and disable all interactions (drag and edit). |
| `displayValue?` | `(value: number) => string` | — | Format the displayed value, e.g. `(v) => `${v} px``. Defaults to plain stringification. |
| `dragStep?` | `number` | `step / 5` | Value advanced per pixel of drag. Default `step / 5` (5 pixels per step - finer scrubbing). |
| `icon?` | `ReactNode` | — | Icon node rendered inside the trigger - forwarded to the inner `Input` when editing and rendered as the first child of the idle `Button`. |
| `inputClassName?` | `string` | — | Extra classes for the inner Input's input element. |
| `max?` | `number` | `1_000_000` | Maximum allowed value. Default `1_000_000`. |
| `min?` | `number` | `0` | Minimum allowed value. Default `0`. |
| `onChange?` | `(value: number) => void` | — | Fires once a drag ends (or after Enter/blur in edit mode), with the final value (already clamped to `[min, max]`). |
| `onTemporaryChange?` | `(value: number) => void` | — | Fires continuously during drag with the in-progress value (already clamped to `[min, max]`). Useful for live previewing the change without committing it to controlled state. |
| `outline?` | `boolean` | `true` | Render the surface outline ring on the idle Button. Defaults to `true`. |
| `readOnly?` | `boolean` | — | Block drag and edit while keeping the trigger visually enabled. |
| `rounded?` | `boolean` | — | When `true`, applies fully rounded corners (`rounded-full`). Default size-specific radii are used when `false`. |
| `scrubberIcon?` | `boolean` | `true` | Show the chevron-expand indicator on the left of the trigger. Default `true`. |
| `size?` | `NumberScrubberSize` | `'md'` | Trigger size - drives heights, paddings, font, and the inner Input/Button size. Default `'md'`. |
| `step?` | `number` | `1` | Increment used both for the keyboard input and to round drag deltas. Default `1`. |
| `surfaceLevel?` | `string \| number` | — | Forwarded to the underlying `Surface` as `level` - see `SurfaceProps.level` for the relative-offset (`"+1"`/`"-1"`) syntax. |
| `value?` | `number` | `0` | Current value (controlled). Default `0`. |
| `variant?` | `SurfaceVariant` | `'gradient'` | Underlying `Surface` variant used by the idle Button - see `SurfaceVariant`. Defaults to `'gradient'`. |
