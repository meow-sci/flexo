---
title: "Introduction"
description: "Cladd is an opinionated React UI kit for building real apps, editors, and dashboards — not a headless primitives library."
links:
  doc: https://cladd.io/react/
---

# Introduction

**Cladd** is an opinionated React UI kit for building applications — editors, dashboards, settings panels, internal tools. It is not a collection of headless primitives and not a marketing-page kit. It ships with a defined visual identity: recessed and raised surfaces, subtle gradients, dark-first theming, a blue accent baked in by default, and a coherent set of controls that look like they belong in the same product.

If you've used Radix or Base UI, those give you behavior and leave the design to you. If you've used Mantine or Material UI, cladd sits closer to that end of the spectrum — but more authored, denser, and tuned for information-rich screens rather than generic web apps.

## Dense but not crowded

The core design principle. Cladd targets UIs where you need a lot on screen and it has to stay legible: inspector panels, kanban boards, design-tool sidebars, settings rows. The size scale is small, the spacing is tight, and every interactive control is built to sit cleanly next to its neighbors at the same row height. You pack the screen — and it stays breathable.

That single decision flows through everything else: the [sizing scale](/react/foundations/sizing/) (default `md` is 28 px, smaller than most kits ship), the [surface system](/react/foundations/surfaces/) (nested panels read correctly without manual color picking), the [accent palette](/react/foundations/colors/) (one prop tints an entire region).

## What's in the box

- **A surface system.** [`Surface`](/react/components/surface/), [`SurfaceCut`](/react/components/surface-cut/), and five depth levels that nest contextually — extensible past five when you need it. Surfaces inherit and offset from their parent, so nested panels read correctly without manual color picking. Covered in [Foundations → Surfaces](/react/foundations/surfaces/).
- **A sizing scale.** Seven steps from `2xs` to `2xl`. [`Button`](/react/components/button/), [`Chip`](/react/components/chip/), [`Shortcut`](/react/components/shortcut/), and [`Spinner`](/react/components/spinner/) implement the full ramp. [`Input`](/react/components/input/), [`NumberField`](/react/components/number-field/), [`Textarea`](/react/components/textarea/), and [`OTPField`](/react/components/otp-field/) start at `sm`. [`Checkbox`](/react/components/checkbox/), [`Radio`](/react/components/radio/), [`Switch`](/react/components/switch/), and [`Slider`](/react/components/slider/) ship `sm` and `md` only. The rule is one row, one size token — everything lines up. Covered in [Foundations → Sizing](/react/foundations/sizing/).
- **Eleven accent colors.** `neutral`, `brand`, `red`, `pink`, `purple`, `blue`, `cyan`, `lime`, `green`, `yellow`, `orange` — each with the right text, fill, and outline shades for every surface variant. Set per component via `color`, or per region via `cladd-color-{name}`. Covered in [Foundations → Colors](/react/foundations/colors/).
- **Application-grade components.** [`Toolbar`](/react/components/toolbar/), [`Segmented`](/react/components/segmented/), [`Popover`](/react/components/popover/), [`Dialog`](/react/components/dialog/), [`Toast`](/react/components/toast/), [`Tooltip`](/react/components/tooltip/), [`Shortcut`](/react/components/shortcut/), [`Select`](/react/components/select/), [`OTPField`](/react/components/otp-field/), [`Slider`](/react/components/slider/), [`NumberField`](/react/components/number-field/) — the parts you need for the boring shell of a real app, not just buttons and dialogs.
- **Hooks for the imperative bits.** [`useDialog`](/react/hooks/use-dialog/), [`useToast`](/react/hooks/use-toast/), [`useTheme`](/react/hooks/use-theme/), [`useAccentColor`](/react/hooks/use-accent-color/), [`useSurface`](/react/hooks/use-surface/), [`useDevice`](/react/hooks/use-device/).
- **First-class TypeScript.** Every component re-exports its props (`ButtonProps`, `InputProps`, …) and size union (`ButtonSize`, `InputSize`, …); shared types like `Color` and `SurfaceVariant` are exported from the package root. See [TypeScript](/react/typescript/).

## Already shipping

Cladd powers production apps:

- [Swiper Studio](https://studio.swiperjs.com/) — visual editor for Swiper sliders
- [t0ggles](https://t0ggles.com/) — project management
- [PaneFlow](https://paneflow.com/) — create stunning slideshows in minutes
- [Start Page HQ](https://startpagehq.com/) — custom New Tab dashboard with 50+ widgets

## For your AI agent

Cladd ships an official [**MCP server**](/mcp/) at `cladd.io/mcp`. Connect it to Claude Code, Cursor, Claude Desktop, or any MCP-capable client and your agent gets the full docs at its fingertips — every component, foundation, and hook, with code examples, props, and inline screenshot URLs so it can see what a component looks like before writing layout code.

## Where to next

- **[Installation](/react/installation/)** — install `@cladd-ui/react`, wire up the stylesheet, wrap your app in [`CladdProvider`](/react/components/cladd-provider/). Framework-specific guides for Next.js, Vite, TanStack Start, React Router, Astro, and plain React.
- **[Surfaces](/react/foundations/surfaces/)**, **[Colors](/react/foundations/colors/)**, **[Sizing](/react/foundations/sizing/)** — the three foundations every component is built on. Read these once and the rest of the kit will make sense without per-component lookups.
- **[TypeScript](/react/typescript/)** — prop types, size unions, shared types, and the polymorphic `as` story.

If you're building an app and don't want to spend the first two weeks deciding what a button looks like — start with [Installation](/react/installation/).
