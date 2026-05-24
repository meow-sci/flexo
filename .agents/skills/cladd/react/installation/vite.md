---
title: "Install in Vite"
description: "Set up cladd in a Vite + React project."
links:
  doc: https://cladd.io/react/installation/vite/
---

# Install in Vite

The fastest way to use cladd: Vite scaffolds a React app, the Tailwind v4 Vite plugin wires the stylesheet, and cladd plugs into both with two more lines.

## Create a new project

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
```

## Install cladd and Tailwind

```bash
npm install @cladd-ui/react
npm install -D tailwindcss @tailwindcss/vite
```

## Wire up the Vite plugin

In `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

## Import the stylesheets

Open `src/index.css` (the file Vite's React template imports from `src/main.tsx`) and replace its contents:

```css
@import 'tailwindcss';
@import '@cladd-ui/react/css';
```

Order matters — cladd's `@theme` tokens layer on top of Tailwind's, so they must come second.

## Wrap your app in CladdProvider

In `src/main.tsx`, wrap your root component in [`CladdProvider`](/react/components/cladd-provider/):

```tsx
import { CladdProvider } from '@cladd-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CladdProvider>
      <App />
    </CladdProvider>
  </StrictMode>,
);
```

## Verify the setup

Replace the contents of `src/App.tsx` with a quick smoke test:

```tsx
import { Button } from '@cladd-ui/react';

export default function App() {
  return (
    <div className="grid min-h-screen place-items-center bg-cladd-bg">
      <Button color="brand" size="lg">
        Hello from cladd
      </Button>
    </div>
  );
}
```

Run `npm run dev`. A brand-colored button on a dark background means everything is wired up.

## Notes

- **Vite's default `#root`.** [`CladdProvider`](/react/components/cladd-provider/) targets `#root` (among others) for its overlay portals, which matches Vite's default `index.html`. No extra config needed.
- **No `'use client'` directives.** Vite doesn't have server components, so cladd works the same on every component.
- **Path aliases.** If you set up `@/` aliases via `vite-tsconfig-paths`, the cladd import path stays `@cladd-ui/react` — that's a real npm package, not an alias.
