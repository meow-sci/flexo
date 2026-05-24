---
title: "Sizing"
description: "The 2xs → 2xl size scale, exact heights per component, the root vs nested ramps, and density guidance for picking the right size."
links:
  doc: https://cladd.io/react/foundations/sizing/
---

# Sizing

Cladd is a **dense** UI kit. The size scale is tuned for information-rich screens where you need a lot of controls on one surface and they all have to line up. The scale itself is small — seven steps from `2xs` to `2xl` — but the rules for **which size to use** and **how sizes nest** are the part that's worth memorising.

This page covers the **scale**, the **per-component height reference**, the **root vs nested ramps**, the **density guidance** (default `md`, when to go smaller, when to go larger), and the **nesting rule** that makes a `<Chip>` inside a `<Button>` automatically read at the right proportion. For per-component prop reference, see each component's own page.

## The scale

Every interactive control with a `size` prop draws from the same seven-step ramp:

```
2xs   xs   sm   md   lg   xl   2xl
```

The full scale is implemented by [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), and [`Spinner`](/react/components/spinner/). Components that don't make sense below a certain density — `Input`, `NumberField`, `Textarea`, `OTPField` — start at `sm` and skip the two smallest steps. The form primitives ([`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Slider`](/react/components/slider/), [`Switch`](/react/components/switch/)) ride a separate, smaller ramp — `xs`, `sm`, and `md` for Checkbox/Radio/Slider, and `sm` / `md` for Switch — by design, they don't need more.

![Size scale strip](https://cladd.io/screenshots/foundations/sizing/size-scale-strip.png)

```tsx
{ALL_SIZES.map((size) => (
  <div key={size} className="flex flex-col items-center gap-2">
    <Button size={size} className="w-12">
      {size}
    </Button>
    <span className="font-mono text-xs text-cladd-fg-soft">{size}</span>
  </div>
))}
```

## Heights

The two CSS spacing ramps that drive most cladd heights are `--spacing-cladd-{size}` (root) and `--spacing-cladd-nested-{size}` (nested = root minus 8 px). Every sized component on the seven-step scale picks one of these two ramps.

| Size  | Root height                                                                                                                                                                                                                       | Nested height                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `2xs` | **16 px**<br/>[`Button`](/react/components/button/)                                                                                                                                                                               | **8 px**<br/>[`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), [`Spinner`](/react/components/spinner/)  |
| `xs`  | **20 px**<br/>[`Button`](/react/components/button/)                                                                                                                                                                               | **12 px**<br/>[`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), [`Spinner`](/react/components/spinner/) |
| `sm`  | **24 px**<br/>[`Button`](/react/components/button/), [`Input`](/react/components/input/), [`NumberField`](/react/components/number-field/), [`Textarea`](/react/components/textarea/), [`OTPField`](/react/components/otp-field/) | **16 px**<br/>[`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), [`Spinner`](/react/components/spinner/) |
| `md`  | **28 px**<br/>same set as `sm`                                                                                                                                                                                                    | **20 px**<br/>[`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), [`Spinner`](/react/components/spinner/) |
| `lg`  | **32 px**<br/>same set as `sm`                                                                                                                                                                                                    | **24 px**<br/>[`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), [`Spinner`](/react/components/spinner/) |
| `xl`  | **40 px**<br/>same set as `sm`                                                                                                                                                                                                    | **32 px**<br/>[`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), [`Spinner`](/react/components/spinner/) |
| `2xl` | **48 px**<br/>same set as `sm`                                                                                                                                                                                                    | **40 px**<br/>[`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), [`Spinner`](/react/components/spinner/) |

The "Root height" column is the height of [`Button`](/react/components/button/), [`Input`](/react/components/input/), and friends at that size — the full-size controls. The "Nested height" column is the height of [`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), and [`Spinner`](/react/components/spinner/) at the **same** `size` token — exactly 8 px shorter, so they fit cleanly inside a root-ramp row.

[`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Switch`](/react/components/switch/), and [`Slider`](/react/components/slider/) don't appear in this table — they use a separate, smaller ramp covered in [Form primitives](#form-primitives) below.

### Root vs nested

The same `size` token produces two different heights depending on which ramp the component reads from. Root-ramp controls fill a row; nested-ramp controls are designed to **sit inside** a root-ramp control without overflowing or feeling cramped.

![Root vs nested](https://cladd.io/screenshots/foundations/sizing/root-vs-nested.png)

```tsx
{(['sm', 'md', 'lg', 'xl'] as ButtonSize[]).map((size) => (
  <div key={size} className="flex items-center gap-4">
    <span className="w-12 font-mono text-xs text-cladd-fg-soft">
      {size}
    </span>
    <Button size={size}>Button</Button>
    <Chip size={size}>Chip</Chip>
    <Shortcut size={size}>cmd K</Shortcut>
    <Spinner size={size} />
  </div>
))}
```

When you place a [`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), or [`Spinner`](/react/components/spinner/) inside a [`Button`](/react/components/button/) (or any other root-ramp control), passing the **same** `size` to both is the right call — the nested component will automatically render 8 px shorter, with matching padding and font-size, and sit perfectly in the row.

![Nested inside button](https://cladd.io/screenshots/foundations/sizing/nested-inside-button.png)

```tsx
<div className="flex items-center gap-3">
  <span className="w-12 font-mono text-xs text-cladd-fg-soft">md</span>
  <Button size="md">
    Save
    <Chip size="md" color="green">
      12
    </Chip>
    <Shortcut size="md">cmd S</Shortcut>
  </Button>
</div>
<div className="flex items-center gap-3">
  <span className="w-12 font-mono text-xs text-cladd-fg-soft">lg</span>
  <Button size="lg">
    Save
    <Chip size="lg" color="green">
      12
    </Chip>
    <Shortcut size="lg">cmd S</Shortcut>
  </Button>
</div>
<div className="flex items-center gap-3">
  <span className="w-12 font-mono text-xs text-cladd-fg-soft">xl</span>
  <Button size="xl">
    Save
    <Chip size="xl" color="green">
      12
    </Chip>
    <Shortcut size="xl">cmd S</Shortcut>
  </Button>
</div>
```

You don't need to pick a "Chip is one step smaller than Button" mapping yourself. The scale is the contract: `size="md"` means "the md row" — whichever ramp the component reads.

## A dense row

When everything in a row shares the same `size` token, controls line up automatically — root-ramp items at the row height, nested-ramp items at the inner height. This is how cladd toolbars, filter bars, and editor headers work without per-item adjustments.

![Dense row](https://cladd.io/screenshots/foundations/sizing/dense-row.png)

```tsx
<div className="flex flex-wrap items-center gap-2">
  <Button size="md">Save</Button>
  <Input size="md" placeholder="Title" className="w-40" />
  <Chip size="md" color="blue">
    Draft
  </Chip>
  <Shortcut size="md">cmd S</Shortcut>
  <Spinner size="md" />
</div>
```

The pattern: pick a row size (almost always `md`), pass it to every sized component, done.

## Density guidance

Cladd is already dense by default — a 28 px Button is smaller than what most kits ship as their default. So the rule of thumb is:

- **Default to `md`** for most application UI. Toolbars, header rows, list rows, inspector panels.
- **Use `lg`** for prominent primary actions and the main `Input` row of a form. [`Input`](/react/components/input/) and [`NumberField`](/react/components/number-field/) default to `lg` for exactly this reason — the floating label needs the 32 px row to breathe.
- **Reach for `xl` / `2xl`** for marketing-style hero CTAs and full-bleed mobile inputs. Rare in app UI.
- **`sm`** is occasionally right for very dense inspector grids and compact tag rows — only when `md` would genuinely crowd the layout.
- **`2xs` / `xs` are not general-purpose sizes.** They exist for elements rendered **inside** an [`Input`](/react/components/input/) or similar dense container — a tiny inline indicator, a clear button, a `Chip` decorating a value. **Don't reach for them for standalone controls.** A standalone `2xs` button is 16 px tall: tap targets fail accessibility, glyphs and text get fragile, and the visual reads as broken rather than intentional.

![Input default](https://cladd.io/screenshots/foundations/sizing/input-default.png)

```tsx
{(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
  <div key={size} className="flex items-center gap-4">
    <span className="w-12 font-mono text-xs text-cladd-fg-soft">
      {size}
    </span>
    <Input size={size} placeholder={`Input size="${size}"`} />
  </div>
))}
```

Picking a size from this rubric — `md` for chrome, `lg` for primary inputs and hero buttons — covers ~90% of cases. When in doubt, `md`.

## Form primitives

[`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Slider`](/react/components/slider/), and [`Switch`](/react/components/switch/) don't use the root or nested ramps — they ride their own `--spacing-cladd-thumb-*` scale. Checkbox, Radio, and Slider ship the three smallest steps; Switch ships only the middle two:

| Size | Height | Components                                                                                                                                                   |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `xs` | 16 px  | [`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Slider`](/react/components/slider/)                                        |
| `sm` | 20 px  | [`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Switch`](/react/components/switch/), [`Slider`](/react/components/slider/) |
| `md` | 24 px  | (same as `sm`)                                                                                                                                               |

This is intentionally a third ramp — these primitives are designed to **sit inside** a root-ramp row at the same token: a `size="md"` Switch (24 px) inside a `size="md"` Button or Input row (28 px) has 2 px of breathing room top and bottom. The numbers don't match the root or nested heights at the same token, and that's the point — Switch and friends should read as **inline** form widgets, not full-width controls.

`xs` (16 px) is the dense end of the ramp — reach for it when the indicator rides inside a smaller container (a `sm` [`ListButton`](/react/components/list/), an inspector row that's already tight on the vertical) where even a `sm` thumb would feel oversized. Switch sits out the `xs` step because a 16 px wide toggle has nowhere for the thumb to travel.

![Two size primitives](https://cladd.io/screenshots/foundations/sizing/two-size-primitives.png)

```tsx
{(['xs', 'sm', 'md'] as const).map((size) => (
  <div key={size} className="flex items-center gap-4">
    <span className="w-6 font-mono text-xs text-cladd-fg-softer">
      {size}
    </span>
    <Checkbox size={size} defaultChecked />
    <Radio size={size} defaultChecked name={`docs-radio-${size}`} />
    {size === 'xs' ? (
      <span
        className="w-10 text-center font-mono text-cladd-xs text-cladd-fg-softest"
        aria-hidden
      >
        —
      </span>
    ) : (
      <Switch size={size} defaultChecked />
    )}
    <Slider size={size} defaultValue={40} className="w-32" />
  </div>
))}
```

If you need a fourth size on these primitives, you're probably reaching for the wrong one — a Switch the size of a Button isn't a Switch any more, it's a segmented control.

## Pitfalls

- **Don't pick `2xs` or `xs` for standalone controls.** They're for nesting inside an Input or similar. A 16 px Button is fragile in isolation; a 20 px Chip standing alone reads as a glitch. Default to `md` and only go smaller when you've measured the row and it genuinely doesn't fit.
- **Don't mix sizes in a row to "fit" content.** If a Chip looks too tall next to its label, the label needs adjustment, not the Chip. Mixing sizes in a row breaks the alignment grid the scale exists to enforce.
- **Don't pass `size="md"` to a Chip and `size="sm"` to a Button expecting them to nest correctly.** The auto-shrink only works when you pass the **same** token to both — the Chip already renders 8 px shorter at the same token. Mismatching tokens means doing the math yourself, which defeats the scale.
- **Don't override the heights with `h-*` or `size-*` utilities.** Components honor their `size` prop through the underlying `h-cladd-*` / `size-cladd-*` utilities — adding a Tailwind `h-7` on top fights the scale and breaks the nesting math. If you need a non-standard size, that's a sign the component shouldn't be in this row.
- **Don't put `size-*` on `<svg>` children inside [`Button`](/react/components/button/) or [`Chip`](/react/components/chip/).** Both components apply a size-matched glyph dimension to direct `<svg>` children — Button at 12 px (`2xs`/`xs`) or 16 px (everything else), Chip ramping 6 → 16 px across the scale. A plain `className="size-3.5"` on the icon never lands because the parent's selector is more specific; only `size-3.5!` would win, and the kit's mapping is tuned to be the right call at every step. Pass the right `size` to the parent.
- **Don't default to `lg` everywhere.** The kit is intentionally dense; `lg` rows pile up vertical space fast in real apps. Reserve `lg` for inputs, hero buttons, and marketing-style accents — `md` is the working default.
- **Don't expect [`Input`](/react/components/input/) at `sm` to feel right next to a `Button` at `md`.** Input's floating-label design needs room — at `sm` the label crowds the value. If you want a 24 px input-like control, use a small [`SearchField`](/react/components/search-field/) or a styled [`Chip`](/react/components/chip/) instead.
