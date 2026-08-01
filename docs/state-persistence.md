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

- **Transient working state** — currently-selected placement, camera position (users expect a fresh slate / reset camera)
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

## Sticky settings vs per-action state

A persisted setting should describe **how the user works**, not **what they are doing right
now**. The model importer is the worked example (`$modelImportSettings` in
`state/settingsStore.ts`, key `flexo:modelImport`):

| Persisted (sticky) | Dialog state (per-import) |
| --- | --- |
| `maxTextureSize` (1024/2048/4096, default 2048) — the VRAM budget | scale factor |
| `upAxis` (`'y'` \| `'z'`) — the DCC's export convention | name prefix |
| `bakeScale` — the default geometry bake | make double-sided |
| `decimateViewMeshes` — the exported `<MeshView>` budget | bake transforms to origin, merge |

The right-hand column is intentionally forgotten between imports: re-applying the last
model's fix-up to the next one produces a plausible-looking, wrong result (a leftover `×0.01`
scale is the worst of these). Persist a preference; never persist a correction.

### Worked examples — IVA seat view settings

Two persisted atoms landed with [IVA seats](./iva-seats.md), and they are a clean illustration
of the "persist a preference, never a correction" rule and of the document/view split:

| Atom               | Key                     | Default                              | Why it is view state, not document state                                                                                                                  |
| ------------------ | ----------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$ivaSeatSettings` | `flexo:ivaSeatSettings` | `{ markerSize: 0.12, showGazeCone: false }` | KSA has no seat size, so an `IvaSeat`'s `scale` is unused; how big the marker draws is a preference about *your screen*, exactly like the connector cube's size. |
| `$hideInterior`    | `flexo:hideInterior`    | `false`                              | "Show me the part the way the game does outside IVA" is a way of looking, not a property of the part. Flipping it must never create an undo step.          |

Both live outside `$part` and outside undo. The seat *view* itself (`$seatView`, `$seatLook`
in `ivaStore.ts`) is the counter-example on the other side: it is transient working state —
which seat you are sitting in right now — so it is **not** persisted at all, and a reload puts
you back at the orbit camera.

## Projects (workspace persistence)

Beyond individual preference atoms, the **entire editing workspace** is persisted as a
*project*: the `$part` document, per-layer view state, active layer, and the undo/redo
history. This is a separate, hand-rolled localStorage layer (not `@nanostores/persistent`)
because it bundles multiple stores under a named, switchable key and restores them before
React renders. Project snapshots are **schema-versioned** (`PROJECT_SCHEMA_VERSION`): they are
preserved across backwards-compatible model changes by default-filling the missing fields from
the live constructors, and purged at boot (with a user-visible notice) only on a version bump
or corruption — never migrated. See [projects.md](./projects.md) and the project constitution
in [AGENTS.md](../AGENTS.md).

## Related

- [editor-state.md](./editor-state.md) — core nanostores atoms and actions
- [projects.md](./projects.md) — project-based workspace persistence (multi-project, autosave, boot restore)
- [@nanostores/persistent docs](https://github.com/nanostores/persistent)
