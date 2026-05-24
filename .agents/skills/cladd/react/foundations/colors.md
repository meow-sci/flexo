---
title: "Colors"
description: "Accent palette, text shades, background and outline tokens, and how to retune them with OKLCH variables."
links:
  doc: https://cladd.io/react/foundations/colors/
---

# Colors

The cladd palette is a small set of CSS custom properties, all derived in **OKLCH** color space from a single per-accent seed (`--cladd-theme`). The same tokens drive every cladd component, and they're exposed as Tailwind utilities — `bg-cladd-surface`, `text-cladd-fg`, `border-cladd-outline`, and so on. There is no separate "palette" file to hand-edit per component: change the underlying variables once and the whole kit retunes coherently.

This page covers the **accent palette**, **text colors**, and **background and outline tokens**. Surface-specific tokens (`bg-cladd-surface`, `bg-cladd-surface-cut`, the `-prev`/`-minus`/`-plus`/`-next` helpers, the level mechanics) live on the [Surfaces](/react/foundations/surfaces/) page.

## Accent colors

Cladd ships **eleven accent tokens**: `neutral`, `brand`, `red`, `pink`, `purple`, `blue`, `cyan`, `lime`, `green`, `yellow`, `orange`. `neutral` is the default — no chromatic tint, just the grayscale ramp. The other ten map a single hex value into the OKLCH derivations for primary, surface, foreground, and outline.

![Accent palette](https://cladd.io/screenshots/foundations/colors/accent-palette.png)

```tsx
{ACCENT_COLORS.map((color) => (
  <Chip key={color} color={color} size="md">
    {color}
  </Chip>
))}
```

### Applying an accent

There are two ways to set an accent. The most common is per-component, via the `color` prop:

```tsx
<Button color="lime">Save</Button>
<Chip color="red">Failed</Chip>
<Spinner color="blue" />
```

The prop accepts any of the eleven token names. The component adds a `cladd-color-{name}` class to its own root, which switches every accent-aware token underneath it.

The second way is to apply the class directly to a region. Anything inside that has accent-aware styling — cladd components without their own `color` prop, raw elements using `text-cladd-primary`, child surfaces — picks it up.

```tsx
<div className="cladd-color-purple">
  <Button>Save</Button>
  <Chip>Live</Chip>
</div>
```

![Accent on region](https://cladd.io/screenshots/foundations/colors/accent-on-region.png)

```tsx
<div className="cladd-color-purple flex items-center gap-2">
  <Button>Save</Button>
  <Chip>Live</Chip>
</div>
<div className="cladd-color-orange flex items-center gap-2">
  <Button>Save</Button>
  <Chip>Live</Chip>
</div>
```

This is the right approach for sections that should all share an accent: a "danger zone" panel in red, a brand-tinted header bar, an info-box in blue. You don't have to set `color` on every component inside.

### How an accent is defined

Each accent is one CSS rule that sets `--cladd-theme` to a hex seed:

```css
.cladd-color-red {
  --cladd-theme: #ff0b0b;
}
.cladd-color-lime {
  --cladd-theme: #7dff0b;
}
.cladd-color-blue {
  --cladd-theme: #0047ff;
}
/* …and so on for each accent */
```

Everything chromatic flows from `--cladd-theme`. The derived tokens — primary, surface, foreground ramp, outline — are all `oklch(from var(--cladd-theme) L C h)` expressions. They pull the **hue** from the seed and assign a **lightness** and **chroma** appropriate for the role. That's why each accent's surface, text, and outline shades feel coherent — they're literally the same hue at different L/C points.

`neutral` is special: its rule sets `--cladd-theme: #fff;` and the cladd CSS has a separate, zero-chroma branch that matches `:root, .cladd-color-neutral`. So passing `color="neutral"` (or omitting `color` entirely) gives you the grayscale palette.

### Adding a custom accent

To add your own accent, define one CSS rule next to your Tailwind setup:

```css
.cladd-color-magenta {
  --cladd-theme: #ff00cc;
}
```

That's all. The cladd OKLCH derivations apply automatically to anything inside an element with that class, because they're scoped to `[class*="cladd-color-"]:not(.cladd-color-neutral)`. You can now use `color="magenta"` on any cladd component, or `className="cladd-color-magenta"` on a region:

```tsx
<Button color="magenta">Save</Button>
<Chip color="magenta">Custom</Chip>
```

![Custom accent](https://cladd.io/screenshots/foundations/colors/custom-accent.png)

```tsx
<div
  className="cladd-color-magenta flex items-center gap-2"
  style={{ '--cladd-theme': '#ff00cc' } as CSSProperties}
>
  <Button>Save</Button>
  <Chip>Magenta</Chip>
  <Button variant="solid-fill">Filled</Button>
</div>
```

The TypeScript `Color` type permits arbitrary strings (`'neutral' | 'red' | … | (string & {})`), so `color="magenta"` typechecks without casts.

### Tuning lightness and chroma

The OKLCH derivations for `--cladd-primary` (the headline accent color used for accent text, button fills, ring colors) read four global variables you can override:

```css
:root {
  --cladd-dark-primary-lightness: 0.95;
  --cladd-dark-primary-chroma: 0.18;
  --cladd-light-primary-lightness: 0.5;
  --cladd-light-primary-chroma: 0.18;
}
```

Lower the lightness for a deeper, more saturated accent. Raise the chroma for a more vivid one. The dark-mode and light-mode pairs are independent — so you can tune both axes per theme without affecting the other.

![Tuning](https://cladd.io/screenshots/foundations/colors/tuning.png)

```tsx
<div className="cladd-color-blue flex items-center gap-3">
  <span className="w-32 text-xs text-cladd-fg-soft">Default</span>
  <Button>Primary</Button>
  <Chip>Tag</Chip>
  <span className="text-sm font-semibold text-cladd-primary">
    Primary text
  </span>
</div>
<div
  className="cladd-color-blue flex items-center gap-3"
  style={
    {
      '--cladd-dark-primary-lightness': '0.75',
      '--cladd-dark-primary-chroma': '0.22',
      '--cladd-light-primary-lightness': '0.4',
      '--cladd-light-primary-chroma': '0.22',
    } as CSSProperties
  }
>
  <span className="w-32 text-xs text-cladd-fg-soft">Tuned</span>
  <Button>Primary</Button>
  <Chip>Tag</Chip>
  <span className="text-sm font-semibold text-cladd-primary">
    Primary text
  </span>
</div>
```

You can scope the override to a region by setting the same variables on a wrapper, the same way you'd scope an accent.

## Text colors

Cladd exposes a four-step grayscale ramp for foreground text, plus one accent-aware token. All five inherit from the surrounding `cladd-color-*` context, so the same class name reads correctly on neutral surfaces and on tinted ones.

![Text colors](https://cladd.io/screenshots/foundations/colors/text-colors.png)

```tsx
<p className="text-cladd-fg">
  <span className="font-mono text-xs text-cladd-fg-softer">
    text-cladd-fg
  </span>{' '}
  — body text. Default for prose, labels, and most UI copy.
</p>
<p className="text-cladd-fg-soft">
  <span className="font-mono text-xs text-cladd-fg-softer">
    text-cladd-fg-soft
  </span>{' '}
  — secondary copy. Captions, helper lines, value tags.
</p>
<p className="text-cladd-fg-softer">
  <span className="font-mono text-xs text-cladd-fg-softer">
    text-cladd-fg-softer
  </span>{' '}
  — tertiary copy. Inactive labels, breadcrumbs, hints.
</p>
<p className="text-cladd-fg-softest">
  <span className="font-mono text-xs text-cladd-fg-softer">
    text-cladd-fg-softest
  </span>{' '}
  — quietest. Placeholders and decorative metadata.
</p>
<p className="text-cladd-primary">
  <span className="font-mono text-xs text-cladd-fg-softer">
    text-cladd-primary
  </span>{' '}
  — accent-tinted text. Picks up the surrounding{' '}
  <code>cladd-color-&#123;name&#125;</code>.
</p>
```

| Class                   | Use for                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `text-cladd-fg`         | Body text. Default for prose, labels, and most UI copy.            |
| `text-cladd-fg-soft`    | Secondary copy. Captions, helper lines, value tags.                |
| `text-cladd-fg-softer`  | Tertiary copy. Inactive labels, breadcrumbs, hints.                |
| `text-cladd-fg-softest` | The quietest tier. Placeholders, decorative metadata.              |
| `text-cladd-primary`    | Accent-tinted text. Picks up the surrounding `cladd-color-{name}`. |

The ramp shifts subtly across accents — on a tinted region the soft tiers pick up a hint of hue so they read against the matching surface. Same class names, automatically retuned.

![Fg ramp across accents](https://cladd.io/screenshots/foundations/colors/fg-ramp-across-accents.png)

```tsx
<SectionTitle>Across accent regions</SectionTitle>
<div className="grid grid-cols-3 gap-2">
  {(['neutral', 'blue', 'orange'] as Color[]).map((color) => (
    <div
      key={color}
      className={`cladd-color-${color} flex flex-col gap-1 rounded-cladd-md bg-cladd-surface px-2 py-2`}
    >
      <span className="text-xs font-semibold text-cladd-fg">{color}</span>
      <span className="text-xs text-cladd-fg-soft">soft</span>
      <span className="text-xs text-cladd-fg-softer">softer</span>
      <span className="text-xs text-cladd-fg-softest">softest</span>
      <span className="text-xs font-semibold text-cladd-primary">
        primary
      </span>
    </div>
  ))}
</div>
```

### text-cladd-on-primary

When text sits directly on an **accent-filled** background (a `solid-fill` or `gradient-fill` [Surface](/react/components/surface/) or [Button](/react/components/button/), or a custom element painted with `bg-cladd-primary`), the regular `fg` ramp would clash. Use `text-cladd-on-primary` instead — it's the contrast color computed for the current accent, and it switches automatically between dark and light modes.

[`Surface`](/react/components/surface/) and [`Button`](/react/components/button/) flip to `text-cladd-on-primary` themselves when their `variant` is `solid-fill` or `gradient-fill`. You only reach for the class directly when building a **custom** accent-filled element.

![On primary](https://cladd.io/screenshots/foundations/colors/on-primary.png)

```tsx
<Button color="lime" variant="gradient-fill">
  Built-in
</Button>
<Surface
  variant="solid-fill"
  color="lime"
  outline
  className="rounded-cladd-md"
  contentClassName="px-3 py-1.5"
>
  <span className="text-sm font-semibold">Auto-inverted</span>
</Surface>
<div className="cladd-color-lime flex items-center rounded-cladd-md bg-cladd-primary px-3 py-1.5">
  <span className="text-sm font-semibold text-cladd-on-primary">
    Manual element
  </span>
</div>
```

## Background and outline

The non-surface chrome tokens — the app background, the backdrop behind overlays, and the two border tones — are exposed as their own utilities.

![Bg and outline](https://cladd.io/screenshots/foundations/colors/bg-and-outline.png)

```tsx
<div className="flex items-center gap-2 rounded-cladd-md border border-cladd-bg-outline bg-cladd-bg px-3 py-2">
  <span className="font-mono text-xs text-cladd-fg-softer">
    bg-cladd-bg + border-cladd-bg-outline
  </span>
</div>
<Surface
  outline
  variant="solid"
  className="rounded-cladd-md"
  contentClassName="px-3 py-2 flex flex-col gap-2"
>
  <span className="font-mono text-xs text-cladd-fg-softer">
    Inside a Surface
  </span>
  <div className="rounded-cladd-sm border border-cladd-outline px-2 py-1 text-xs">
    <span className="font-mono text-cladd-fg-softer">
      border-cladd-outline
    </span>{' '}
    — divides regions on a surface
  </div>
</Surface>
```

| Class                     | Use for                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `bg-cladd-bg`             | The root app background. The "page" color underneath all surfaces.           |
| `bg-cladd-backdrop`       | The dimmed layer behind dialogs and popovers (`<Backdrop>` uses this).       |
| `border-cladd-bg-outline` | 1px borders **on the page background** — slightly darker than `bg-cladd-bg`. |
| `border-cladd-outline`    | 1px borders **inside a surface** — adapts to the surface's level.            |

The two outline tokens look similar in isolation but behave differently in context: `border-cladd-bg-outline` is tuned against `bg-cladd-bg`; `border-cladd-outline` is recomputed for each surface level so an inner divider stays legible whether the surface is level 1 or level 5.

## Surface tokens

Surface colors — `bg-cladd-surface`, `bg-cladd-surface-cut`, and the `-prev`/`-minus`/`-plus`/`-next` helpers — are recomputed per [surface level](/react/foundations/surfaces/). They're covered in detail on the [Surfaces](/react/foundations/surfaces/) page along with the level mechanics and the `--cladd-surface-mix-amount` knob that controls tone delta.

## Pitfalls

- **Don't invent suffixes.** The text ramp stops at `softest`; the surface ramp at `next`. There's no `fg-2`, `surface-2`, `fg-strong`, or similar. If you need more steps, see the Surfaces page for how to extend the surface ramp — but for foreground text, four steps is the whole vocabulary.
- **Don't hand-roll `text-white` on accent-filled elements.** Use `text-cladd-on-primary`. It already handles dark vs light mode, and it pairs with whatever accent the surrounding region uses.
- **Don't override `--cladd-primary` directly to recolor an accent.** Set `--cladd-theme` instead — the whole palette derives from theme, so changing one variable retunes primary, surface, foreground, and outline coherently. Overriding `--cladd-primary` alone leaves the rest of the accent's tokens out of sync.
- **Don't pass a Tailwind class to `color`.** The `color` prop expects an accent **token name** (`color="red"`), not a class (`color="bg-red-500"` is not valid). To recolor with a class, apply `cladd-color-{name}` to a wrapper instead.
- **Don't mix the two outline tokens.** Use `border-cladd-bg-outline` only on elements that sit on `bg-cladd-bg`; use `border-cladd-outline` inside a `Surface`. Swapping them looks fine at level 1 and progressively wrong at deeper levels.
