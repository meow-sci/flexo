---
title: "Install in Astro"
description: "Set up cladd inside React islands in an Astro project."
links:
  doc: https://cladd.io/react/installation/astro/
---

# Install in Astro

Astro renders most of your site as static `.astro` files and hydrates React **islands** where you mark them. Cladd lives inside those islands — each one mounts its own [`CladdProvider`](/react/components/cladd-provider/), and you can share a single island around your whole page if you want one provider for everything.

## Create a new project

```bash
npm create astro@latest my-app
cd my-app
```

## Add the React integration

```bash
npx astro add react
```

This installs `@astrojs/react`, adds it to `astro.config.mjs`, and configures the TypeScript JSX setup. Accept the prompts.

## Install cladd and Tailwind

```bash
npm install @cladd-ui/react
npm install -D tailwindcss @tailwindcss/vite
```

In `astro.config.mjs`, register the Tailwind Vite plugin:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

## Import the stylesheets

Create `src/styles/global.css`:

```css
@import 'tailwindcss';
@import '@cladd-ui/react/css';
```

Pull it into your shared layout (e.g. `src/layouts/Layout.astro`) so every page loads it:

```astro
---
import '../styles/global.css';
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My App</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

## Build a cladd island

Astro's React integration only hydrates components you mark with a `client:*` directive. The cleanest pattern is a single "shell" island that wraps anything cladd-flavored:

```tsx
// src/components/CladdShell.tsx
import { CladdProvider } from '@cladd-ui/react';
import type { ReactNode } from 'react';

export function CladdShell({ children }: { children: ReactNode }) {
  return <CladdProvider>{children}</CladdProvider>;
}
```

Then use it from `.astro` files with `client:load`:

```astro
---
import { CladdShell } from '../components/CladdShell';
import { ActionBar } from '../components/ActionBar';
---

<main>
  <h1>Welcome</h1>
  <CladdShell client:load>
    <ActionBar />
  </CladdShell>
</main>
```

`ActionBar` (and any other React component you render inside `<CladdShell>`) can now use the full cladd API: hooks like [`useDialog`](/react/hooks/use-dialog/) and [`useToast`](/react/hooks/use-toast/), accent-color context, theme context — everything that [`CladdProvider`](/react/components/cladd-provider/) publishes.

## Notes

- **One island per provider scope.** Each `<CladdShell client:load>` boundary mounts its own provider, with its own portal roots. If you have multiple unrelated cladd regions on a page, that's fine — they don't share state, but they don't conflict either.
- **Pick the right `client:*` directive.** Use `client:load` for above-the-fold interactivity, `client:visible` for islands that don't need to be hydrated until they scroll into view, and `client:idle` for low-priority work. See the [Astro client directives docs](https://docs.astro.build/en/reference/directives-reference/#client-directives).
- **No SSR-only cladd usage.** Cladd components themselves SSR fine, but the dialog/toast portals only mount on the client — so you must hydrate the island for those hooks to work.
- **Polymorphic links.** Astro doesn't have a `<Link>` component (regular `<a>` tags trigger MPA navigation); just use `<Button as="a" href="/about">…</Button>` and let the browser handle it.
