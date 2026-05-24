---
title: "Switch"
description: "Binary toggle for immediate-effect on/off settings."
links:
  doc: https://cladd.io/react/components/switch/
  api: https://cladd.io/react/components/switch/#api-reference
---

# Switch

`Switch` is the binary toggle for changes that take effect _the moment the user flips it_ — dark mode on, notifications off, beta features enabled. The thumb slides between a recessed off track and a filled-gradient on state that takes the theme accent by default. Like [`Checkbox`](/react/components/checkbox/) it renders a real hidden `<input type="checkbox" role="switch">` for accessibility and form submission, but flips to an ARIA-only mode when the surrounding context already provides a label.

![Overview](https://cladd.io/screenshots/components/switch/overview.png)

```tsx
<Switch checked={a} onChange={setA} />
<Switch checked={b} onChange={setB} color="green" />
<Switch checked={c} onChange={setC} color="purple" size="md" />
<Switch checked disabled />
<Switch checked readOnly color="red" />
<Switch disabled />
```

## Usage

```tsx
import { Switch } from '@cladd-ui/react';

<Switch checked={notifications} onChange={setNotifications} />;
```

By default the root is a `<label>`, so a click anywhere inside the element toggles the hidden input — no extra wiring required. Pair it with text inside the same `<label>` to extend the clickable target, or pass `as="span"` / `as="div"` when the switch already lives inside a label-shaped parent (a [`ListButton`](/react/components/list/) with `as="label"`, for instance).

### Switch or Checkbox?

Reach for `Switch` when toggling the control applies the change immediately — settings panels, feature flags, mode pickers in a [`Toolbar`](/react/components/toolbar/). Reach for [`Checkbox`](/react/components/checkbox/) when the value is part of a form that's submitted as a whole — terms-of-service acceptance, "remember me", a list of filters that only takes effect once the user hits Apply. The visual difference (sliding thumb vs. tick mark) signals the difference in behaviour to the user.

## Examples

### Sizes

`size` accepts `sm` (default) and `md`. Like its siblings [`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), and [`Slider`](/react/components/slider/), `Switch` rides the thumb-scale ramp instead of the full `2xs → 2xl` scale — but it sits out the `xs` step the others ship: a 16 px-wide toggle has nowhere for the thumb to travel. `sm` is the inline default; reach for `md` when the switch is the focal point of its row or sits inside a same-sized `md` button or list row (see [Inside a button or list row](#inside-a-button-or-list-row) below).

![Size](https://cladd.io/screenshots/components/switch/size.png)

```tsx
<Switch size={size} checked />
<Switch size={size} />
```

### Inside a button or list row

`Switch`'s two sizes are **nested sizes** — calibrated to fit _inside_ a [`Button`](/react/components/button/) or [`ListButton`](/react/components/list/) without crowding the content row. Drop a `size="sm"` switch into an `md` button (or `as="label"` list row) and the switch reads as the indicator for the row rather than a co-equal control fighting the label. Use `as="span"` on the switch so it doesn't render a nested `<label>` inside the parent label.

![Nested size](https://cladd.io/screenshots/components/switch/nested-size.png)

```tsx
<Button as="label" size="lg" rounded contentClassName="pl-1">
  <Switch
    as="span"
    size="sm"
    checked={autosave}
    onChange={setAutosave}
    color="brand"
  />
  Autosave drafts
</Button>
<Button as="label" size="lg" rounded contentClassName="pl-1">
  <Switch
    as="span"
    size="sm"
    checked={analytics}
    onChange={setAnalytics}
  />
  Share anonymous analytics
</Button>
```

### Colors

`color` accepts any of the eleven cladd accent tokens — the accent drives the on-state thumb fill. When unset, the switch inherits the theme accent from [`CladdProvider`](/react/components/cladd-provider/), so a brand-coloured toggle doesn't usually need a `color` prop. Pass one when the toggle signals severity (`red` for "delete on save") or sits alongside a non-default control that needs to read as a single unit.

![Color](https://cladd.io/screenshots/components/switch/color.png)

```tsx
<Switch checked color={color} size="sm" />
<Switch checked color={color} />
```

### Custom thumb icon

Unlike [`Checkbox`](/react/components/checkbox/) and [`Radio`](/react/components/radio/), `Switch` exposes an `icon` slot inside the thumb. Pass a static `ReactNode` for a fixed glyph, or a function `(checked) => ReactNode` to swap the icon based on state — the canonical example is a sun/moon pair for a theme toggle. The thumb keeps its slide and fill animations; only the inner content changes.

![Custom icon](https://cladd.io/screenshots/components/switch/custom-icon.png)

```tsx
<Switch
  size="md"
  checked={dark}
  onChange={setDark}
  color="purple"
  icon={(checked) => (checked ? <MoonIcon /> : <SunIcon />)}
/>
<Switch
  size="md"
  checked={check}
  onChange={setCheck}
  color="brand"
  icon={
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
    >
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
  }
/>
```

### In a settings list

The canonical immediate-effect pattern: a [`List`](/react/components/list/) of `ListButton as="label"` rows, each with a `Switch` in the `after` slot. The `ListButton` provides the hover overlay, focus ring, and click target — the switch is just the indicator and value. `as="label"` on the row turns the whole row into a label for the nested switch's hidden input, so clicking anywhere in the row toggles it. Use `as="span"` on the switch itself to avoid a nested `<label>`.

![In list](https://cladd.io/screenshots/components/switch/in-list.png)

```tsx
<Surface outline className="w-80 rounded-3xl">
  <List>
    <ListTitle>Editor</ListTitle>
    {SETTINGS.map((s) => (
      <ListButton
        key={s.id}
        as="label"
        after={
          <Switch
            as="span"
            checked={values[s.id]}
            onChange={() => toggle(s.id)}
          />
        }
      >
        {s.label}
      </ListButton>
    ))}
    <ListSeparator />
    <ListButton
      onClick={() =>
        setValues({
          autosave: true,
          realtime: true,
          compact: false,
          spellcheck: true,
        })
      }
    >
      Reset to defaults
    </ListButton>
  </List>
</Surface>
```

### Settings panel

When a stack of switches _is_ the UI — a workspace preferences panel, a notifications screen, a privacy sheet — pair them with [`SectionTitle`](/react/components/section-title/) groups inside a single [`Surface`](/react/components/surface/). Each row gets a label, an optional supporting paragraph, and a switch on the right; the surface frames the group and the section titles carve it into legible chunks. This is the layout cladd was designed for: dense, but not crowded.

![Settings panel](https://cladd.io/screenshots/components/switch/settings-panel.png)

```tsx
<Surface
  outline
  className="w-96 rounded-3xl"
  contentClassName="flex flex-col gap-8 p-4"
>
  <div className="flex flex-col gap-2">
    <SectionTitle>Appearance</SectionTitle>
    {APPEARANCE.map((row) => (
      <label
        key={row.id}
        className="flex cursor-pointer items-start gap-4 px-2"
      >
        <div className="flex-1">
          <div className="text-cladd-fg">{row.label}</div>
          <div className="text-cladd-fg-soft">{row.description}</div>
        </div>
        <Switch
          as="span"
          checked={values[row.id]}
          onChange={() => toggle(row.id)}
          color="brand"
          className="mt-1"
        />
      </label>
    ))}
  </div>
  <div className="flex flex-col gap-2">
    <SectionTitle>Notifications</SectionTitle>
    {NOTIFICATIONS.map((row) => (
      <label
        key={row.id}
        className="flex cursor-pointer items-start gap-4 px-2"
      >
        <div className="flex-1">
          <div className="text-cladd-fg">{row.label}</div>
          <div className="text-cladd-fg-soft">{row.description}</div>
        </div>
        <Switch
          as="span"
          checked={values[row.id]}
          onChange={() => toggle(row.id)}
          color="brand"
          className="mt-1"
        />
      </label>
    ))}
  </div>
</Surface>
```

### States

`disabled` dims the switch and blocks all interaction — read as "not available right now" (e.g. a feature that depends on a higher plan tier). `readOnly` blocks toggling without the dim treatment — read as "locked, but the value is real" (e.g. an enforced organisation policy the user can see but not change).

![States](https://cladd.io/screenshots/components/switch/states.png)

```tsx
<label className="flex items-center gap-2">
  <Switch as="span" checked disabled />
  <span className="text-cladd-fg-soft">Disabled, on</span>
</label>
<label className="flex items-center gap-2">
  <Switch as="span" disabled />
  <span className="text-cladd-fg-soft">Disabled, off</span>
</label>
<label className="flex items-center gap-2">
  <Switch as="span" checked readOnly color="red" />
  <span className="text-cladd-fg-soft">Read-only (locked on)</span>
</label>
<label className="flex items-center gap-2">
  <Switch as="span" readOnly />
  <span className="text-cladd-fg-soft">Read-only (locked off)</span>
</label>
```

### Playground

`size`, `color`, and the boolean state toggles compose freely. The `sm` / `md` pair covers most cases; reach for `md` when the switch is the focal point of a row or sits inside a `md` button or list row.

![Playground](https://cladd.io/screenshots/components/switch/playground.png)

```tsx
<Switch
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
| `as?` | `ElementType` | `'label'` | Polymorphic root element. Defaults to `'label'` so a wrapping `<label>` activates the hidden input on click.<br>Use a non-label container when nesting inside an existing label — see `hoverable`/`focusable` for how this changes interactivity. |
| `checked?` | `boolean` | `false` | Controlled checked state. Default `false`. |
| `className?` | `string` | — | Extra classes for the outer label/element. |
| `color?` | `Color` | — | Accent color for the checked state thumb fill. Default: theme accent. |
| `disabled?` | `boolean` | — | Visually dim the switch and disable interaction. |
| `focusable?` | `boolean` | — | Auto-computed when omitted: `true` if `as === 'label'` OR `input` is `true`.<br>Drives whether the focus ring (`FocusableLayer`) is rendered on the thumb. |
| `hoverable?` | `boolean` | — | Auto-computed when omitted: `true` if `as === 'label'`, otherwise `false`.<br>Override explicitly for custom containers that should still show hover affordances. |
| `icon?` | `ReactNode \| ((checked: boolean) => ReactNode)` | — | Icon rendered inside the thumb. Pass either a static `ReactNode`, or a function `(checked) => ReactNode` to render different content based on the switch state.<br>If omitted, the built-in animated cross/check glyph is used. |
| `input?` | `boolean` | — | When `true` (default), renders a hidden native `<input type="checkbox" role="switch">` for form submission and accessibility.<br>When `false`, falls back to ARIA roles (`role="switch"`, `aria-checked`, keyboard `Space`/`Enter` toggling). |
| `onChange?` | `(checked: boolean, event?: React.ChangeEvent<HTMLInputElement>) => void` | — | Fires when the user toggles. First arg is the new checked state, second is the raw event. |
| `outline?` | `boolean` | `true` | Outline ring on the **track** (background surface). Default `true`. |
| `readOnly?` | `boolean` | — | Block toggling without the disabled visual treatment. |
| `size?` | `SwitchSize` | `'md'` | Switch size token. Drives track width and thumb size. Default `'md'`. |
| `surfaceLevel?` | `string \| number` | `'+1'` | Surface level for the **track**. Default `'+1'` - one level deeper than the parent surface.<br>Accepts the same absolute / relative (`"+1"`/`"-1"`) syntax as `Surface.level`. |
| `thumbOutline?` | `boolean` | `true` | Outline ring on the **thumb**. Default `true`. |
| `thumbSurfaceLevel?` | `string \| number` | `'+2'` | Surface level for the **thumb**. Default `'+2'` - two levels deeper than the parent surface, so the thumb reads as a raised piece on top of the track. |
| `thumbVariant?` | `SurfaceVariant` | `'gradient'` | Surface variant for the **thumb**. Default `'gradient'`. |
| `variant?` | `SurfaceVariant` | `'solid'` | Surface variant for the **track**. Default `'solid'`. |
