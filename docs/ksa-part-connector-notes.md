# Connector Types

Connectors define how parts attach to other parts in KSA assemblies. Each connector type has specific attachment rules.

Flags are **independent toggles that may combine** — in flexo a connector's `flags`
is a `ConnectorFlag[]` (`Internal` / `ToSurface` / `FromSurface`), edited as three
checkboxes in the inspector and serialized as a `", "`-joined `<Flags>` (e.g.
`Internal, ToSurface`). An empty array is the default mode below and emits no `<Flags>`.

## Default (no flag)

**Behavior:** Bidirectional connector-to-connector attachment.

A part with a default connector can attach to any other part with a default connector. This is the standard attachment mode for most radial and axial connections.

## Internal

**Behavior:** Marks a connector as internal to prevent unintended self-attachment.

When `ConnectorTyping` is enabled, two internal connectors cannot attach to each other. Used for recessed mounting points (e.g., engine attachment seats on fuel tanks) where surface-to-surface contact is desired but connector-to-connector contact would cause visual artifacts (z-fighting). Currently not enabled by default.

## ToSurface

**Behavior:** Unidirectional surface attachment. This connector attaches *to* external surfaces only.

The part positions itself so the connector point contacts the target part's surface. Default connector-to-connector attachment is disabled. Used for parts that mount perpendicular to surfaces, like RCS thrusters.

## FromSurface

**Behavior:** Unidirectional surface attachment. Other parts attach *from their surfaces* to this connector.

Other parts can mount their surfaces against this connector point. Default connector-to-connector attachment is disabled. Does not support sliding/repositioning along the surface during attachment. Primary use: radial decoupler.

---

## Capabilities — what may FLOW across a connector (KSA 2026.7.9)

Flags (above) are hints about **how the editor orients** a part when connecting. Capabilities
are a completely independent axis: **what a connection is allowed to carry**. They are
authored as a whitespace-separated `<Capabilities>` element on the `<Connector>`, in the
geometry `<Part>` and/or the `<PartGameData>` (KSA ORs the two), and edited in flexo from the
connector inspector's **Capabilities** row.

A connection carries a resource only when **both** endpoints declare it.

| Token            | Effect                                                                       |
| ---------------- | ---------------------------------------------------------------------------- |
| `BulkFluid`      | Main-engine propellant may cross. **Required** for any `Bulk`-plumbed engine. |
| `SolidMotorCase` | SRB grain segments may stack across this connector.                          |
| `DecouplerJoint` | This connector forms a decoupler joint (**required** since rev 5007 — a `<Decoupler ConnectorId>` alone no longer does it). |
| `NoElectricity`  | Removes electricity from the default.                                        |
| `NoServiceFluid` | Removes service fluid (RCS) from the default.                                |

**Empty is not "nothing".** An unauthored connector is `Electricity | ServiceFluid` — the
two `No…` tokens SUBTRACT from that default rather than adding to an empty set (KSA inverts
them in `ConnectorCapabilityExtensions.ToCapability()`). So an RCS thruster works across a
plain connector, while a main engine gets nothing until you add `BulkFluid`.

> **Whitespace, never commas.** A multi-token `<Flags>` or `<Capabilities>` body must be
> space-separated: .NET's XML deserializer splits `[Flags]` enum text on whitespace and
> throws on an unknown token, so `"Internal, ToSurface"` fails the mod load on `"Internal,"`.

Full game-side detail: [scope/plumbing-and-feeds.md](../scope/plumbing-and-feeds.md).

## Which connector a surface mount picks (KSA 2026.7.9)

`Part.UnambiguousSurfaceMount()` + `Connection.ConnectSurfaceMount`: a surface mount now
**prefers the part's single unconnected `ToSurface` connector**. On a part with exactly one
free `ToSurface` node the placement is deterministic; on a multi-mount prefab it depends on
how many are still free — worth keeping in mind when authoring several `ToSurface`
connectors on one part.

## Face-snapping & editor tags (data-driven as of build 2026.6.9.4750)

Editor tags are no longer hardcoded statics in the game. They're a **data-driven registry**:
`Content/Core/CoreEditorTagsGameData.xml` defines one `<EditorTagDef>` per tag
(schema `EditorTagDefinition.cs`), and tags like `NoFaceSnapping` / `Coupling` / `Structural` /
`Fuel Tanks` are registered from that data — the old `EditorTag` static fields (and the obsolete
`Tanks` tag, now `Fuel Tanks`) were removed game-side.

Each `<EditorTagDef>` carries boolean flags that drive editor behavior (read by `VehicleEditor.cs`):

- `NotaCategory` — the tag is a **functional** marker, not a part-picker category button. flexo
  mirrors this in `EDITOR_TAG_DEFS` (`src/ksa/types.ts`) to group its tag-autocomplete into
  "Categories" vs "Functional"; the registered-but-functional tags are `Interstage`, `Radial`,
  `NoFaceSnapping`, `All`, `Hidden`.
- `FaceSnapBlacklist` / `FaceSnapTargetWhitelist` / `FaceSnapTargetBlacklist` — govern
  **face-snapping**: a part snaps off its **+Z** bounding face onto a target. (`NoFaceSnapping`
  opts a part out.) Note this is the **part's +Z bounding face**, distinct from a connector's
  **+X** facing arrow — the connector arrow is cosmetic and unrelated to face-snap orientation.
- `DiameterFilterlist` — the tag participates in the VAB **diameter** size-class filter (see the
  separate `<Diameter M>` `<PartGameData>` element, modeled as `PartGameData.diameterM`).
- `RootPartWhitelist` — the part may be a vehicle root.

**flexo impact:** the `<Connector>`/`<Flags>` schema itself is **unchanged**, so connector export
remains correct. flexo treats editor tags as a freeform string list (any string round-trips); the
registry only drives autocomplete suggestions + their grouping (`KNOWN_EDITOR_TAGS` /
`EDITOR_TAG_DEFS`, a static snapshot of the 16 Core tags). flexo does not implement face-snapping
(it has no in-game assembly), so the snap booleans are informational here.

---

**Enable/disable connectors:** Toggle with "Enable Connecting" in the Debug Editor to show/hide attachment UI. 
