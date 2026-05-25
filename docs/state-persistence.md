# State Persistence

Editor state that represents user preferences, UI settings, and other data that should survive page refresh uses **localStorage persistence** via `@nanostores/persistent`.

## Pattern

Use `@nanostores/persistent` to wrap atoms that should persist across browser sessions:

```ts
import { persistentAtom } from '@nanostores/persistent';

// Persisted atom with localStorage backend
export const $inspectorPanelOpen = persistentAtom<boolean>(
  'inspectorPanelOpen',  // localStorage key
  true,                  // default value
  {
    encode: JSON.stringify,
    decode: (s) => JSON.parse(s) as boolean,
  }
);

// Use just like a regular atom
$inspectorPanelOpen.set(false);
$inspectorPanelOpen.subscribe(value => { /* ... */ });
```

Alternatively, use the synchronous storage option (preferred for most cases):

```ts
export const $toolMode = persistentAtom(
  'toolMode',
  'translate',
  {
    encode: JSON.stringify,
    decode: (s) => JSON.parse(s) as string,
  }
);
```

## What to Persist

Persist any state that represents **user-facing settings or UI state** that end-users would expect to survive a refresh:

- **UI panel visibility** — inspector open/closed, sidebar state, etc.
- **Tool settings** — active tool mode (translate/rotate/scale), snap settings, gizmo snap values
- **View preferences** — camera position, zoom level, grid visibility
- **Recent data** — last opened part, recent SubParts, filters/search state
- **Display options** — theme, layout preferences, debug flags

## What NOT to Persist

Do **not** persist:

- **Transient working state** — currently-selected placement (users expect a fresh slate)
- **Session data** — undo/redo stacks (store separately if needed, clear on reload)
- **Large computed state** — expensive to serialize/deserialize
- **Data that comes from the server** — catalog, SubPart templates (load from source of truth)

## Implementation Notes

- **localStorage key naming**: Use camelCase with app prefix if needed, e.g. `flexo_toolMode`, `flexo_cameraZoom`
- **Defaults**: The second argument to `persistentAtom` is the default when localStorage is empty (first visit)
- **Encoding**: Use `JSON.stringify`/`JSON.parse` for most data; for complex types, add a custom encode/decode
- **Subscriptions**: Persist atoms work with all nanostores APIs (`subscribe()`, `useStore()`, computed, etc.)
- **Testing**: Clear localStorage in test setup if needed (`localStorage.clear()`)

## Layout and Panel State

Common example: persist which panels are open:

```ts
import { persistentAtom } from '@nanostores/persistent';

export const $panelStates = persistentAtom(
  'panelStates',
  { inspector: true, subpartBrowser: true, toolbar: true },
  {
    encode: JSON.stringify,
    decode: (s) => JSON.parse(s) as Record<string, boolean>,
  }
);
```

React components toggle via:

```tsx
function Inspector() {
  const [isOpen, setIsOpen] = useStore($panelStates);
  
  return (
    <div>
      <button onClick={() => setIsOpen(prev => ({ ...prev, inspector: !prev.inspector }))}>
        Toggle
      </button>
      {isOpen.inspector && <InspectorPanel />}
    </div>
  );
}
```

## Related

- [editor-state.md](./editor-state.md) — core nanostores atoms and actions
- [@nanostores/persistent docs](https://github.com/nanostores/persistent)
