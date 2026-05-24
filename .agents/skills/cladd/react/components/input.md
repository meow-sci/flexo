---
title: "Input"
description: "Single-line text field for short user input."
links:
  doc: https://cladd.io/react/components/input/
  api: https://cladd.io/react/components/input/#api-reference
---

# Input

`Input` is the workhorse text field. It wraps a native `<input>` in a [`SurfaceCut`](/react/components/surface-cut/) so it inherits the cladd recess, hover, and focus-ring treatments, then layers on the bits a real form needs: `prefix` / `suffix` / `icon` slots, an opt-in `clearButton`, a separate `displayValue` for formatted display, validation with floating `infoMessage` / `errorMessage`, and the standard `sm → 2xl` size scale.

![Overview](https://cladd.io/screenshots/components/input/overview.png)

```tsx
<Input
  className="w-80"
  value={name}
  onChange={setName}
  placeholder="Full name"
  infoMessage="Your display name"
/>
<Input
  className="w-80"
  type="email"
  icon={<EnvelopeIcon />}
  value={email}
  onChange={setEmail}
  placeholder="you@example.com"
/>
<Input
  className="w-80"
  value={slug}
  onChange={setSlug}
  placeholder="URL slug"
  prefix={<span className="ml-2 text-cladd-fg-softer">cladd.io/</span>}
  inputClassName="pl-1"
  suffix={
    <Chip size="sm" color="green" className="mr-2">
      available
    </Chip>
  }
/>
<Input
  className="w-80"
  value={search}
  onChange={setSearch}
  placeholder="Search projects"
  clearButton
  onClear={() => setSearch('')}
/>
<Input
  className="w-80"
  value={amount}
  type="number"
  onChange={setAmount}
  displayValue={`$${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
  })}`}
  prefix={<span className="ml-2 text-cladd-fg-softer">USD</span>}
  inputClassName="text-right justify-end"
/>
```

## Usage

```tsx
import { Input } from '@cladd-ui/react';

<Input
  value={name}
  onChange={setName}
  placeholder="Project name"
  infoMessage="Visible to your team"
/>;
```

`Input` is controlled — pass `value` and an `onChange` handler. The handler receives `(value, event)` so you usually just need the first argument. By default it renders a `<div>` wrapping an `<input type="text">`; swap the wrapper with `as` or the inner control with `inputComponent` (e.g. for a masked-input library) while keeping the cladd chrome.

## Examples

### Sizes

`size` accepts `sm`, `md`, `lg` (default), `xl`, `2xl`. The font stays compact at every step — the height is what scales — so dense forms stay legible without redesigning labels. (Note: `Input` doesn't go down to `2xs` / `xs` — those steps are reserved for sub-controls like the inline clear button, which sizes itself one step smaller automatically.) [`Chip`](/react/components/chip/), [`Spinner`](/react/components/spinner/), and other interactive controls share this scale, so when you nest one in `prefix` or `suffix` you can pass the matching `size` token and it sits at the right proportion — see the [prefix/suffix example](#prefix-and-suffix) below.

![Size](https://cladd.io/screenshots/components/input/size.png)

```tsx
<Input
  className="w-80"
  size={size}
  value={value}
  onChange={setValue}
  placeholder="Project name"
/>
```

### Icon

`icon` renders an absolutely-positioned glyph on the left and shifts the input padding to make room. It's the classic search/email/lookup affordance — purely decorative, not interactive. For an interactive trailing element (a clear button, a status chip, a unit toggle) reach for `suffix` instead.

![Icon](https://cladd.io/screenshots/components/input/icon.png)

```tsx
<Input
  className="w-80"
  size={size}
  type="email"
  icon={<EnvelopeIcon />}
  value={value}
  onChange={setValue}
  placeholder="you@example.com"
/>
```

### Prefix and suffix

`prefix` and `suffix` render inside the surface, before and after the input element — perfect for currency symbols, unit labels, status chips, or inline spinners. When you put a [`Chip`](/react/components/chip/) or [`Spinner`](/react/components/spinner/) in either slot, pass the matching `size` token so it tracks the input's height. Add a small horizontal margin (`ml-2` / `mr-2`) and trim the input's own padding with `inputClassName="pl-1"` / `"pr-1"` so the slot reads as part of the field instead of floating.

![Prefix suffix](https://cladd.io/screenshots/components/input/prefix-suffix.png)

```tsx
<Input
  className="w-80"
  size={size}
  value={domain}
  onChange={setDomain}
  placeholder="subdomain"
  prefix={<span className="ml-2 text-cladd-fg-softer">https://</span>}
  suffix={<span className="mr-2 text-cladd-fg-softer">.cladd.io</span>}
  inputClassName="px-1"
/>
<Input
  className="w-80"
  size={size}
  value={domain}
  onChange={setDomain}
  placeholder="username"
  prefix={<span className="ml-2 text-cladd-fg-softer">@</span>}
  inputClassName="pl-1"
  suffix={
    pending ? (
      <Spinner size={size} color="brand" className="mr-2" />
    ) : (
      <Chip size={size} color="green" icon={CheckIcon} className="mr-2">
        free
      </Chip>
    )
  }
/>
```

### Clear button

`clearButton` renders an inline `×` button on the right that fires `onClear`. It's automatically hidden (with a small scale-out transition) when `value` is empty, so the field stays clean until there's something to clear. The button sits one step below the input on the size scale, so an `lg` input gets an `sm` clear button — drop it in next to a search [`icon`](#icon) and the proportions look right at any size.

![Clear button](https://cladd.io/screenshots/components/input/clear-button.png)

```tsx
<Input
  className="w-80"
  size={size}
  value={value}
  onChange={setValue}
  placeholder="Search"
  icon={<NoteIcon />}
  clearButton
  onClear={() => setValue('')}
/>
```

### Display value

`displayValue` renders a custom node in place of the raw `value` while the input is unfocused (or `readOnly`). On focus the real value comes back so the user can edit it. Use it for currency that should read as `$1,234.56` but store as `1234.56`, phone numbers that format as `(555) 123-4567` but store as digits, dates, IDs, anything where the display form differs from the edit form.

![Display value](https://cladd.io/screenshots/components/input/display-value.png)

```tsx
<Input
  className="w-80"
  value={amount}
  type="number"
  onChange={setAmount}
  displayValue={`$${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
  })}`}
  prefix={<span className="ml-2 text-cladd-fg-softer">Amount</span>}
  inputClassName="text-right justify-end"
/>
<Input
  className="w-80"
  value={phone}
  onChange={setPhone}
  displayValue={
    phone.length === 10
      ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
      : phone
  }
  prefix={<span className="ml-2 text-cladd-fg-softer">+1</span>}
  inputClassName="pl-1"
/>
```

### Validation

Set `valid={false}` to switch the focus ring to red and surface `errorMessage` as a floating chip above the field — visible always, no focus required. `infoMessage` is the calmer counterpart: a floating hint that appears on focus and uses the input's accent `color`. Pair them on the same field and the right one shows for the current state.

![Validation](https://cladd.io/screenshots/components/input/validation.png)

```tsx
<Input
  className="w-80"
  value={name}
  onChange={setName}
  placeholder="Display name"
  infoMessage="Visible to your team"
/>
<Input
  className="w-80"
  type="email"
  value={email}
  onChange={setEmail}
  placeholder="Email"
  valid={validEmail}
  errorMessage="Enter a valid email address"
  infoMessage="We’ll send a confirmation"
/>
<Input
  className="w-80"
  type="password"
  value={password}
  onChange={setPassword}
  placeholder="Password"
  valid={password.length >= 8}
  errorMessage="At least 8 characters"
  infoMessage="Mix letters, numbers, and symbols"
/>
```

### Disabled and read-only

`disabled` dims the field to 50% and disables interaction entirely. `readOnly` is the subtler one: the field stays at full opacity and remains focusable (so the user can select and copy the value) but rejects edits and hides any `infoMessage`. Use `readOnly` for values that read as live but shouldn't change right now — a locked slug while a deploy is in flight, a generated key, a computed total.

![States](https://cladd.io/screenshots/components/input/states.png)

```tsx
<Input
  className="w-80"
  value="acme-marketing"
  onChange={() => {}}
  readOnly={readOnly}
  disabled={disabled}
  prefix={<span className="ml-2 text-cladd-fg-softer">cladd.io/</span>}
  inputClassName="pl-1"
/>
```

### Playground

`size`, `color`, `rounded`, `icon`, and `clearButton` are designed to compose. Try a `rounded` `xl` input with `color="green"` for a hero search, or a compact `sm` input with both an icon and a clear button for a sidebar filter.

![Playground](https://cladd.io/screenshots/components/input/playground.png)

```tsx
<Input
  className="w-80"
  size={size}
  color={color}
  rounded={rounded}
  value={value}
  onChange={setValue}
  placeholder="Search"
  icon={withIcon ? <NoteIcon /> : undefined}
  clearButton={withClear}
  onClear={() => setValue('')}
  infoMessage="Type to filter"
/>
```

## API Reference

**Generics:** `C extends ElementType = 'div', IC extends ElementType = 'input'`

**Inherits from:** [`SurfaceCutOwn`](/react/components/surface-cut-own/)

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'div'` | Polymorphic **wrapper** element. Defaults to `'div'`. (For the inner input, see `inputComponent`.) |
| `autoFocus?` | `boolean` | — | Native `autoFocus` - focus the input on mount. |
| `className?` | `string` | — | Extra classes for the outer wrapper. |
| `clearButton?` | `boolean` | — | Render a clear (X) button on the right that fires `onClear`. Hidden when `value` is empty. |
| `color?` | `Color` | — | Accent color token. Drives the focus ring and `infoMessage` colors. Default: theme accent. |
| `contentClassName?` | `string` | — | Extra classes for the inner `SurfaceCut` content area (where prefix/input/suffix live). |
| `disabled?` | `boolean` | `false` | Visually dim the input and disable interaction. Default `false`. |
| `displayValue?` | `ReactNode` | — | Custom node displayed in place of the raw `value` while the input is `readOnly` or unfocused.<br>Useful for formatted display (e.g. show "1,234.56" while the underlying value is `1234.56`) - the real value re-appears on focus for editing. |
| `errorMessage?` | `ReactNode` | — | Floating error label. Always visible (no focus required) when `valid === false`. |
| `icon?` | `ReactNode` | — | Icon node rendered inside the surface, absolutely positioned on the left. Shifts input padding. |
| `infoMessage?` | `ReactNode` | — | Floating label shown above the input on focus. Hidden when `valid === false` or `readOnly`. |
| `inputClassName?` | `string` | — | Extra classes for the actual `<input>` element (or `inputComponent`). |
| `inputComponent?` | `ElementType` | `'input'` | Polymorphic **input** element. Defaults to `'input'`. Use this to swap in a custom component (e.g. a masked input library) that should still inherit the Input chrome (focus ring, clear button, prefix/suffix, etc.). |
| `inputComponentProps?` | `Partial<ComponentPropsWithoutRef<ElementType>>` | — | Extra props forwarded to the `inputComponent`. Typed against the chosen component. |
| `inputId?` | `string` | — | `id` for the inner `<input>`. Used to wire an external `<label htmlFor>`. |
| `inputMode?` | `'none' \| 'text' \| 'tel' \| 'url' \| 'email' \| 'numeric' \| 'decimal' \| 'search'` | — | Native `inputMode` - hints at the mobile keyboard layout to display. |
| `inputRef?` | `Ref<HTMLInputElement>` | — | Forwarded to the inner `<input>` (or `inputComponent`) element. |
| `max?` | `number \| string` | — | Native `max` attribute. Forwarded to the inner `<input>` (useful for `type="number"`/`"date"`). |
| `maxLength?` | `number` | — | Native `maxLength` attribute. |
| `min?` | `number \| string` | — | Native `min` attribute. Forwarded to the inner `<input>` (useful for `type="number"`/`"date"`). |
| `name?` | `string` | — | Native `name` attribute, used for form submission. |
| `onBlur?` | `(e: FocusEvent<HTMLInputElement>) => void` | — | Forwarded to the inner `<input>` - fires when the input loses focus. |
| `onChange?` | `(value: string, event: ChangeEvent<HTMLInputElement>) => void` | — | Fires on every keystroke. First arg is the new value, second is the raw event. |
| `onClear?` | `() => void` | — | Called when the clear button is pressed. Pair with `clearButton`. |
| `onFocus?` | `(e: FocusEvent<HTMLInputElement>) => void` | — | Forwarded to the inner `<input>` - fires when the input gains focus. |
| `onKeyDown?` | `(e: KeyboardEvent<HTMLInputElement>) => void` | — | Forwarded to the inner `<input>` - fires on key down. |
| `pattern?` | `string` | — | Native `pattern` attribute - regex validated on form submission. |
| `placeholder?` | `string` | — | Native `placeholder` shown when the input is empty. |
| `prefix?` | `ReactNode` | — | Slot rendered before the input element, inside the surface (e.g. unit label, currency symbol). |
| `readOnly?` | `boolean` | — | Make the input non-editable but still focusable for value display/copying. |
| `required?` | `boolean` | `false` | Native `required` attribute. Default `false`. |
| `rounded?` | `boolean` | `false` | Apply pill (`rounded-full`) corners. Default `false` - uses size-specific radii. |
| `size?` | `InputSize` | `'lg'` | Input size token. Drives height, padding, and font size. Default `'lg'`. |
| `step?` | `number \| string` | — | Native `step` attribute. Forwarded to the inner `<input>` (useful for `type="number"`). |
| `suffix?` | `ReactNode` | — | Slot rendered after the input element, inside the surface. |
| `type?` | `string` | `'text'` | Native `<input type>`. Default `'text'`. |
| `valid?` | `boolean` | `true` | Validity state. Default `true`. When `false`, switches the focus ring to red and shows `errorMessage` (instead of `infoMessage`). |
| `value?` | `string \| number` | — | Controlled value. |
