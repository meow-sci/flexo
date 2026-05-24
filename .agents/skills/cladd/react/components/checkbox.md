---
title: "Checkbox"
description: "Selectable control for binary settings and multi-choice option groups."
links:
  doc: https://cladd.io/react/components/checkbox/
  api: https://cladd.io/react/components/checkbox/#api-reference
---

# Checkbox

`Checkbox` is the standard binary toggle — a recessed thumb with a filled-gradient checked state that takes the theme accent by default. It renders a real hidden `<input type="checkbox">` for form submission, but flips to an ARIA-only mode when you need a tickable element inside a menu, popover row, or any other non-form context.

![Overview](https://cladd.io/screenshots/components/checkbox/overview.png)

```tsx
<Checkbox checked={a} onChange={setA} />
<Checkbox checked={b} onChange={setB} color="green" />
<Checkbox checked={c} onChange={setC} color="purple" size="md" />
<Checkbox checked disabled />
<Checkbox checked readOnly color="red" />
<Checkbox disabled />
```

## Usage

```tsx
import { Checkbox } from '@cladd-ui/react';

<Checkbox checked={agree} onChange={setAgree} />;
```

By default the root is a `<label>`, so a click anywhere inside the element toggles the hidden input — no extra wiring required. Pair it with text inside the same `<label>` to extend the clickable target, or pass `as="span"` / `as="div"` when the checkbox already lives inside a label-shaped parent (a [`ListButton`](/react/components/list/) with `as="label"`, for instance).

## Examples

### Sizes

`size` accepts `xs`, `sm` (default), and `md`. Unlike [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), and [`Spinner`](/react/components/spinner/) — which run the full `2xs → 2xl` scale — `Checkbox` ships only the three steps that actually make sense for a tickable square. `sm` (20px) is the inline default; `md` (24px) is the right call when the checkbox is the focal point of its row or sits inside a same-sized `md` button or list row (see [Inside a button or list row](#inside-a-button-or-list-row) below); `xs` (16px) is for very dense rows where even a `sm` thumb would feel oversized — an inspector grid, a compact filter strip.

![Size](https://cladd.io/screenshots/components/checkbox/size.png)

```tsx
<Checkbox size={size} checked />
<Checkbox size={size} />
```

### Inside a button or list row

`Checkbox`'s sizes are **nested sizes** — they're calibrated to fit _inside_ a same-sized [`Button`](/react/components/button/) or [`ListButton`](/react/components/list/) without crowding the content row. A `md` checkbox sits a touch smaller than the `md` button's text, which is the right proportion: the checkbox reads as the indicator for the row, not a co-equal control fighting the label.

Same trick as [`Spinner`](/react/components/spinner/) and [`Chip`](/react/components/chip/): pass the same `size` token to both the wrapping control and the checkbox, and the nested-vs-root sizing math is already baked in. Use `as="span"` on the checkbox so it doesn't render a nested `<label>` inside the parent label.

![Nested size](https://cladd.io/screenshots/components/checkbox/nested-size.png)

```tsx
<Button as="label" size={size} variant="transparent">
  <Checkbox
    as="span"
    size={size}
    checked={agree}
    onChange={setAgree}
    color="brand"
  />
  Subscribe to release notes
</Button>
<Button as="label" size={size} variant="transparent">
  <Checkbox
    as="span"
    size={size}
    checked={remember}
    onChange={setRemember}
  />
  Remember this device
</Button>
```

### Colors

`color` accepts any of the eleven cladd accent tokens — the accent drives the checked-state fill. When unset, the checkbox inherits the theme accent from [`CladdProvider`](/react/components/cladd-provider/), so a brand-coloured checkbox doesn't usually need a `color` prop. Pass one when the checkbox signals severity (`red` for a destructive opt-in) or sits alongside a non-default control that needs to read as a single unit.

![Color](https://cladd.io/screenshots/components/checkbox/color.png)

```tsx
<Checkbox checked color={color} size="md" />
<Checkbox checked color={color} />
```

### In a list

The canonical multi-select pattern: a [`List`](/react/components/list/) of `ListButton as="label"` rows, each with a `Checkbox` in the `icon` slot. The `ListButton` already provides the hover overlay, focus ring, and click target — the checkbox is just the indicator. `as="label"` on the row turns the whole row into a label for the nested checkbox's hidden input, so clicking anywhere in the row toggles it. Use `as="span"` on the checkbox itself to avoid a nested `<label>`.

![In list](https://cladd.io/screenshots/components/checkbox/in-list.png)

```tsx
<Surface outline className="w-64 rounded-3xl">
  <List>
    <ListTitle>Filter by status</ListTitle>
    {FILTERS.map((f) => (
      <ListButton
        key={f.id}
        as="label"
        icon={
          <Checkbox
            as="span"
            checked={selected.includes(f.id)}
            onChange={() => toggle(f.id)}
          />
        }
      >
        {f.label}
      </ListButton>
    ))}
    <ListSeparator />
    <ListButton onClick={() => setSelected([])}>Clear filters</ListButton>
  </List>
</Surface>
```

### Inline form

In compact, single-row forms — newsletter signups, quick-create dialogs, search-with-filters bars — a checkbox slots cleanly between an [`Input`](/react/components/input/) and a [`Button`](/react/components/button/) when it's wrapped in a label-shaped button of its own. The `Button as="label"` gives the checkbox-plus-text pair the same height and hit target as the surrounding controls so the row reads as one continuous strip.

![Inline form](https://cladd.io/screenshots/components/checkbox/inline-form.png)

```tsx
<form
  className="flex flex-wrap items-center gap-2"
  onSubmit={(e) => e.preventDefault()}
>
  <Input
    className="w-64"
    type="email"
    value={email}
    onChange={setEmail}
    placeholder="you@example.com"
  />
  <Button as="label" variant="transparent">
    <Checkbox
      as="span"
      checked={subscribe}
      onChange={setSubscribe}
      color="brand"
    />
    Weekly digest
  </Button>
  <Button type="submit" color="brand" variant="gradient">
    Subscribe
  </Button>
</form>
```

### Inline in text

For terms-of-service confirmations and similar consent UI, wrap a `Checkbox` and a block of prose in a single `<label>`. Drop a small top margin on the checkbox so the square aligns with the first line of text, and let the label do the click-target work — the user can tap anywhere in the paragraph to toggle.

![Inline in text](https://cladd.io/screenshots/components/checkbox/inline-in-text.png)

```tsx
<label className="flex max-w-md cursor-pointer items-start gap-2 leading-relaxed text-cladd-fg-soft">
  <Checkbox
    as="span"
    checked={accepted}
    onChange={setAccepted}
    className="mt-0.5"
  />
  <span>
    I agree to the{' '}
    <a href="#" className="text-cladd-primary hover:underline">
      terms of service
    </a>{' '}
    and the{' '}
    <a href="#" className="text-cladd-primary hover:underline">
      privacy policy
    </a>
    , and consent to receive product updates at the email above.
  </span>
</label>
```

### States

`disabled` dims the checkbox and blocks all interaction — read as "not available right now". `readOnly` blocks toggling without the dim treatment — read as "locked, but the value is real" (e.g. an enforced organisation policy the user can see but not change). `required` forwards to the native `<input>` so the browser's form validation will catch unticked submissions.

![States](https://cladd.io/screenshots/components/checkbox/states.png)

```tsx
<label className="flex items-center gap-2">
  <Checkbox as="span" checked disabled />
  <span className="text-cladd-fg-soft">Disabled, checked</span>
</label>
<label className="flex items-center gap-2">
  <Checkbox as="span" disabled />
  <span className="text-cladd-fg-soft">Disabled, unchecked</span>
</label>
<label className="flex items-center gap-2">
  <Checkbox as="span" checked readOnly color="red" />
  <span className="text-cladd-fg-soft">Read-only (locked)</span>
</label>
<label className="flex items-center gap-2">
  <Checkbox as="span" required />
  <span className="text-cladd-fg-soft">Required</span>
</label>
```

### Playground

`size`, `color`, and the boolean state toggles compose freely. `sm` covers most cases; reach for `md` when the checkbox is the focal point of a row or sits inside a `md` button or list row, and `xs` when the surrounding row is unusually dense.

![Playground](https://cladd.io/screenshots/components/checkbox/playground.png)

```tsx
<Checkbox
  checked={checked}
  onChange={setChecked}
  size={size}
  color={color}
  disabled={disabled}
  readOnly={readOnly}
/>
```

## API Reference

**Generics:** `C extends ElementType = 'label'`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `as?` | `ElementType` | `'label'` | Polymorphic root element. Defaults to `'label'` so a wrapping `<label>` activates the hidden input on click.<br> Use `'div'`/`'span'` (etc.) when the checkbox lives inside an existing label or needs a non-label container - see `hoverable`/`focusable` for how this changes interactivity. |
| `checkClassName?` | `string` | — | Extra classes for the inner check icon (e.g. to override its color or size). |
| `checked?` | `boolean` | `false` | Controlled checked state. Default `false`. |
| `className?` | `string` | — | Extra classes for the outer label/element. |
| `color?` | `Color` | — | Accent color for the checked state. Default: theme accent. |
| `disabled?` | `boolean` | — | Visually dim the checkbox and disable interaction. |
| `focusable?` | `boolean` | — | Auto-computed when omitted: `true` if `as === 'label'` OR `input` is `true`.<br>Drives whether the focus ring (`FocusableLayer`) is rendered. Override for non-label, input-less containers that still need a visible keyboard focus state. |
| `hoverable?` | `boolean` | — | Auto-computed when omitted: `true` if `as === 'label'`, otherwise `false`.<br>Override explicitly for custom containers that should still show hover affordances. |
| `input?` | `boolean` | — | When `true` (default), renders a hidden native `<input type="checkbox">` for form submission and accessibility.<br>When `false`, the component falls back to ARIA roles (`role="checkbox"`, `aria-checked`, keyboard `Space`/`Enter` toggling) and `onChange` is fired from the click handler - useful for non-form contexts (e.g. menu items) or custom controlled wrappers. |
| `inputId?` | `string` | — | `id` for the hidden `<input>`. Used to wire an external `<label htmlFor>` to this checkbox. |
| `name?` | `string` | — | Native `name` - used for form submission and to group radio-like checkboxes. |
| `onChange?` | `(checked: boolean, event?: ChangeEvent<HTMLInputElement>) => void` | — | Fires when the user toggles the checkbox. First arg is the new checked state, second is the raw event (when fired by the hidden `<input>`). |
| `onClick?` | `(e: MouseEvent) => void` | — | Fires on click of the root element. Runs before the internal toggle handler. |
| `onPointerDown?` | `(e: PointerEvent) => void` | — | Fires on pointerdown of the root element. |
| `readOnly?` | `boolean` | — | Block toggling without the disabled visual treatment - useful for "locked" states. |
| `required?` | `boolean` | — | Native `required` - forwarded to the hidden `<input>` for form validation. |
| `size?` | `CheckboxSize` | `'sm'` | Checkbox size token. Default `'sm'`. |
| `thumbOutline?` | `boolean` | `true` | Outline ring on the thumb surfaces. Default `true`. |
| `value?` | `string` | — | Native `value` - submitted with the form when `checked`. |
