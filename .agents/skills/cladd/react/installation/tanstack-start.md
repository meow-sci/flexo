---
title: "Install in TanStack Start"
description: "Set up cladd in a TanStack Start project."
links:
  doc: https://cladd.io/react/installation/tanstack-start/
---

# Install in TanStack Start

TanStack Start is built on Vite under the hood, so wiring cladd in is almost the same as a vanilla [Vite](/react/installation/vite/) app — the only real difference is where the provider lives.

## Create a new project

Follow [TanStack Start's quick start](https://tanstack.com/start/) to scaffold a project, or:

```bash
npm create @tanstack/start@latest my-app
cd my-app
npm install
```

## Install cladd and Tailwind

```bash
npm install @cladd-ui/react
npm install -D tailwindcss @tailwindcss/vite
```

## Wire up the Vite plugin

In `vite.config.ts`, add the Tailwind plugin alongside the TanStack Start plugin:

```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart()],
});
```

## Import the stylesheets

Create (or open) `src/styles/app.css`:

```css
@import 'tailwindcss';
@import '@cladd-ui/react/css';
```

cladd's stylesheet must come after Tailwind's so its `@theme` tokens layer on top.

## Wrap the root route in CladdProvider

TanStack Start's root layout lives in `src/routes/__root.tsx`. Wrap the children of the root component in [`CladdProvider`](/react/components/cladd-provider/) and pull in the stylesheet via the `head` export so it ships with every route:

```tsx
import { CladdProvider } from '@cladd-ui/react';
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router';
import appCss from '../styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: 'My App' }],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <CladdProvider>
          <Outlet />
        </CladdProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

## Verify the setup

Add a [`Button`](/react/components/button/) to your index route to confirm the install:

```tsx
import { Button } from '@cladd-ui/react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return <Button color="brand">Hello from cladd</Button>;
}
```

Run `npm run dev`. A styled brand button means everything is wired up.

## Notes

- **SSR works as-is.** [`CladdProvider`](/react/components/cladd-provider/) only renders portals on the client; the rest of cladd is SSR-safe. You don't need any client-only wrappers around it.
- **Router integration.** Use the polymorphic `as` prop to apply cladd styling to TanStack Router links: `<Button as={Link} to="/about" />` (import `Link` from `@tanstack/react-router`).
