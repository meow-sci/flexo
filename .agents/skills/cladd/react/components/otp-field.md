---
title: "OTPField"
description: "Field for entering one-time codes and verification PINs."
links:
  doc: https://cladd.io/react/components/otp-field/
  api: https://cladd.io/react/components/otp-field/#api-reference
---

# OTPField

`OTPField` is the one-time-code field — the row of square cells you reach for on SMS confirmations, MFA prompts, and magic-link redemptions. It holds a single string `value` and distributes it across a fixed number of cells: typing advances focus, backspace retreats, paste auto-fills across the row, and characters that don't match the field's `pattern` are silently rejected. Compose it with `OTPFieldInput` for each cell and `OTPFieldSeparator` for the dash between groups, or skip the children entirely and pass `maxLength` to generate them for you.

![Overview](https://cladd.io/screenshots/components/otp-field/overview.png)

```tsx
<OTPField maxLength={6} value={a} onChange={setA} />
<OTPField value={b} onChange={setB} size="md">
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldSeparator />
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
</OTPField>
<OTPField
  maxLength={4}
  value={c}
  onChange={setC}
  pattern="[A-Za-z0-9]"
  inputMode="text"
  size="md"
/>
```

## Usage

```tsx
import { OTPField } from '@cladd-ui/react';

const [code, setCode] = useState('');

<OTPField maxLength={6} value={code} onChange={setCode} />;
```

For the common case — N identical cells in a single row — pass `maxLength` and skip children. The field renders that many `OTPFieldInput`s for you, wires their indexes through context, and binds the first cell's `autocomplete` to `'one-time-code'` so iOS surfaces the SMS suggestion bar automatically.

Reach for explicit children when you want a separator, a non-uniform grouping, or per-cell styling overrides:

```tsx
<OTPField value={code} onChange={setCode}>
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldSeparator />
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
</OTPField>
```

`maxLength` is inferred from the count of `OTPFieldInput` children when omitted, so you don't have to keep the two in sync.

## Examples

### Sizes

`size` accepts `sm`, `md`, `lg` (default), `xl`, `2xl` — the same scale as [`Input`](/react/components/input/), with the default one step larger because OTP cells need more presence than an inline form field. Every cell takes the same size, and the [`OTPFieldSeparator`](#otpfieldseparator) scales with the row.

![Size](https://cladd.io/screenshots/components/otp-field/size.png)

```tsx
<OTPField maxLength={6} size={size} value={value} onChange={setValue} />
```

### Grouping and separators

The flat row works for most cases, but credit-card-style codes read better when split — `XXX-XXX` for a 6-digit verification, `XXXX XXXX` for a license key, `XX·XX·XX` when you want a softer divider. Drop an `OTPFieldSeparator` between explicit `OTPFieldInput` children to insert a divider; the default is a short horizontal bar, and `children` override it with anything you want (a slash, a dot, a longer dash).

![Grouping](https://cladd.io/screenshots/components/otp-field/grouping.png)

```tsx
<OTPField maxLength={6} size="md" value={flat} onChange={setFlat} />
<OTPField size="md" value={card} onChange={setCard}>
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldSeparator>
    <span className="px-1 font-mono text-cladd-fg-softer">/</span>
  </OTPFieldSeparator>
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
</OTPField>
<OTPField
  size="md"
  value={license}
  onChange={setLicense}
  pattern="[A-Z0-9]"
  inputMode="text"
>
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldSeparator>
    <span className="px-1 font-mono text-cladd-fg-softer">·</span>
  </OTPFieldSeparator>
  <OTPFieldInput />
  <OTPFieldInput />
  <OTPFieldInput />
</OTPField>
```

### Placeholders

`placeholder` is a per-cell prop on `OTPFieldInput` — pass an explicit set of children and give each one the same glyph to fill empty cells with a visual hint. A middle dot `·` reads as a quiet "type here" without competing with the real digit; `•` is the louder, more emphatic version; an em-dash `—` evokes a fill-in-the-blank form. The placeholder disappears as soon as the user types into that cell, so partially-filled rows stay legible.

![Placeholder](https://cladd.io/screenshots/components/otp-field/placeholder.png)

```tsx
<OTPField size="md" value={dot} onChange={setDot}>
  {Array.from({ length: 6 }).map((_, i) => (
    <OTPFieldInput key={i} placeholder="·" />
  ))}
</OTPField>
<OTPField size="md" value={bullet} onChange={setBullet}>
  {Array.from({ length: 6 }).map((_, i) => (
    <OTPFieldInput key={i} placeholder="•" />
  ))}
</OTPField>
<OTPField size="md" value={dash} onChange={setDash}>
  {Array.from({ length: 6 }).map((_, i) => (
    <OTPFieldInput key={i} placeholder="—" />
  ))}
</OTPField>
```

### Custom pattern

`pattern` is a regex source that matches a _single_ allowed character — applied both to typed input and to the contents of a paste. The default `'[0-9]'` covers numeric MFA codes; set `'[A-Za-z0-9]'` for the alphanumeric backup codes a password manager would emit, or `'[A-Z]'` for an all-caps redemption code. Pair an alphanumeric pattern with `inputMode="text"` so phones surface the right keyboard.

![Pattern](https://cladd.io/screenshots/components/otp-field/pattern.png)

```tsx
<OTPField
  maxLength={6}
  size="md"
  value={digits}
  onChange={setDigits}
  pattern="[0-9]"
/>
<OTPField
  maxLength={6}
  size="md"
  value={alpha}
  onChange={setAlpha}
  pattern="[A-Za-z0-9]"
  inputMode="text"
/>
<OTPField
  maxLength={6}
  size="md"
  value={upper}
  onChange={(next) => setUpper(next.toUpperCase())}
  pattern="[A-Z]"
  inputMode="text"
/>
```

### Validation, disabled, read-only

Set `valid={false}` to flip the field into its error state — a single red focus ring runs around the whole row instead of per-cell, so a failed code reads as one wrong answer rather than six wrong cells. `disabled` dims the row and blocks all interaction. `readOnly` keeps cells focusable so the user can copy the value, but rejects edits — handy for displaying a code your server just minted.

![States](https://cladd.io/screenshots/components/otp-field/states.png)

```tsx
<OTPField
  maxLength={6}
  size="md"
  value={invalid}
  onChange={setInvalid}
  valid={false}
/>
<OTPField maxLength={6} size="md" value="000000" disabled />
<OTPField maxLength={6} size="md" value="918273" readOnly />
```

### Playground

`size`, `pattern`, `maxLength`, and the boolean state toggles compose freely.

![Playground](https://cladd.io/screenshots/components/otp-field/playground.png)

```tsx
<OTPField
  size={size}
  maxLength={length}
  pattern={pattern}
  inputMode={alphanumeric ? 'text' : 'numeric'}
  value={value}
  onChange={setValue}
  valid={valid}
  disabled={disabled}
  readOnly={readOnly}
/>
```

## API Reference

### OTPField

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | — | OTP cells - one or more `OTPFieldInput`, with optional `OTPFieldSeparator` between. |
| `className?` | `string` | — | Extra classes for the field container. |
| `disabled?` | `boolean` | — | Visually dim the field and disable interaction with all cells. |
| `inputMode?` | `'none' \| 'text' \| 'tel' \| 'url' \| 'email' \| 'numeric' \| 'decimal' \| 'search'` | `'numeric'` | Forwarded to each underlying `<input>`. Default `'numeric'` (matches the digits-only default pattern). |
| `maxLength?` | `number` | — | Maximum number of characters / cells. When omitted, inferred from the count of `OTPFieldInput` children. |
| `onChange?` | `(value: string) => void` | — | Fires whenever the OTP value changes (typing, backspace, paste, clear). |
| `pattern?` | `string` | `'[0-9]'` | Regex source that matches a single allowed character. Default `'[0-9]'`.<br>Applied as a filter for typed and pasted input. |
| `readOnly?` | `boolean` | — | Make every cell non-editable but still focusable. |
| `size?` | `InputSize` | `'lg'` | Cell size. Default `'lg'`. |
| `valid?` | `boolean` | `true` | Validity state. Default `true`. When `false`, the entire field renders a single red focus ring around all cells. |
| `value?` | `string` | — | Controlled value. The character at index `i` populates cell `i`. |

### OTPFieldInput

A single OTP cell, used as a child of `OTPField`. The parent injects each cell's `index` via `cloneElement`, so you never set it yourself — almost everything that controls rendering (`size`, `pattern`, `disabled`, `readOnly`, `inputMode`) lives on the parent and flows down through context. `OTPFieldInput`'s own props are limited to per-cell styling and an optional placeholder.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `className?` | `string` | — | Extra classes for the cell wrapper. |
| `index?` | `number` | — | Internal: cell index injected by parent `OTPField` via `cloneElement`. |
| `inputClassName?` | `string` | — | Extra classes for the underlying `<input>` element. |
| `placeholder?` | `string` | — | Input placeholder. |

### OTPFieldSeparator

The divider between OTP cells — an `aria-hidden` `<div>` with a short horizontal bar by default. Override `children` to substitute a dot, slash, dash glyph, or any other node; the wrapper handles vertical centering and inherits the field's spacing so you don't have to align it yourself.

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children?` | `ReactNode` | `'-'` | Override the separator content. Default: `'-'`. |
| `className?` | `string` | — | Extra classes for the separator element. |
