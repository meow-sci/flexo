---
title: "Install in Next.js"
description: "Set up cladd in a Next.js project, app router or pages router."
links:
  doc: https://cladd.io/react/installation/next/
---

# Install in Next.js

Cladd works in both Next.js routers. Pick the section that matches your app.

## Create a new project

If you're starting from scratch:

```bash
npx create-next-app@latest my-app
cd my-app
```

Answer **yes** to TypeScript and Tailwind. The Next CLI scaffolds Tailwind v4 with the `@tailwindcss/postcss` plugin and a `globals.css` entry — that's exactly what cladd expects.

## Install cladd

```bash
npm install @cladd-ui/react
```

## Import the stylesheet

Open `app/globals.css` (App Router) or `styles/globals.css` (Pages Router) and add cladd's stylesheet **after** Tailwind's:

```css
@import 'tailwindcss';
@import '@cladd-ui/react/css';
```

Order matters — cladd's `@theme` tokens need Tailwind's layers in place before they can extend them.

## Wrap your app in CladdProvider

The provider publishes the theme, accent color, and overlay portals to the rest of the tree. Where it goes depends on which router you're using.

### App Router

[`CladdProvider`](/react/components/cladd-provider/) uses React context and renders portals, so it must live in a client component. Create `app/providers.tsx`:

```tsx
'use client';

import { CladdProvider } from '@cladd-ui/react';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return <CladdProvider>{children}</CladdProvider>;
}
```

Then wrap `app/layout.tsx`:

```tsx
import './globals.css';
import { Providers } from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

You don't need `'use client'` on every page that uses cladd components — only the parts that actually call hooks or attach event handlers need it. Static cladd markup (`<Button>`, `<Surface>`, `<Chip>` with no `onClick`) renders fine from a server component as long as a `CladdProvider` exists somewhere above it.

### Pages Router

Wrap `pages/_app.tsx`:

```tsx
import { CladdProvider } from '@cladd-ui/react';
import type { AppProps } from 'next/app';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <CladdProvider>
      <Component {...pageProps} />
    </CladdProvider>
  );
}
```

No `'use client'` needed — the Pages Router doesn't use server components.

## Verify the setup

Drop a [`Button`](/react/components/button/) into a page to confirm everything's wired up:

```tsx
import { Button } from '@cladd-ui/react';

export default function Page() {
  return <Button color="brand">Hello from cladd</Button>;
}
```

If you see a styled brand-colored button, you're done. If it looks unstyled, double-check that `globals.css` is imported in your root layout and that the cladd `@import` comes **after** `'tailwindcss'`.

## Notes

- **Polymorphic links.** Use `<Button as={Link} href="/about">…</Button>` (importing `Link` from `next/link`) to get cladd's button styling on a Next-routed link without extra wrappers. The same `as` prop works for [`Surface`](/react/components/surface/), [`Link`](/react/components/link/), [`ListButton`](/react/components/list/), and [`ToolbarButton`](/react/components/toolbar/).
- **Fonts are your choice.** Cladd doesn't ship a font; map `--font-sans` and `--font-mono` in your Tailwind `@theme` to whichever fonts you want — `next/font` or plain Google Fonts both work.
- **Dark mode.** [`CladdProvider`](/react/components/cladd-provider/) publishes the `theme` value through context but does not toggle a class on `<html>`. If you want a light theme, set the prop _and_ configure your CSS variables to match — see the [CladdProvider docs](/react/components/cladd-provider/) for the full story.
