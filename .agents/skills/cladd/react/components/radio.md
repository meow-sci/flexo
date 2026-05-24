---
title: "Radio"
description: "Selectable control for picking one option from a group."
links:
  doc: https://cladd.io/react/components/radio/
  api: https://cladd.io/react/components/radio/#api-reference
---

# Radio

`Radio` is the standard single-select control — a recessed thumb with a filled-gradient selected state that takes the theme accent by default. Like [`Checkbox`](/react/components/checkbox/), it renders a real hidden input for form submission and flips to an ARIA-only mode when the surrounding context already provides a label.

![Overview](https://cladd.io/screenshots/components/radio/overview.png)

```tsx
<Radio checked={pick === 'a'} onChange={() => setPick('a')} />
<Radio
  checked={pick === 'b'}
  onChange={() => setPick('b')}
  color="green"
/>
<Radio
  checked={pick === 'c'}
  onChange={() => setPick('c')}
  color="purple"
  size="md"
/>
<Radio checked disabled />
<Radio checked readOnly color="red" />
<Radio disabled />
```

## Usage

```tsx
import { Radio } from '@cladd-ui/react';

const [view, setView] = useState('list');

<Radio
  name="view"
  checked={view === 'list'}
  onChange={() => setView('list')}
/>
<Radio
  name="view"
  checked={view === 'board'}
  onChange={() => setView('board')}
/>
```

A radio set is just a group of `Radio`s sharing a single source-of-truth value — each radio compares its own option id against that value and fires `onChange` with no argument-driven toggle (you set the value directly). Wrap the set in a `<label>` (or use `as="label"`, the default) and clicking anywhere inside the label activates the hidden input. Pass `as="span"` / `as="div"` when the radio already lives inside a label-shaped parent (a [`ListButton`](/react/components/list/) with `as="label"`, for instance).

## Examples

### Sizes

`size` accepts `xs`, `sm` (default), and `md`. Unlike [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), and [`Spinner`](/react/components/spinner/) — which run the full `2xs → 2xl` scale — `Radio` ships the same three steps as its sibling [`Checkbox`](/react/components/checkbox/). `sm` (20px) is the inline default; `md` (24px) is the right call when the radio is the focal point of its row or sits inside a same-sized `md` button or list row (see [Inside a button or list row](#inside-a-button-or-list-row) below); `xs` (16px) is for very dense rows — an inspector grid or a compact filter strip where even a `sm` thumb would feel oversized.

![Size](https://cladd.io/screenshots/components/radio/size.png)

```tsx
<Radio size={size} checked />
<Radio size={size} />
```

### Inside a button or list row

`Radio`'s sizes are **nested sizes** — calibrated to fit _inside_ a same-sized [`Button`](/react/components/button/) or [`ListButton`](/react/components/list/) without crowding the content row. Pass the same `size` token to the wrapping control and the radio, and the proportions land. Use `as="span"` on the radio so it doesn't render a nested `<label>` inside the parent label.

The same `name` on every radio in the set is a hint for assistive tech and form serialization — it doesn't enable native exclusive selection (the component renders a hidden checkbox under the hood; the _parent_ enforces single-select by holding one shared value).

![Nested size](https://cladd.io/screenshots/components/radio/nested-size.png)

```tsx
<Button as="label" size={size} variant="transparent">
  <Radio
    as="span"
    size={size}
    name="theme-nested"
    checked={theme === 'system'}
    onChange={() => setTheme('system')}
    color="brand"
  />
  Match system
</Button>
<Button as="label" size={size} variant="transparent">
  <Radio
    as="span"
    size={size}
    name="theme-nested"
    checked={theme === 'light'}
    onChange={() => setTheme('light')}
  />
  Always light
</Button>
<Button as="label" size={size} variant="transparent">
  <Radio
    as="span"
    size={size}
    name="theme-nested"
    checked={theme === 'dark'}
    onChange={() => setTheme('dark')}
  />
  Always dark
</Button>
```

### Colors

`color` accepts any of the cladd accent tokens — the accent drives the selected-state fill. When unset, the radio inherits the theme accent from [`CladdProvider`](/react/components/cladd-provider/), so a brand-coloured radio set doesn't usually need a `color` prop. Pass one when the selection signals severity (`red` for a destructive option) or sits alongside a non-default control that needs to read as a single unit.

![Color](https://cladd.io/screenshots/components/radio/color.png)

```tsx
<Radio checked color={color} size="md" />
<Radio checked color={color} />
```

### In a list

The canonical single-select pattern: a [`List`](/react/components/list/) of `ListButton as="label"` rows, each with a `Radio` in the `icon` slot. The `ListButton` already provides the hover overlay, focus ring, and click target — the radio is just the indicator. `as="label"` on the row turns the whole row into a label for the nested radio's hidden input, so clicking anywhere in the row selects it. Use `as="span"` on the radio itself to avoid a nested `<label>`.

![In list](https://cladd.io/screenshots/components/radio/in-list.png)

```tsx
<Surface outline className="w-64 rounded-3xl">
  <List>
    <ListTitle>Default view</ListTitle>
    {VIEWS.map((v) => (
      <ListButton
        key={v.id}
        as="label"
        icon={
          <Radio
            as="span"
            name="default-view"
            checked={view === v.id}
            onChange={() => setView(v.id)}
          />
        }
      >
        {v.label}
      </ListButton>
    ))}
    <ListSeparator />
    <ListButton onClick={() => setView('board')}>
      Reset to default
    </ListButton>
  </List>
</Surface>
```

### Form group

When the radios _are_ the form — a settings panel choosing between mutually exclusive options, a pricing tier picker, a survey question — wrap each option in a [`Surface`](/react/components/surface/) `as="label"` and let the surface variant flip on selection. The radio sits in the corner as the indicator; the surface itself is the click target, the affordance, and the visual frame. Share a single `name` across the set so the form submission carries the picked `value`.

![Form group](https://cladd.io/screenshots/components/radio/form-group.png)

```tsx
<form
  className="flex w-96 flex-col gap-2"
  onSubmit={(e) => e.preventDefault()}
>
  {PLANS.map((p) => (
    <Surface
      key={p.id}
      as="label"
      outline
      hoverable
      clickable
      variant={plan === p.id ? 'gradient' : 'transparent'}
      className="cursor-pointer rounded-2xl"
      contentClassName="flex items-start gap-4 p-4"
    >
      <Radio
        as="span"
        name="plan"
        value={p.id}
        checked={plan === p.id}
        onChange={() => setPlan(p.id)}
        color="brand"
        className="mt-0.5"
      />
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-cladd-fg">{p.label}</span>
          <span className="font-mono text-cladd-fg-soft">{p.price}</span>
        </div>
        <p className="mt-1 text-cladd-fg-soft">{p.description}</p>
      </div>
    </Surface>
  ))}
</form>
```

### States

`disabled` dims the radio and blocks all interaction — read as "not available right now". `readOnly` blocks toggling without the dim treatment — read as "locked, but the value is real" (e.g. an enforced organisation policy the user can see but not change). `required` forwards to the native `<input>` so the browser's form validation will catch an empty submission.

![States](https://cladd.io/screenshots/components/radio/states.png)

```tsx
<label className="flex items-center gap-2">
  <Radio as="span" checked disabled />
  <span className="text-cladd-fg-soft">Disabled, selected</span>
</label>
<label className="flex items-center gap-2">
  <Radio as="span" disabled />
  <span className="text-cladd-fg-soft">Disabled, unselected</span>
</label>
<label className="flex items-center gap-2">
  <Radio as="span" checked readOnly color="red" />
  <span className="text-cladd-fg-soft">Read-only (locked)</span>
</label>
<label className="flex items-center gap-2">
  <Radio as="span" required />
  <span className="text-cladd-fg-soft">Required</span>
</label>
```

### Playground

`size`, `color`, and the boolean state toggles compose freely. `sm` covers most cases; reach for `md` when the radio is the focal point of a row or sits inside a `md` button or list row, and `xs` when the surrounding row is unusually dense.

![Playground](https://cladd.io/screenshots/components/radio/playground.png)

```tsx
<Radio
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
| `as?` | `ElementType` | `'label'` | Polymorphic root element. Defaults to `'label'` so a wrapping `<label>` activates the hidden input on click. Use a non-label container when the radio lives inside an existing label — see `hoverable`/`focusable` for how this changes interactivity. |
| `checked?` | `boolean` | `false` | Controlled checked state. Default `false`. |
| `className?` | `string` | — | Extra classes for the outer label/element. |
| `color?` | `Color` | — | Accent color for the checked state. Default: theme accent. |
| `disabled?` | `boolean` | — | Visually dim the radio and disable interaction. |
| `focusable?` | `boolean` | — | Auto-computed when omitted: `true` if `as === 'label'` OR `input` is `true`.<br>Drives whether the focus ring (`FocusableLayer`) is rendered. |
| `hoverable?` | `boolean` | — | Auto-computed when omitted: `true` if `as === 'label'`, otherwise `false`.<br>Override explicitly for custom containers that should still show hover affordances. |
| `input?` | `boolean` | — | When `true` (default), renders a hidden native input for form submission and accessibility.<br>When `false`, the component falls back to ARIA roles (`role="radio"`, `aria-checked`, keyboard `Space`/`Enter` toggling) and `onChange` fires from the click handler. |
| `inputId?` | `string` | — | `id` for the hidden `<input>`. Used to wire an external `<label htmlFor>` to this radio. |
| `name?` | `string` | — | Native `name` - used to group radios in the same set. |
| `onChange?` | `(checked: boolean, event?: ChangeEvent<HTMLInputElement>) => void` | — | Fires when the user toggles the radio. First arg is the new checked state, second is the raw event. |
| `onClick?` | `(e: MouseEvent) => void` | — | Fires on click of the root element. Runs before the internal toggle handler. |
| `onPointerDown?` | `(e: PointerEvent) => void` | — | Fires on pointerdown of the root element. |
| `readOnly?` | `boolean` | — | Block toggling without the disabled visual treatment. |
| `required?` | `boolean` | — | Native `required` - forwarded to the hidden `<input>` for form validation. |
| `size?` | `RadioSize` | `'sm'` | Radio size token. Default `'sm'`. |
| `thumbOutline?` | `boolean` | `true` | Outline ring on the thumb surfaces. Default `true`. |
| `value?` | `string` | — | Native `value` - submitted with the form when `checked`. |
