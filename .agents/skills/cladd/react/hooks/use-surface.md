---
title: "useSurface"
description: "Read the current depth level inside a Surface stack."
links:
  doc: https://cladd.io/react/hooks/use-surface/
---

# useSurface

`useSurface()` returns the current [`Surface`](/react/components/surface/) **depth level** (1–5) at the point in the tree where it's called. The surface system propagates levels through context — a `Surface` with no `level` prop renders one shade deeper than its parent — and this hook is the read-side of that propagation.

You rarely need it for normal layout: nesting plain `Surface`s "just works" because each one auto-bumps off the level it reads from context. Reach for `useSurface` when you're building a **custom container** that should colour itself in line with the surrounding surface stack, or when you want a non-surface element (an icon tint, a divider, a status dot) to track the current depth.

```tsx
function SurfaceLevelTag() {
  const level = useSurface();
  return <span>useSurface() → {level}</span>;
}

function SurfaceLevelExample() {
  return (
    <Surface outline contentClassName="flex flex-col gap-2 p-4">
      <SurfaceLevelTag />
      <Surface outline contentClassName="flex flex-col gap-2 p-4">
        <SurfaceLevelTag />
        <Surface outline contentClassName="flex flex-col gap-2 p-4">
          <SurfaceLevelTag />
        </Surface>
      </Surface>
    </Surface>
  );
}
```

## Usage

```tsx
import { Surface, useSurface } from '@cladd-ui/react';

function DepthBadge() {
  const level = useSurface();
  return (
    <span className="text-xs text-cladd-fg-soft">You're at level {level}</span>
  );
}

<Surface outline>
  <DepthBadge /> {/* level 2 — Surface auto-bumped from the root level 1 */}
  <Surface outline>
    <DepthBadge /> {/* level 3 */}
  </Surface>
</Surface>;
```

The value reflects the **published** level of the nearest enclosing `Surface`. Outside any `Surface`, the hook returns `1` — the root level.

## Signature

```ts
function useSurface(): number;
```

The return value is always an integer in the range `1–5`. Levels are clamped at 5; nesting past that depth keeps publishing `5`.

## Notes

- **`variant="transparent"` is invisible to depth.** A transparent surface publishes its _parent's_ level — children render at the same depth as the wrapper. Use it to group elements without adding a visual layer.
- **Relative offsets work the same way under the hood.** Passing `level="+1"` or `level="-1"` to a [`Surface`](/react/components/surface/) reads the same context this hook does, then publishes the offset value to descendants.
- **Read it for visual decisions, not layout.** The hook tells you the depth tone, not anything about size, position, or DOM structure — pair it with `cladd-surface-level-{n}` utility classes when you need a custom element to match the surface stack.
