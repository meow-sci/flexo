---
title: "useDevice"
description: "Coarse device flags for iOS, Android, and desktop branching."
links:
  doc: https://cladd.io/react/hooks/use-device/
---

# useDevice

`useDevice()` parses `navigator.userAgent` once and returns a small object of boolean flags — `ios`, `android`, `desktop`, `mobile`, `iphone`, `ipad`, `ipod`. It's the coarse "what kind of device is this" check that's just useful enough to keep handy: skip the install-PWA banner on desktop, render `Cmd ⌘` vs `Ctrl` in keyboard shortcuts, switch to a tap-friendly layout on touch devices.

Use it for **rendering decisions** — copy, layout, tap targets — not for feature detection. UA parsing is approximate and easy to spoof; if you need to know whether a specific browser capability exists (touch input, hover, pointer precision), use the matching CSS media query (`@media (hover: hover)`, `@media (pointer: coarse)`) or `matchMedia` directly.

```tsx
<div className="flex flex-col items-center gap-4">
  <SectionTitle>Detected device</SectionTitle>
  <div className="flex flex-wrap items-center justify-center gap-2">
    {flags.map((flag) => {
      const active = mounted && !!device[flag];
      return (
        <Chip
          key={flag}
          color={active ? 'green' : 'neutral'}
          variant={active ? 'solid' : 'transparent'}
        >
          {flag}
        </Chip>
      );
    })}
  </div>
  <span className="text-xs text-cladd-fg-soft">
    Read once from `navigator.userAgent`, then cached.
  </span>
</div>
```

## Usage

```tsx
import { Shortcut, useDevice } from '@cladd-ui/react';

function SaveShortcut() {
  const { ios } = useDevice();
  return <Shortcut keys={ios ? ['cmd', 's'] : ['ctrl', 's']} />;
}
```

The result is cached on first call — subsequent calls (even from other components) return the same object without re-parsing. To re-run detection (e.g. after stubbing `navigator.userAgent` in tests), pass `reset: true`.

## Signature

```ts
interface DeviceInfo {
  ios: boolean;
  android: boolean;
  desktop: boolean;
  mobile: boolean;
  iphone: boolean;
  ipod: boolean;
  ipad: boolean;
}

function useDevice(
  overrides?: { userAgent?: string },
  reset?: boolean,
): DeviceInfo;
```

| Argument              | Use it for                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `overrides.userAgent` | Pass a custom UA string instead of reading `navigator.userAgent` — useful for tests, Storybook stories, or rendering a specific-device preview. |
| `reset`               | Force the hook to re-parse on this call. The cached value is overwritten with the new result.                                                   |

### Flags

- **`desktop`** — true unless the UA is iOS or Android. Also true under Electron and NW.js shells (treated as desktop apps).
- **`mobile`** — true on any iOS or Android device. The inverse of `desktop` minus the Electron/NW.js carve-outs.
- **`ios`** — true on iPhone, iPad, and iPod, including iPadOS-spoofs-macOS detection (iPadOS reports `MacIntel` + touch).
- **`android`** — true on any Android browser.
- **`iphone` / `ipad` / `ipod`** — exact device flags within the iOS family.

## Notes

- **SSR returns `{}`.** On the server (where `window` is undefined) every flag is `undefined`. Either gate device-dependent UI behind a mounted check, or compute it server-side from your own `User-Agent` header and pass it down — don't read flags directly during the first server render.
- **First-call caching.** The hook parses the UA the first time it runs and reuses that result everywhere. This is fine in practice — UA doesn't change at runtime — but means `overrides` only takes effect on the _first_ call (or when paired with `reset: true`).
- **Approximate, not authoritative.** UA strings lie. For anything load-bearing (security checks, capability gating, billing), get the answer from the real source — a CSS media query, a feature test, a server-side check.
