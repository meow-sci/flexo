---
name: cladd
description: cladd is an opinionated React UI kit for building real apps, editors, and dashboards and this skill has detailed documentation on how to use it.
tags: [react, ui, cladd]
---

# cladd

> cladd is an opinionated React UI kit for building real apps, editors, and dashboards — not a landing-page kit, not a headless primitives library. It ships with a defined visual identity (recessed/cut surfaces, subtle gradients, dark-first theming, a blue accent baked in by default), eleven accent colors with five variants each, a consistent `2xs` → `2xl` sizing scale across every interactive control, and application-grade components (Toolbar, Segmented, Shortcut, OTPField, NumberField, Select) for the boring app-shell parts. Distributed via npm as `@cladd-ui/react`. Requires React 19 and Tailwind CSS v4. Already shipping in Swiper Studio, t0ggles, PaneFlow, and Start Page HQ.

Each link below points at the plain-Markdown twin of the corresponding docs page — same content, no JSX, ready to ingest.

## Getting started

- [Introduction](./react/index.md): Cladd is an opinionated React UI kit for building real apps, editors, and dashboards — not a headless primitives library.
- [Installation](./react/installation.md): How to install cladd in a React project.
- [TypeScript](./react/typescript.md): Component prop types, size unions, and shared types re-exported by cladd.

## Installation

- [Next.js](./react/installation/next.md): Set up cladd in a Next.js project, app router or pages router.
- [Vite](./react/installation/vite.md): Set up cladd in a Vite + React project.
- [TanStack Start](./react/installation/tanstack-start.md): Set up cladd in a TanStack Start project.
- [React Router](./react/installation/react-router.md): Set up cladd in a React Router (framework mode) project.
- [Astro](./react/installation/astro.md): Set up cladd inside React islands in an Astro project.
- [Manual installation](./react/installation/manual.md): Add cladd to any React project, no scaffolding required.

## Foundations

- [Quickstart](./react/foundations/quickstart.md): Wrap your app in CladdProvider and compose the minimum app shell — the canonical layout cladd is designed around.
- [Surfaces](./react/foundations/surfaces.md): Surface levels, tone tokens, extending the ramp, and the content composition rules that drive every cladd panel.
- [Colors](./react/foundations/colors.md): Accent palette, text shades, background and outline tokens, and how to retune them with OKLCH variables.
- [Sizing](./react/foundations/sizing.md): The 2xs → 2xl size scale, exact heights per component, the root vs nested ramps, and density guidance for picking the right size.
- [Pitfalls](./react/foundations/pitfalls.md): Common anti-patterns that make cladd code feel generic — and the primitive, token, or prop to reach for instead.

## Components

- [Backdrop](./react/components/backdrop.md): Dimming layer that sits behind dialogs, popups, and other overlays.
- [Button](./react/components/button.md): Clickable control for primary actions, forms, toolbars, and menus.
- [Checkbox](./react/components/checkbox.md): Selectable control for binary settings and multi-choice option groups.
- [Chip](./react/components/chip.md): Compact label for tags, statuses, and inline metadata.
- [Dialog](./react/components/dialog.md): Modal window for confirms, alerts, and short focused flows.
- [Input](./react/components/input.md): Single-line text field for short user input.
- [Link](./react/components/link.md): Navigational text link that flows inline with content and prose.
- [List](./react/components/list.md): Vertically stacked rows for sidebars, navigation panels, and menus.
- [NumberField](./react/components/number-field.md): Numeric input with stepper buttons for picking a bounded value.
- [NumberScrubber](./react/components/number-scrubber.md): Drag-to-change numeric control for inspector and design-tool inputs.
- [OTPField](./react/components/otp-field.md): Field for entering one-time codes and verification PINs.
- [Popover](./react/components/popover.md): Floating panel anchored to a trigger for menus and inline editors.
- [Popup](./react/components/popup.md): Full-screen overlay for task editors, settings panels, and detail sheets.
- [Radio](./react/components/radio.md): Selectable control for picking one option from a group.
- [SearchField](./react/components/search-field.md): Search bar for filtering lists, menus, and option sheets.
- [SectionTitle](./react/components/section-title.md): Heading label for grouping content inside panels, popovers, and settings.
- [Segmented](./react/components/segmented.md): Inline control for choosing one option from a small set.
- [Select](./react/components/select.md): Dropdown for picking one or many options from a list.
- [Shortcut](./react/components/shortcut.md): Inline display of a keyboard shortcut.
- [Slider](./react/components/slider.md): Range control for picking a value between a min and max.
- [Spinner](./react/components/spinner.md): Spinning indicator for inline loading states.
- [Surface](./react/components/surface.md): Surface is the foundational container in cladd — every panel, card, button, and toolbar is built from it.
- [SurfaceCut](./react/components/surface-cut.md): SurfaceCut is the recessed counterpart to Surface — for inset slots, fields, code blocks, and any UI that should read as carved into the parent.
- [Switch](./react/components/switch.md): Binary toggle for immediate-effect on/off settings.
- [Textarea](./react/components/textarea.md): Multi-line text field that auto-grows with its content.
- [Toast](./react/components/toast.md): Auto-dismissing notification anchored to the corner of the screen.
- [Toolbar](./react/components/toolbar.md): Grouped strip of action buttons for editors, inspectors, and app shells.
- [Tooltip](./react/components/tooltip.md): Small floating label that appears on hover, focus, or touch.
- [CladdProvider](./react/components/cladd-provider.md): App-wide provider for the theme, default accent color, and overlay portals.

## Hooks

- [useTheme](./react/hooks/use-theme.md): Read whether the app is in dark or light mode.
- [useAccentColor](./react/hooks/use-accent-color.md): Read the app's current accent color.
- [useSurface](./react/hooks/use-surface.md): Read the current depth level inside a Surface stack.
- [useDevice](./react/hooks/use-device.md): Coarse device flags for iOS, Android, and desktop branching.
- [useDialog](./react/hooks/use-dialog.md): Imperative confirms and alerts fired from event handlers and callbacks.
- [useToast](./react/hooks/use-toast.md): Imperative toasts fired from event handlers and callbacks.
