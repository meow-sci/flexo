---
title: "Install in React Router"
description: "Set up cladd in a React Router (framework mode) project."
links:
  doc: https://cladd.io/react/installation/react-router/
---

# Install in React Router

This guide covers **React Router v7+** in framework mode (the successor to Remix). For data-router or library-mode usage, follow the [Vite](/react/installation/vite/) guide instead — there's no app shell to wrap, just the regular Vite flow.

## Create a new project

```bash
npx create-react-router@latest my-app
cd my-app
npm install
```

## Install cladd and Tailwind

```bash
npm install @cladd-ui/react
npm install -D tailwindcss @tailwindcss/vite
```

## Wire up the Vite plugin

In `vite.config.ts`, add the Tailwind plugin next to the React Router one:

```ts
import { defineConfig } from 'vite';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
});
```

## Import the stylesheets

Open `app/app.css` and replace its contents:

```css
@import 'tailwindcss';
@import '@cladd-ui/react/css';
```

Order matters — cladd's `@theme` tokens layer on top of Tailwind's, so they must come second.

## Wrap the root in CladdProvider

The root layout lives in `app/root.tsx`. Wrap the `<Outlet />` in [`CladdProvider`](/react/components/cladd-provider/) and re-export the stylesheet through the `links` export so it loads on every route:

```tsx
import { CladdProvider } from '@cladd-ui/react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { LinksFunction } from 'react-router';

import stylesheet from './app.css?url';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: stylesheet },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <CladdProvider>
          <Outlet />
        </CladdProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

## Verify the setup

Drop a [`Button`](/react/components/button/) into a route to confirm the install:

```tsx
import { Button } from '@cladd-ui/react';

export default function Home() {
  return <Button color="brand">Hello from cladd</Button>;
}
```

Run `npm run dev`. A styled brand button means everything is wired up.

## Notes

- **SSR is safe.** [`CladdProvider`](/react/components/cladd-provider/) is SSR-friendly; portals mount on the client without flicker. You don't need a `<ClientOnly>` wrapper.
- **Polymorphic router links.** Use `<Button as={Link} to="/about" />` (import `Link` from `react-router`) to get cladd styling on a React Router link.
- **Stylesheet via `links` or `import`.** Importing `app.css?url` and re-exporting it through `links` is the framework-mode idiom; a bare `import './app.css'` also works in most setups, but the `links` export is what RR's docs recommend for hot-reload reliability.
