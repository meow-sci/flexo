---
title: "Installation"
description: "How to install cladd in a React project."
links:
  doc: https://cladd.io/react/installation/
---

# Installation

Cladd is a regular npm package that drops into any React 19+ app. Pick the framework you're using to get a step-by-step guide, or jump to [Manual](/react/installation/manual/) for a plain React setup.

## Choose your framework

<FrameworkCards />

## The short version

If you've installed Tailwind v4 packages before, this is the whole story:

```bash
npm install @cladd-ui/react
```

Import the stylesheet **after** Tailwind, in the same CSS file:

```css
@import 'tailwindcss';
@import '@cladd-ui/react/css';
```

Wrap your app in [`CladdProvider`](/react/components/cladd-provider/) once, as high in the tree as possible:

```tsx
import { CladdProvider } from '@cladd-ui/react';

export default function App({ children }) {
  return <CladdProvider>{children}</CladdProvider>;
}
```

That's it — every cladd component reads its theme, accent color, and overlay portals from this provider. The framework guides above just show _where_ each of these three steps goes for your particular setup.

## Requirements

- **React 19+** — cladd uses the new ref-as-prop API and a few React 19 hooks. There's no plan to backport to React 18.
- **Tailwind CSS v4** — cladd's styles are authored as `@theme` blocks and CSS layers; v3 won't pick them up. See the [Tailwind v4 docs](https://tailwindcss.com/docs/installation) for framework-specific setup.
- **A bundler that respects CSS import order.** The cladd stylesheet must load after Tailwind so its `@theme` tokens layer on top.
