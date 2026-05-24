---
title: "Manual install"
description: "Add cladd to any React project, no scaffolding required."
links:
  doc: https://cladd.io/react/installation/manual/
---

# Manual install

Use this guide if your setup isn't covered by the framework-specific pages — a custom Vite config, an embedded React island in an existing app, an internal monorepo with its own conventions, or you're building a library that re-exports cladd. Three things to wire up: the npm package, the stylesheet, and the provider.

## 1. Install the package

```bash
npm install @cladd-ui/react
```

Peer requirements: **React 19+** and **Tailwind CSS v4**. If your project doesn't have Tailwind yet, follow [Tailwind's installation docs](https://tailwindcss.com/docs/installation) for your bundler — the PostCSS plugin (`@tailwindcss/postcss`), Vite plugin (`@tailwindcss/vite`), and standalone CLI all work.

## 2. Import the stylesheet

In whichever CSS file your app already loads, add cladd's stylesheet **after** Tailwind's:

```css
@import 'tailwindcss';
@import '@cladd-ui/react/css';
```

Order matters — cladd extends Tailwind's `@theme` layer, so Tailwind has to load first. The cladd stylesheet defines the color tokens, surface variables, and component styles; it's the only stylesheet the package needs.

If your bundler doesn't resolve bare-package CSS imports (rare), you can also import the file from JS:

```ts
import '@cladd-ui/react/css';
```

## 3. Wrap your app in CladdProvider

Mount [`CladdProvider`](/react/components/cladd-provider/) once, as high in the tree as you can. It does three things — publishes the theme and accent color through context, mounts the dialog and toast portals, and sets the overlays root selector for popovers and tooltips:

```tsx
import { CladdProvider } from '@cladd-ui/react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <CladdProvider>
    <App />
  </CladdProvider>,
);
```

If your container element has an id other than `#root`, `#__next`, or `#app`, pass `overlaysRoot` so cladd's portals can find it:

```tsx
<CladdProvider overlaysRoot="#my-shell">…</CladdProvider>
```

## Verify

Render a [`Button`](/react/components/button/) somewhere visible:

```tsx
import { Button } from '@cladd-ui/react';

<Button color="brand">Hello from cladd</Button>;
```

If you see a styled brand button, you're done.

## Common pitfalls

- **Unstyled output.** The cladd `@import` is missing or comes before Tailwind. The two `@import` lines must be in that order and in a file your bundler actually processes.
- **`useTheme is not a function`-style errors.** A component is rendering outside [`CladdProvider`](/react/components/cladd-provider/). Move the provider up the tree.
- **Dialog or Toast hooks no-op.** [`useDialog`](/react/hooks/use-dialog/) and [`useToast`](/react/hooks/use-toast/) push into portals mounted by the provider — make sure `CladdProvider` is rendered (not just imported) above the calling component.
- **Tailwind v3 in the project.** Cladd's tokens are authored as `@theme` blocks, which v3 doesn't understand. Upgrade to v4 before installing.

## What you don't need

Cladd is a regular runtime dependency — no CLI, no codegen, no copy-paste step. There's nothing to `init`, no components to copy into your repo, and no separate registry. Install the npm package, import the CSS, mount the provider; the rest of the kit is just `import { Foo } from '@cladd-ui/react'`.
