# IVA seats — authoring KSA interior camera vantage points in flexo

> **Status:** 📋 **PLANNED** (not implemented). Research verified against KSA build
> **2026.7.9.5018** (`ksa-game-assemblies/current/decomp` + `ksa-game-assemblies/current/Content/Core`).
>
> **The question this plan answers — and the answer:** _"Is IVA support/position defined in XML
> data so that custom Flexo-authored parts could control it?"_ → **YES, completely. It is one
> repeatable XML element with three vectors, on the `<PartGameData>` flexo already emits. No
> code mod, no C#, no special asset, no game cooperation of any kind.** Multiple vantage points
> and the cycle-through-seats behaviour fall out of authoring the element more than once.
>
> **Goal:** let a flexo user place, aim and preview IVA seats inside a custom command module /
> crew quarters in the 3D workspace, and export them as KSA-legal `<IVASeat>` game data.
>
> **Second goal, independent of the first (Phase 0):** delete the ad-hoc **"de-IVA"** concept and
> replace it with the thing it was always standing in for — the `<Internal>` flag as plain,
> user-editable document data, toggled in bulk from the SubPart list. Today flexo silently rewrites
> every placed interior prop to render everywhere; after Phase 0 the user owns that decision, flexo
> mirrors the game's data faithfully by default, and a special-cased `_NotIVA` code path disappears.

---

## 0. The headline answer: IVA is one XML element, three vectors

`IVASeat` is a **Part component** — a `ModuleBase.TemplateDataBase` subclass, exactly like
`<Collider>`, `<Tank>` and `<Light>` — so it lives in `PartTemplate.Components` and is legal as a
direct child of `<PartGameData>`. Its entire authored schema is:

```xml
<IVASeat>
    <Position   X="-0.45" Y="0.42" Z="-0.35" />
    <ForwardAxis X="1" />
    <UpAxis      Z="-1" />
</IVASeat>
```

That is **all** of it (`decomp/KSA/IVASeat.cs:9-27`):

```csharp
[XmlType(TypeName = "IVASeat")]
public class IVASeatTemplate : TemplateDataBase
{
    [XmlElement("Position")]    public Vector3Reference PositionAsmb  = new Vector3Reference();
    [XmlElement("ForwardAxis")] public Vector3Reference ForwardAxisAsmb = new Vector3Reference(new double3(1, 0, 0));
    [XmlElement("UpAxis")]      public Vector3Reference UpAxisAsmb      = new Vector3Reference(new double3(0, 0, -1));
}
```

Everything else about IVA — the fixed camera, the free-look, the seat cycling, the interior-only
rendering — is engine behaviour driven **entirely** off that data. There is no "IVA support" flag,
no interior-space registration, no `<Control/>` requirement. **A vehicle offers the IVA camera mode
iff at least one part in it carries at least one `<IVASeat>`**; with zero seats the mode is silently
skipped (`IVAController.OnSwitchOn` → `Program.HoveredViewport.NextCameraMode()`,
`decomp/KSA/IVAController.cs:164-169`).

**This is the ideal outcome for flexo**: it is a pure `<PartGameData>` child, in the Part's own
assembly frame, in the same coordinate space flexo already places connectors and colliders in.

---

## 1. Game contract — how KSA IVA actually works

Every claim cites the decompiled source and/or shipped asset evidence. This section is the input
for the `scope/connectors-coordinates-iva.md` update (§5).

### 1.1 The XML schema and where it is legal

| Element / attr           | Type                                            | Meaning                                                                                                                                                             |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<IVASeat Id>`           | `TemplateDataBase.Id` (`[XmlAttribute]`)        | Component id. **Core never authors it**, and nothing references a seat by id. It shares the id namespace `<FeedsFrom Container="…">` resolves against (`PartTemplate.AddResolvedFeed`), so **flexo emits none** (§3.5). |
| `<Position X Y Z>`       | `Vector3Reference` (doubles, each attr def `0`) | The eye point, in the **owning Part's assembly frame**, meters. Element absent ⇒ `(0,0,0)`.                                                                          |
| `<ForwardAxis X Y Z>`    | `Vector3Reference`                              | The direction the camera looks when you sit down, **and the centre of the allowed view hemisphere** (§1.3). Element absent ⇒ **`(1,0,0)`** (the C# field initializer). |
| `<UpAxis X Y Z>`         | `Vector3Reference`                              | The camera's up (roll reference) **and the pole the pitch is clamped against** (§1.3). Element absent ⇒ **`(0,0,-1)`**.                                              |

⚠️ **Element-absent vs attribute-absent are DIFFERENT defaults.** `Vector3Reference` initialises
each of `X`/`Y`/`Z` to `0`, so a *present* `<ForwardAxis/>` with no attributes reads `(0,0,0)` — a
zero look direction, which NaNs the camera (§1.6). Only an *entirely absent* element gets the
`(1,0,0)` / `(0,0,-1)` field defaults. The parser must branch on element presence, and the
serializer must always write all three axes (§3.5).

`Components` is mapped by element name onto **every `PartTemplate` subclass** at runtime
(`XmlHelper.cs:33-44` reflects over every `ModuleBase.TemplateDataBase` and registers
`new XmlElementAttribute(type.GetCustomAttribute<XmlTypeAttribute>()?.TypeName, type)` against
`PartTemplate.Components`). `PartGameDataReference : PartTemplate`,
`SubPartGameDataReference : PartGameDataReference`, `SubPartTemplate : PartTemplate` ⇒ `<IVASeat>`
is *schema-legal* in four places (geometry `<Part>`, geometry `<SubPart>`, `<PartGameData>`,
`<SubPartGameData>`), and `PartGameDataReference.OnDataLoad` → `PartTemplate.ApplyGameData` ends with
`Components.AddRange(gameData.Components)` (`PartTemplate.cs:312`) — an **additive merge, no
dedupe** — so authoring on `<PartGameData>` is exactly equivalent to authoring on the geometry
`<Part>`. **flexo models the Part-level pair and normalises everything into `<PartGameData>`**, the
same decision colliders made (see `plans/COLLIDERS_PLAN.md` §1.3). SubPart-level seats are an
explicit non-goal (§6) and keep riding the GameData passthrough.

`IVASeat.CreateComponents(part, template, instance)` is called from
`ModuleList.CreateModules` (`ModuleList.cs:119`) for **every** Part and SubPart, and simply copies
the three vectors onto a runtime module parented to that part.

### 1.2 The only shipped example — and the `AttachedInternal` indirection flexo skips

Core authors exactly **two** IVA seats in the whole game, both in
`Content/Core/CoreIVASpaceAGameData.xml:18-28` (the Gemini-style two-seat capsule interior):

```xml
<PartGameData Id="CoreIVASpaceA_Prefab_MediumCapsuleA">
    <EditorTag Value="Hidden"/>
    <Light> … interior point light … </Light>
    <IVASeat>
        <Position X="-0.45" Y="0.42" Z="-0.35" />
        <ForwardAxis X="1" />
        <UpAxis Z="-1" />
    </IVASeat>
    <IVASeat>
        <Position X="-0.45" Y="-0.42" Z="-0.35" />
        <ForwardAxis X="1" />
        <UpAxis Z="-1" />
    </IVASeat>
</PartGameData>
```

Both seats sit aft of the part origin (`X = -0.45`, i.e. toward the heat shield), ±0.42 m apart
across `Y`, looking along **+X** — the nose, where the windows are — with up along **−Z**. Note the
`<EditorTag Value="Hidden"/>`: this is not a pickable part.

**How Core attaches it, and why flexo does not copy that.** The interior is its own `<Part>` /
`<PartGameData>` pair, and the capsule references it with one line
(`Content/Core/CoreCommandAGameData.xml:11`):

```xml
<PartGameData Id="CoreCommandA_Prefab_MediumCapsuleVariantA">
    <AttachedInternal InstanceOf="CoreIVASpaceA_Prefab_MediumCapsuleA" />
    …
```

`AttachedInternal` (`decomp/KSA/AttachedInternal.cs`) is a component carrying `InstanceOf` + an
optional `<Transform>`; when the **vehicle editor** places the capsule it instantiates that template
as a real child Part and connects it (`VehicleEditor.cs:5186-5210`), which is why the shipped
vehicles carry it as a plain `<PartRef InstanceOf="CoreIVASpaceA_Prefab_MediumCapsuleA" …>`
(`Content/Core/defaultvehicles/Gemini7/vehicle.xml:11`).

**flexo authors `<IVASeat>` directly on its own part instead**, because:

- It is strictly simpler and strictly more robust — no second part/prefab to declare, no dependence
  on the editor spawning a child, and the seat frame **is** the part frame (no `AttachedInternal`
  offset to compose).
- flexo edits exactly one Part; the reuse `AttachedInternal` buys (one interior shared by several
  hull variants) is not a flexo workflow.
- `AttachedInternal` on an imported part already round-trips verbatim through the `<PartGameData>`
  passthrough (`unknownChildren`), so nothing is lost by not modeling it.

### 1.3 The camera math — position, forward, up, and the two clamps

`IVAController` (`decomp/KSA/IVAController.cs`) is a fixed-position free-look camera. The parts that
matter for authoring:

**Position — recomputed every frame** (`:40-41`):

```csharp
double3 posAsmb = Seat.Parent.PositionVehicleAsmbOffset(Seat.PositionAsmb);
Camera.PositionEcl = vehicle.GetPositionEcl() + vehicle.PosAsmbToBody(posAsmb).Transform(vehicle.Body2Cce);
```

`Part.PositionVehicleAsmbOffset(offset) => offset.Transform(MatrixAsmb2VehicleAsmb)`
(`Part.cs:1008-1010`), and for a non-SubPart Part `MatrixAsmb2VehicleAsmb == MatrixAsmb2ParentAsmb ==
CreateScale(Scale) * CreateFromQuaternion(Asmb2ParentAsmb) * CreateTranslation(PositionParentAsmb)`
(`Part.cs:660`, `:690-702`). ⇒ **`<Position>` is a plain offset in the Part's own assembly frame** —
the identical space flexo places SubParts, connectors and colliders in. (It is multiplied by the
Part's `Scale`, which is `1` for a normally-placed part; only the animation system writes a non-unit
`Part.Scale`.)

**Initial orientation on sit-down** (`:192-194`):

```csharp
double3 forwardEcl = Seat.ForwardAxisAsmb.Transform(vehicle.Asmb2Cce * Seat.Parent.Asmb2VehicleAsmb);
double3 upEcl      = Seat.UpAxisAsmb.Transform(vehicle.Asmb2Cce * Seat.Parent.Asmb2VehicleAsmb);
Camera.LocalRotation = KSA.Camera.LookAtRotation(forwardEcl, upEcl);
```

`Camera.LookAtRotation` (`Camera.cs:190-196`) **orthonormalises**:

```csharp
double3 f = double3.Normalize(forwardEcl);
double3 r = double3.Cross(f, upEcl).Normalized();
double3 u = double3.Cross(r, f).Normalized();
// rows: r, u, -f  ⇒ a standard GL view basis (camera looks down its own -Z, +Y up)
```

⇒ `<UpAxis>` need **not** be perpendicular to `<ForwardAxis>`; only non-parallel. (This is why a
flexo round-trip that re-orthogonalises a sloppy authored `<UpAxis>` is **semantically lossless** —
the game computes the same camera frame either way. See §3.2.)

**The two view clamps, applied every frame** (`:69-112`) — these are the surprising part, and the
reason `ForwardAxis` is an authoring decision rather than a cosmetic initial heading:

1. **Forward hemisphere.** `num2 = clamp(dot(look, normalize(ForwardAxis)), -1, 1)`; if `num2 < 0`
   the look is rotated back until it is exactly 90° off the forward axis (`:82-94`).
   ⇒ **you can never look more than 90° away from `ForwardAxis`.** A seat cannot look behind
   itself. Two directions ⇒ two seats.
2. **Up-pole exclusion.** `value = dot(look, UpAxisAsmb.Transform(...))` — note the up axis is
   **NOT normalized here** — and if `|value| > 0.9` the look is pushed back to
   `acos(0.9) ≈ 25.84°` from the pole (`:95-108`). ⇒ **the pitch stops ~25.8° short of straight
   up/down**, measured against `UpAxis`.

Both clamps are ported verbatim in §3.6 so flexo's preview shows exactly what the game allows.

**Free-look input** (`:44-78`): 3-sample-smoothed mouse delta, yaw about `Camera.GetUp()`, pitch
about `Camera.GetRight()`, scaled by `GameSettings.Current.Input.LookSensitivity`. Holding **Alt**
(or having any game window open) releases the cursor and freezes the look
(`GetCursorMode`, `:204-207`). Default vertical FOV is **50°** (`Camera.cs:51`
`_fovRadians = 0.87266463f` = 50.0°; `GameSettings.FieldOfView = 50`) — which happens to be exactly
flexo's own `new THREE.PerspectiveCamera(50, …)` (`src/three/Viewport.ts:48`), so the preview needs
no FOV change.

### 1.4 Reachability and seat cycling

| Behaviour                                                        | Source                                                                  | Consequence for authoring                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Camera modes cycle `Orbit → Free → IVA → Orbit` on **Shift+C**   | `Viewport.NextCameraMode()` (`Viewport.cs:385-400`), `Input.cs:339`      | IVA is reachable **only** through this cycle — the View menu offers Orbit/Free/Map and deliberately not IVA (`Program.cs:3417-3427`). |
| **Zero seats in the vehicle ⇒ IVA is skipped**                   | `IVAController.OnSwitchOn` (`IVAController.cs:164-169`)                 | `<IVASeat>` is the on/off switch for the whole mode. One seat anywhere in the vehicle enables it.                      |
| **C** cycles to the next seat, wrapping                          | `IVAController.OnKey` + `InputAction.IVASwitchToNextSeat` (`Input.cs:337`) | Multiple vantage points are just multiple elements; nothing else to author.                                            |
| The seat list is **vehicle-wide**                                | `vehicle.Parts.Modules.Get<IVASeat>()`; `PartTree.AddModulesAndStaticParts` walks every part + subpart (`PartTree.cs:262-272`) | A crew-quarters part contributes its seats to whatever vehicle it is bolted to. Seats from several parts concatenate.  |
| **Cycle order == document order**; index 0 is the default seat   | `Module<T>.List.Add` appends at the end of its own concrete-type segment (`Module.cs:261-296`); `OnSwitchOn` sets `Seat = span[0]` | **The FIRST `<IVASeat>` in the XML is the one IVA opens on**, and `C` walks them in authored order ⇒ flexo must let the user reorder seats (§3.4). |
| Switching vehicles / losing the followed vehicle drops out of IVA | `OnFrame` `:29-38`                                                      | Nothing to author.                                                                                                    |
| No `<Control/>`, `<EVADoor>`, tank, collider or crew model needed | grep-verified: `IVASeat` appears in no other template class             | A bare part with one `<IVASeat>` is a valid IVA part.                                                                 |

### 1.5 What actually renders in IVA — the other half of a believable interior

`<IVASeat>` puts the camera somewhere. What you *see* is decided by the `<PartModel>` render gate
(`PartModel.cs:387`):

```csharp
if (Template.RayTracing != RaytracingMode.ShadowProxy && (!Template.Internal || viewport.Mode == CameraMode.IVA))
    viewportData.InstanceList.Add(instanceData);
```

| `<PartModel>` flags                | Renders in IVA | Renders outside IVA | Use                                                        |
| ---------------------------------- | -------------- | ------------------- | ---------------------------------------------------------- |
| _(nothing)_                        | ✅              | ✅                   | The exterior hull.                                         |
| `<Internal>true</Internal>`        | ✅              | ❌                   | Interior geometry + props. **This is what an interior is.** |
| `<RayTracing>ShadowProxy</RayTracing>` | ❌          | ❌                   | Invisible occluder that still blocks ray-traced light — Core's `CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker`. |

Read the gate carefully: it is **not** "IVA shows only Internal meshes". In IVA you see **both** —
every non-`ShadowProxy` model plus the Internal ones; outside IVA the Internal ones drop out. So
`<Internal>` means *"interior-only"*, not *"the interior layer"*, and an interior looks right in IVA
only because the exterior hull surrounds you and is back-face-culled away (below).

⚠️ **`<Internal>` exists ONLY on `<PartModel>`.** `PartModelGlassModule.Template`
(`<PartModelGlass>`) has just `<Mesh>`/`<Material>`/`<RayTracing>` (a **bool**, not the enum)
/`<ShadowCaster>`, and `<PartModelDynamic>` has no `<Internal>` either — grep-verified: exactly one
`[XmlElement("Internal")]` exists in the whole decomp, in `PartModelModule.cs:35`. **KSA glass can
never be interior-only.**

Consequences for a flexo-authored IVA part:

- **You are inside your own exterior hull, and KSA culls back faces unconditionally**
  (see `scope/custom-assets-and-mod-export.md`), so from a seat the hull is simply *not there* — you
  look straight out at space. **An IVA part needs real interior geometry** (custom meshes, or placed
  `CoreIVASpaceA_*` / `CoreIVAPropA_*` SubParts) or the seat looks into the void.
- `<PartModelGlass>` and `<PartModelDynamic>` receive an IVA bit (`0x20`) in their per-instance state
  (`PartModelGlassModule.cs:81`, `PartModelDynamicModule.cs:93`), i.e. window glass is shaded
  differently from inside. Nothing to author; noted so nobody hunts for a data flag.
- IVA ray tracing is a graphics setting (`GameSettings.IVARayTracing`, off by default) and interacts
  with a `<Light RayTracing>true</RayTracing>` — which flexo already models
  (`Light.rayTracing`, `types.ts:474`).

🔴 **This collides head-on with flexo's existing "de-IVA" export.** `buildExportVariantMap`
(`src/ksa/modExport.ts:198-229`) unconditionally re-homes **every** placed built-in `Internal`
SubPart onto a `flexo_<base>_<id>_NotIVA` variant that *omits* `<Internal>` + `<RayTracing>`, so IVA
props render in the exterior view. That is right for "decorate an exterior part with a cockpit chair"
and **wrong** for "build a real interior with seats" — and there is no way to ask for the other one.

**§3.7 deletes the concept rather than adding a mode for it.** `<Internal>` is one boolean on one
element; flexo should model it as such and let the user set it, exactly like every other piece of
game data flexo exposes. That is Phase 0 and it stands alone — it is worth doing whether or not seats
ever ship.

### 1.6 The gotcha list (author these into the UI, the docs and the validator)

1. **`ForwardAxis` ∥ `UpAxis` ⇒ NaN camera.** `LookAtRotation` does
   `Cross(f, up).Normalized()`; a zero cross product normalises to NaN and poisons
   `Camera.LocalRotation`. **Blocking** validation rule.
2. **A zero `ForwardAxis` or `UpAxis` ⇒ NaN camera** (same path; also `Normalize(forward)`).
   Remember a *present but empty* `<ForwardAxis/>` is zero (§1.1). **Blocking.**
3. **A non-unit `UpAxis` silently changes the pitch clamp.** The up-pole test
   `|dot(look, UpAxisAsmb)| > 0.9` uses the **raw, un-normalized** vector (`IVAController.cs:95-96`).
   With `|up| = 2` the clamp engages at `acos(0.45) ≈ 63°`, shrinking the usable pitch to ±27°; with
   `|up| = 0.5` it never engages at all and the look can reach the pole, where
   `Cross(f, up)` degenerates → NaN. Core authors unit axes; **flexo always emits unit axes** and
   warns on a non-unit import.
4. **You cannot look more than 90° off `ForwardAxis`** (§1.3). Authors expect a seat to be a free
   look sphere; it is a hemisphere. Say so in the inspector, and enforce it in the preview.
5. **The first seat is the default seat, and document order is cycle order** (§1.4) — so seat order
   is authored data, not an implementation detail.
6. **The interior must be `<Internal>`** or it renders in the exterior view too, and the hull will
   not be visible from inside (§1.5). **Glass cannot be** — `<PartModelGlass>` has no such field, so
   a window pane always renders in every camera mode (§1.5).
6b. **Interior geometry with no seat anywhere in the vehicle is invisible in every camera mode** —
   `<Internal>` hides it outside IVA, and with no seat the IVA mode is never offered (§1.4). A warn
   rule (§3.8).
7. **`<IVASeat Id>` shares the feed-container id namespace** (`PartTemplate.AddResolvedFeed` scans
   every `Components[].Id`). flexo emits none — matching Core byte-for-byte and dodging it entirely.
8. **No in-game editor preview exists.** The KSA vehicle editor has no IVA mode; the only in-game
   check is launch → Shift+C twice → C to cycle. That is precisely why flexo should ship the seat
   preview in §3.6.
9. **`<IVASeat>` on an animated SubPart tracks the animation** (the controller recomputes
   `Seat.Parent.PositionVehicleAsmbOffset` every frame, and
   `KeyframeAnimationModule.ApplyAnimationTransforms` writes `part.PositionParentAsmb` /
   `Asmb2ParentAsmb`, `KeyframeAnimationModule.cs:318-358`). Interesting, but a non-goal (§6).

### 1.7 The exemplar to build against

Reproduce Core's two-seat capsule as a flexo project and diff the emitted XML against
`Content/Core/CoreIVASpaceAGameData.xml:18-28`:

```
PartGameData  <project>
  ├ IVASeat   Position(-0.45,  0.42, -0.35)  ForwardAxis(1,0,0)  UpAxis(0,0,-1)   ← default seat
  └ IVASeat   Position(-0.45, -0.42, -0.35)  ForwardAxis(1,0,0)  UpAxis(0,0,-1)
```

Both seats are identity-rotation under flexo's seat convention (§3.2), so this is also the
regression that proves the convention: **`rotation = (0,0,0)` must emit `ForwardAxis X="1"` +
`UpAxis Z="-1"`.**

---

## 2. Where flexo stands today

| Layer                          | Today                                                                                                                                                                        | Verdict                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `src/ksa/types.ts`             | No seat type. `<IVASeat>` is named as a canonical example of `RawXmlNode` passthrough (`:977`)                                                                                | ❌ not modeled           |
| `src/ksa/partXmlParser.ts`     | `'IVASeat'` is absent from `KNOWN_PART_GAMEDATA_CHILDREN` (`:783-809`) ⇒ swept into `unknownChildren` by `captureUnknownChildren` (`:842`)                                    | 🟡 preserved, opaque    |
| `src/ksa/partXmlSerializer.ts` | Re-emits the raw node last (`:276`)                                                                                                                                          | 🟡 preserved, opaque    |
| `src/ksa/partCatalog.ts`       | Imports a built-in Part's `<PartGameData>` passthrough, so an imported capsule keeps whatever seats its GameData held — but Core's live in a **different** part (§1.2), so in practice nothing | 🟡 vacuously fine       |
| `src/ksa/modExport.ts`         | **De-IVAs every placed `Internal` SubPart unconditionally** (`:198-229`), emitting a `_NotIVA` variant that drops `<Internal>` **and `<RayTracing>`**                          | 🔴 actively wrong for a real interior; the dropped `<RayTracing>` silently turns a `ShadowProxy` occluder into a visible mesh |
| `src/ksa/catalog.ts`           | Captures `CatalogSubPart.internal` (`:199-201`) but **not** `<RayTracing>`; the docstring (`:31-35`) documents the de-IVA behaviour as intrinsic                              | 🟡 the flag is read but not editable |
| `src/ksa/assetsXmlSerializer.ts` | `ReferenceSubPartPlan` has no `internal`/`rayTracing` — a variant can only ever be non-Internal (`:171-199`)                                                                | 🔴 no way to express the other case  |
| `src/state/projectCodec.ts`    | Rides `uc` (unknownChildren)                                                                                                                                                 | 🟡                      |
| 3D / UI                        | Nothing                                                                                                                                                                      | ❌                       |
| `scope/connectors-coordinates-iva.md` | Covers the `<Internal>` render gate + the NotIVA export in detail; **says nothing about `<IVASeat>`**                                                                  | 📝 gap in the catalog   |

Net: a flexo-authored part can never be entered in IVA, and a user who builds an interior out of
Core IVA props gets it de-IVA'd on export.

---

## 3. Design

### 3.1 Document model — seats are first-class 3D entities

A seat is a placed, oriented thing you want to click, aim, nudge, duplicate, hide and reorder. So it
follows the **connector/collider pattern** (a flat top-level list on `EditingPart` pinned to a
built-in layer), not the tank/light pattern (numbers buried in `gameData`). That buys selection, the
gizmo, multi-select, copy/paste, the Assets list, layer visibility/lock/opacity and undo with almost
no new machinery.

```ts
// src/ksa/types.ts

/**
 * One IVA (interior view) camera vantage point — a "seat". KSA `IVASeat.IVASeatTemplate`
 * (`decomp/KSA/IVASeat.cs`), emitted as an `<IVASeat>` child of `<PartGameData>`.
 *
 * {@link Transform} is reused with a deliberate reinterpretation:
 *  - `position` → `<Position X Y Z>` — the EYE POINT in the Part's assembly frame, meters
 *    (direct, no conversion — the same space as a placement/connector/collider).
 *  - `rotation` → NOT emitted directly. KSA stores the orientation as two vectors
 *    (`<ForwardAxis>` + `<UpAxis>`); flexo stores the equivalent rotation so the seat rides
 *    the normal 3D gizmo, and converts at the XML boundary (src/ksa/ivaSeatAxes.ts).
 *    Identity rotation ⇒ KSA's own schema defaults, forward +X / up −Z.
 *  - `scale` → UNUSED. KSA has no seat size; the writer pins it to (1,1,1) and it is never
 *    emitted (same treatment as `Light.transform.scale`). The marker's on-screen size is a
 *    global view setting (`$ivaSeatSettings.markerSize`), like the connector cube.
 *
 * Order is LOAD-BEARING: the first seat is the one the IVA camera opens on and `C` cycles
 * them in document order (see scope/connectors-coordinates-iva.md).
 */
export interface IvaSeat extends Transform {
  /** Editor-only document id, e.g. "_seat1". NEVER emitted — see §3.5. */
  id: string
  /** Always {@link IVA_SEAT_LAYER_ID}; present for parity with the other layered entities. */
  layerId: string
}

/** Id of the built-in "IVA Seats" layer. Cannot be deleted. */
export const IVA_SEAT_LAYER_ID = 'ivaSeats'

export function createIvaSeatLayer(): Layer {
  return { id: IVA_SEAT_LAYER_ID, name: 'IVA Seats' }
}

export const BUILT_IN_LAYER_IDS: readonly string[] = [
  DEFAULT_LAYER_ID,
  CONNECTOR_LAYER_ID,
  COLLIDER_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
]
```

`EditingPart` gains **two** keys — the seat list, and the `<Internal>` flag store Phase 0 needs:

```ts
export interface EditingPart {
  …
  /** The Part's IVA camera vantage points, in cycle order (index 0 is the default seat). */
  ivaSeats: IvaSeat[]
  /**
   * Per-SubPart-template `<Internal>` (interior-only) flag, keyed by `subPartTemplateId`.
   * ABSENT ⇒ inherit the template's own value: a built-in's catalogued `<Internal>`
   * (`CatalogSubPart.internal`), or `false` for a flexo-authored custom mesh.
   *
   * KSA puts `<Internal>` on a `<SubPart>`'s `<PartModel>`, so it is a TEMPLATE property, not a
   * per-placement one — setting it affects every placement of that template (same rule as a
   * SubPart-owned {@link PartCollider}). See docs/iva-seats.md.
   */
  internalFlags: Record<string, boolean>
}
```

`createEmptyPart()` gains `ivaSeats: []`, `internalFlags: {}` and the fifth
built-in layer. Adding a key to `EditingPart` trips the sanctioned boot purge
(`snapshotMatchesModel` → `hasAllKeys`, `projectStore.ts`) — per AGENTS.md, **no migration**: old
snapshots are discarded, not converted.

### 3.2 rotation ⇄ (ForwardAxis, UpAxis) — the one piece of new math

New pure module **`src/ksa/ivaSeatAxes.ts`**, the single place that knows the mapping. It follows the
`src/ksa/colliderFit.ts` precedent: hand-rolled quaternion/matrix math, **no three.js import**, and a
test that locks it bit-for-bit against `src/three/coords.ts` so the `EULER_ORDER` calibration knob
stays singular.

> The code in this section is **verified working**, not pseudocode — it was run against three.js
> 0.185 during planning and agrees with `coords.ts` to machine epsilon on every case listed below.
> Transcribe it as written; the column assignment in `seatRotationFromAxes` is the one thing here
> that is easy to get subtly wrong and impossible to notice on single-axis rotations.

**The convention.** The seat's local axes are chosen to equal KSA's schema defaults, so an
un-rotated seat is byte-identical to Core's authoring, and so "facing = local +X" matches what flexo
already draws for connectors:

```ts
/** A seat's local FORWARD axis. Matches `IVASeatTemplate.ForwardAxisAsmb`'s default. */
export const SEAT_LOCAL_FORWARD: Readonly<Vec3> = { x: 1, y: 0, z: 0 }
/** A seat's local UP axis. Matches `IVASeatTemplate.UpAxisAsmb`'s default. */
export const SEAT_LOCAL_UP: Readonly<Vec3> = { x: 0, y: 0, z: -1 }
```

**Forward direction (export).** Build KSA's quaternion from the stored Euler triple, then rotate the
two local axes. `ksaQuatFromEulerXyz` is a verbatim port of
`QuaternionEx.CreateFromXyzRadians` (`decomp/KSA/QuaternionEx.cs:195-208`) — the identical formula
already sitting in `src/three/coords.test.ts:19-32` as the ground truth:

```ts
/** Verbatim port of KSA's `QuaternionEx.CreateFromXyzRadians` → `[x, y, z, w]`. */
export function ksaQuatFromEulerXyz(r: EulerXYZ): Quat {
  const c1 = Math.cos(r.x / 2), c2 = Math.cos(r.y / 2), c3 = Math.cos(r.z / 2)
  const s1 = Math.sin(r.x / 2), s2 = Math.sin(r.y / 2), s3 = Math.sin(r.z / 2)
  return [
    -c1 * s2 * s3 + c2 * c3 * s1,
    c1 * c3 * s2 + s1 * c2 * s3,
    c1 * c2 * s3 - s1 * c3 * s2,
    c1 * c2 * c3 + s1 * s2 * s3,
  ]
}

/** The seat's `<ForwardAxis>` + `<UpAxis>` for a stored rotation. Both come out UNIT length. */
export function seatAxesFromRotation(rotation: EulerXYZ): { forward: Vec3; up: Vec3 } {
  const q = ksaQuatFromEulerXyz(rotation)
  return { forward: rotate(SEAT_LOCAL_FORWARD, q), up: rotate(SEAT_LOCAL_UP, q) }
}
```

(`rotate(v, q)` is the standard 8-line quaternion-rotate already present as a private helper in
`colliderFit.ts:35-46`; duplicate it here rather than widening that module's API.)

**Inverse direction (import).** Orthonormalise the authored pair exactly as
`Camera.LookAtRotation` does, assemble the rotation basis, and read the Euler triple straight off
the matrix — no intermediate quaternion, so there is nothing subtle to get wrong:

```ts
/**
 * The stored rotation for an authored (`<ForwardAxis>`, `<UpAxis>`) pair, or `null` when the
 * pair is degenerate (either vector ~zero, or the two parallel — KSA NaNs the camera on both,
 * see scope/connectors-coordinates-iva.md).
 *
 * Orthonormalises the way `Camera.LookAtRotation` (`decomp/KSA/Camera.cs:190-196`) does, so a
 * sloppy non-perpendicular `<UpAxis>` round-trips to its orthogonalised equivalent: TEXTUALLY
 * different, SEMANTICALLY identical (the game derives the same camera frame either way).
 */
export function seatRotationFromAxes(forward: Vec3, up: Vec3): EulerXYZ | null {
  const f = normalizeOrNull(forward)          // KSA: double3.Normalize(forwardEcl)
  if (!f) return null
  const r = normalizeOrNull(cross(f, up))     // KSA: Cross(f, up).Normalized()  ← NaN if parallel
  if (!r) return null
  const u = normalizeOrNull(cross(r, f))      // KSA: Cross(r, f).Normalized()
  if (!u) return null

  // Basis COLUMNS are the images of the seat's local axes:
  //   local +X → f          (SEAT_LOCAL_FORWARD)
  //   local +Y → r          (because SEAT_LOCAL_FORWARD × SEAT_LOCAL_UP === +Y)
  //   local +Z → -u         (because SEAT_LOCAL_UP === local -Z)
  // Element names below are three.js Matrix4's m<row><col>. Only these six are needed —
  // the 'ZYX' extraction never touches m13/m23 (which would be -u.x / -u.y).
  const m11 = f.x, m21 = f.y, m31 = f.z
  const m12 = r.x, m22 = r.y, m32 = r.z
  const m33 = -u.z

  // three.js Euler.setFromRotationMatrix(m, 'ZYX') — the SAME order coords.ts calibrates to
  // (EULER_ORDER = 'ZYX' ≡ KSA's "XYZ"; see docs/coordinates.md).
  const y = Math.asin(-Math.min(1, Math.max(-1, m31)))
  if (Math.abs(m31) < 0.9999999) {
    return { x: Math.atan2(m32, m33), y, z: Math.atan2(m21, m11) }
  }
  return { x: 0, y, z: Math.atan2(-m12, m22) }
}
```

**Sanity anchor (make this the first test).** `forward = (1,0,0)`, `up = (0,0,-1)` ⇒
`r = f × u = (0,1,0)`, `u' = r × f = (0,0,-1)`, basis `= I` ⇒ `rotation = (0,0,0)`. And
`seatAxesFromRotation({0,0,0})` ⇒ `forward (1,0,0)`, `up (0,0,-1)`. Core's XML is a fixed point.

**Tests (`src/ksa/ivaSeatAxes.test.ts`)** — importing three.js in a *test* is fine (`coords.test.ts`
does). **All eight groups below were run against the code in this section before the plan was
written; the numbers quoted are measured, not guessed:**

- The fixed point above, exactly (`< 1e-12` per component, both directions).
- **Cross-check against `coords.ts`** — the guard that keeps the `EULER_ORDER` knob singular: for
  each case, `applyPlacement(obj, { rotation: r, … })` then
  `new THREE.Vector3(1,0,0).applyQuaternion(obj.quaternion)` must equal
  `seatAxesFromRotation(r).forward`, and `(0,0,-1)` vs `.up`. **Measured agreement: ≤ 4.5e-16 per
  component** (machine epsilon) — assert `< 1e-12`.
- Round-trip `seatRotationFromAxes(seatAxesFromRotation(r))` ≡ `r` over the multi-axis cases
  `coords.test.ts:41-47` uses, plus `(-1.9, 0.2, -2.4)`. Compare **as quaternions** (Euler triples
  are not unique) and assert `q.angleTo(qExpected) < 1e-6`.
  ⚠️ **Do not tighten that tolerance.** `THREE.Quaternion.angleTo` is `2·acos(|dot|)`, and `acos`
  near 1 has a `sqrt`-conditioned floor of ~3e-8 — a dot of `0.9999999999999998` (2 ULP off) reports
  **4.2e-8 rad**. Measured: the recovered Euler triple is within 1.2e-15 of the original, yet
  `angleTo` reads 4.2e-8. `1e-6` is exactly what `coords.test.ts:53` already uses; anything like
  `toBeCloseTo(0, 10)` will fail for numerically perfect input.
- The **gimbal branch** (`|m31| ≥ 0.9999999`, i.e. forward along ±Z): `seatRotationFromAxes((0,0,±1),
  (0,1,0))` then `seatAxesFromRotation` must return the same forward (measured: < 1e-9).
- Degenerate inputs return `null`: `forward = (0,0,0)`; `up = (0,0,0)`; `up = 2·forward`;
  `up = -forward`.
- A non-perpendicular pair (`forward (1,0,0)`, `up (0.3,0,-1)`) produces the same rotation as its
  orthogonalised equivalent (measured: identical).
- Both of Core's seats (§1.7) are identity rotation.

### 3.3 3D representation

New **`src/three/IvaSeatObject.ts`**, modelled on `ConnectorObject.ts` (which is the right size and
shape of file to copy):

- A `THREE.Group` carrying `userData.selectable = { kind: 'ivaSeat', id }` on the group **and on
  every child mesh** (`ConnectorObject.ts:30/39/52` does exactly this — the raycast hits the mesh).
- Geometry, all sized off `$ivaSeatSettings.markerSize` (default **0.12 m**, mirroring
  `$connectorSettings.size = 0.125`):
  - an **eye sphere** at the origin (`SphereGeometry(size/2)`) — the vantage point and the click
    target;
  - a **forward cone** along local **+X** (`ConeGeometry(size/2, size*2)`, `rotation.z = -π/2`,
    `position.x = size/2 + length/2`) — identical construction to the connector arrow, so the two
    read consistently;
  - a short **up stick** along local **−Z** (`CylinderGeometry(size/10, size/10, size*1.2)`,
    `rotation.x = π/2`, `position.z = -(size*0.6)`) in a contrasting colour, so **roll is visible**
    (without it a seat rolled 90° looks identical to an unrolled one);
  - optional **gaze cone** (`$ivaSeatSettings.showGazeCone`, default off): a translucent
    `ConeGeometry` of half-angle 45°, 1 m long, along +X. Purely indicative — the *real* limit is a
    90° hemisphere, which is a half-space and unreadable as a shape; the exact limits are enforced in
    the seat preview (§3.6) and stated in the inspector.
- Colours: default `0x38bdf8` (sky — distinct from connectors' offwhite `0xf2f0e9` and colliders'
  amber `0xf59e0b`), selected `0x22dd44` (the shared selection green). Up stick default
  `0xfb7185` so it reads against the body.
- `setSeat(seat)` → `applyPlacement(this.group, { ...seat, scale: { x: 1, y: 1, z: 1 } })`. The
  marker never scales with the document; only `markerSize` changes it (rebuild on setting change,
  the way `EditorScene` already rebuilds connectors when `$connectorSettings` changes).
- `setSelected`, `setLayerOpacity` (via `layerOpacity.ts`), `dispose` — copy `ConnectorObject`.
- A `CSS2DObject`-free **index label** is optional; if wanted, reuse the `labelRenderer` the
  `MeasurementLayer` already drives, showing `1`, `2`, … so cycle order is visible in the viewport.
  Nice-to-have, Phase 4.

`EditorScene` integration (mirror the connector paths, which are the simple single-visual case —
**not** the collider paths, which are per-placement arrays):

| Site (`src/three/EditorScene.ts`)                             | Change                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| new field                                                     | `private readonly seatObjects = new Map<string, IvaSeatObject>()`          |
| `reconcile(part)` (`:522` area)                               | call `this.reconcileIvaSeats(part)` next to `reconcileColliders(part)`     |
| new `reconcileIvaSeats(part)`                                 | add/remove/update by id, exactly like `reconcileConnectors`                |
| click-select branch (`:256` area)                             | `else if (selected.kind === 'ivaSeat') { … }` — copy the connector branch (layer visible/unlocked check, additive `toggleEntity('ivaSeat', i)` + `revealEntity`, else `selectIvaSeat(i)`) |
| selected-object collection + gizmo attach (`:680`, `:720` area) | include seat groups so the gizmo can move them                           |
| `this.sub($selectedIvaSeatIndices, …)`                        | selection repaint + the container-clear side effect, like the other kinds |
| `$ivaSeatSettings` subscription                               | rebuild markers on a size/gaze-cone change                                |

### 3.4 Selection, gizmo, inspector — the exhaustive touch list

Extend the existing four-kind machinery to five. **Colliders are the template — copy that shape
exactly.** `setSelection`'s extra parameter is defaulted, so only the sites that actually carry seats
change.

| File                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/three/SelectionManager.ts:5` | `kind: 'subpart' \| 'connector' \| 'collider' \| 'ivaSeat' \| 'kitten'`                                                                                                                                                                                                                                                                                                                                                                        |
| `src/state/editorStore.ts:1504`   | `SelectableKind` gains `\| 'ivaSeat'`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `editorStore.ts:151` area         | new `$selectedIvaSeatIndices` atom + `$selectedIvaSeatIndex` computed (copy the collider pair)                                                                                                                                                                                                                                                                                                                                                 |
| `editorStore.ts:334` area         | clamp `$selectedIvaSeatIndices` when the document shrinks (the existing `clampedKit` block)                                                                                                                                                                                                                                                                                                                                                    |
| `editorStore.ts:169`/`:580`       | `PartClipboard.ivaSeats: IvaSeat[]`; the merge-into-target struct gains `ivaSeats`                                                                                                                                                                                                                                                                                                                                                             |
| `editorStore.ts:706` area         | `mergePart`-style import: append with fresh ids on `IVA_SEAT_LAYER_ID` (copy the collider block at `:708-714`)                                                                                                                                                                                                                                                                                                                                 |
| new actions                       | `addIvaSeat(transform?)`, `selectIvaSeat`, `setSelectedIvaSeats`, `updateIvaSeatTransform`, `updateIvaSeatTransforms`, `removeIvaSeat`, `moveIvaSeat(index, delta)` (**reorder = cycle order**, discrete + undo), `aimIvaSeat(index, rotation)`                                                                                                                                                                                                  |
| `nextIvaSeatId(part)`             | `_seat1`, `_seat2`, … (`/^_seat(\d+)$/`, max + 1) — copy `nextColliderId` (`:1022`)                                                                                                                                                                                                                                                                                                                                                            |
| extend existing                   | `clearSelection`, `setSelection` (`:1523`, 5th defaulted param), `toggleEntity` (`:1540`), `selectedTransformRefs` (`:1579`), `updateSelectedTransforms` (`:1703`), `updateSelectedTransform` (`:1795`), `removeSelected` (`:1073`), `duplicateSelected` (`:1165`), `copySelected`/`pasteClipboard` (`:1263`/`:1299`), `scaleEverything` (`:1762` — scale the seat **position** only, never its rotation or the unused scale), each per-kind setter's mutual-exclusion clear |
| `assignIvaSeat(seat, t)`          | private writer next to `assignCollider` (`:1728`): copies `position` + `rotation`, **pins `scale` to (1,1,1)** so a scale-mode gizmo drag is a no-op                                                                                                                                                                                                                                                                                           |
| `src/state/selectors.ts`          | `$hasSelection` (`:40`), `$hasMultiSelection` (`:50`), `$selectionCount` (`:56`), `$selectedRefs` (`:65`), `SelectedEntity` union + `$selectedEntity` (`:82-100`) gain the seat kind; `LayerSummary`/`$layerSummaries` (`:107-130`) gain `ivaSeats`                                                                                                                                                                                             |
| `src/three/TransformGizmo.ts`     | unchanged (translate + rotate already do everything a seat needs; scale is neutralised by `assignIvaSeat`)                                                                                                                                                                                                                                                                                                                                     |
| `src/ui/AssetsList.tsx`           | `Kind` (`:58`), `PREFIX` (`:81`, `ivaSeat → 'iva'`), `parseKey` (`:88`), a `IVA_SEAT_LAYER_ID` section branch alongside the connector/collider/kitten ones (`:134-198`), `selectedKeys` (`:213`), `onSelectionChange` (`:231-275`), the row-click dispatch (`:462-467`), and exclusion from the move-to-layer target list like the other built-ins. Row `name` = `` `Seat ${i + 1}` ``; row `sub` = the derived forward axis through `formatG6`, e.g. `` `→ 1, 0, 0` ``, with `' · default'` appended on index 0. Search should match the seat id, the row name and `'default'` |
| `src/ui/AddButton.tsx`            | **Add → IVA Seat** (single item, no submenu — there is only one kind). Place it after Collider (`:81-93`)                                                                                                                                                                                                                                                                                                                                      |
| `src/ui/TransformInspector.tsx`   | new `IvaSeatHeader` (mirror `ColliderHeader`, `:461`); **hide the third numeric group entirely** for a seat (no size/scale) and relabel nothing else                                                                                                                                                                                                                                                                                            |
| hotkeys                           | nothing new — seats participate in nudge/rotate/duplicate/delete for free once they are in `selectedTransformRefs`                                                                                                                                                                                                                                                                                                                             |

**`IvaSeatHeader` contents** (this is where the game contract becomes visible to the user):

1. `Seat N of M` + a **default-seat badge** on index 0 ("IVA opens here"), with ▲/▼ buttons calling
   `moveIvaSeat` — order is authored data (§1.4).
2. A read-only **axis readout** of the derived vectors, from `seatAxesFromRotation`:
   `Forward (1, 0, 0) · Up (0, 0, −1)`. This is what actually ships in the XML, so show it.
3. **Aim presets** — a `Select`/button row writing `rotation` via `seatRotationFromAxes`:
   `+X (nose)`, `−X (tail)`, `+Y`, `−Y`, `+Z`, `−Z`, each keeping the current up axis where it stays
   non-parallel, otherwise falling back to a perpendicular default. Plus **"Aim at selection"**:
   forward = normalize(centroid of the selected placements − seat position) — an intent published to
   `EditorScene` the way `$colliderFitRequest` is (`src/state/colliderStore.ts:20-47`), because it
   needs world geometry.
4. A **"Sit in this seat"** button → `enterSeatView(seat.id)` (§3.6).
5. Inline notes, only when they apply: the 90° hemisphere limit; "no `<Internal>` geometry in this
   part — a seat here looks out at space" (§3.7/§3.8).

### 3.5 XML emission and parsing

**Emission** — one `<IVASeat>` per seat, appended to `<PartGameData>` in document order, before the
passthrough, in `serializeGameData` (`src/ksa/partXmlSerializer.ts:133`), next to the part-level
collider block (`:271-273`):

```ts
/**
 * `<IVASeat><Position/><ForwardAxis/><UpAxis/></IVASeat>` — one IVA vantage point.
 *
 * NO `Id` attribute: Core authors none, nothing references a seat by id, and
 * `TemplateDataBase.Id` shares the namespace `<FeedsFrom Container="…">` resolves against
 * (`PartTemplate.AddResolvedFeed`) — so emitting flexo's editor-only id would put a seat into
 * the feed-container namespace for zero benefit.
 *
 * All three axes of all three elements are ALWAYS emitted. A `Vector3Reference` defaults each
 * absent ATTRIBUTE to 0 while an absent ELEMENT takes the C# field default, so an "omit at
 * default" style could turn `<ForwardAxis X="1"/>` into `<ForwardAxis/>` — a zero look
 * direction, which NaNs the in-game camera.
 */
function buildIvaSeatElement(doc: XmlDocument, seat: IvaSeat): XmlElement {
  const el = doc.createElement('IVASeat')
  const { forward, up } = seatAxesFromRotation(seat.rotation)
  el.appendChild(buildVec3Attrs(doc, 'Position', seat.position))
  el.appendChild(buildVec3Attrs(doc, 'ForwardAxis', forward))
  el.appendChild(buildVec3Attrs(doc, 'UpAxis', up))
  return el
}
```

`buildVec3Attrs` is the existing private `buildColliderVec3` (`partXmlSerializer.ts:392-398`) —
**rename it** now that a second builder uses it; it already writes all three axes through
`formatG6`. `seatAxesFromRotation` always returns unit vectors, satisfying gotcha 3.

The geometry `<Part>` document (`serializePart`) is untouched — everything normalises into
`<PartGameData>` (§1.1).

**Parsing** — a shared reader used at both Part-level authoring sites:

```ts
/**
 * Reads every `<IVASeat>` of an owner element (`<Part>` or `<PartGameData>`) into
 * {@link IvaSeat}s, preserving DOCUMENT ORDER (which is KSA's seat cycle order).
 *
 * Degenerate pairs are DROPPED with a console warning rather than imported: KSA builds a NaN
 * camera rotation from them (`Camera.LookAtRotation` → `Cross(f, up).Normalized()`), so
 * round-tripping one would only preserve a broken seat.
 */
export function ivaSeatsFromElement(owner: Element): IvaSeat[] {
  const out: IvaSeat[] = []
  for (const el of directChildren(owner, 'IVASeat')) {
    // Element ABSENT ⇒ the C# field default. Element PRESENT ⇒ each missing attribute is 0.
    const fwdEl = directChildren(el, 'ForwardAxis')[0]
    const upEl = directChildren(el, 'UpAxis')[0]
    const forward = fwdEl ? readVec3Attrs(fwdEl, ZERO_VEC3) : { ...SEAT_LOCAL_FORWARD }
    const up = upEl ? readVec3Attrs(upEl, ZERO_VEC3) : { ...SEAT_LOCAL_UP }
    const rotation = seatRotationFromAxes(forward, up)
    if (!rotation) {
      console.warn(
        `flexo import: dropping an <IVASeat> whose <ForwardAxis>/<UpAxis> are zero or parallel — ` +
          `KSA would build a NaN camera rotation from it.`,
      )
      continue
    }
    out.push({
      id: `_seat${out.length + 1}`,
      position: readVec3Attrs(directChildren(el, 'Position')[0], ZERO_VEC3),
      rotation,
      scale: { x: 1, y: 1, z: 1 },
      layerId: IVA_SEAT_LAYER_ID,
    })
  }
  return out
}
```

Wired in at:

| Site                            | File                                                             | Note                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<PartGameData><IVASeat>`       | `partXmlParser.parseGameDataElement` (`:482`) → `ParsedGameData.ivaSeats` | add `'IVASeat'` to `KNOWN_PART_GAMEDATA_CHILDREN` (`:783-809`) **in the same change**, else it double-emits (once typed, once as passthrough)              |
| geometry `<Part><IVASeat>`      | `partCatalog.parsePartsFile` (`:125-128` area) → `CatalogPart.ivaSeats` | equivalent authoring site (§1.1); 3 lines, closes the same class of gap `<Collider>` had. No double-emit risk (geometry-`<Part>` children are never passthrough) |
| `<SubPartGameData><IVASeat>`    | — **deliberately not read**                                      | `'IVASeat'` stays OUT of `KNOWN_SUBPART_GAMEDATA_CHILDREN` (`:811-822`), so a SubPart-level seat keeps riding the passthrough verbatim (§6)                       |

`ParsedGameData` gains `ivaSeats: IvaSeat[]` (alongside `colliders`, `:286`); `gameDataFromAssets`
(`:736`) fills it; `partCatalog` merges the two Part-level sources and re-numbers `_seatN` in
document order. `partImport.importBuiltInPart` adds `ivaSeats: part.ivaSeats` to its cloned GameData
payload (`:102` area), and `editorStore`'s import path appends them with fresh ids.

**Ids are regenerated on import/paste and never emitted**, so nothing needs an `idRemap` entry — say
so explicitly in a code comment, the way the collider parser does (`partXmlParser.ts:190-196`), so
the next reader does not go looking.

**Codec** (`src/state/projectCodec.ts`):

```ts
/** An IVA seat. `scale` is unused, so the shared CTransform encoder always omits it. */
interface CIvaSeat extends CTransform {
  i: string // id
}
```

`CompactProject` gains `iv?: CIvaSeat[]` (`:1280` area); encode at `:1301`, decode at `:1326`;
`layerId` is always `IVA_SEAT_LAYER_ID` and is restored on decode, never serialized (copy
`encCollider`/`decCollider`, `:233-250`). **`PROJECT_EXPORT_VERSION` bumps once for both halves of
this plan** — if Phase 0 and Phase 1 ship together, one bump to `7` with the comment line (`:74`
area) `// v7: IVA seats (iv) + the per-template <Internal> flag (ifl).`; if Phase 0 ships first it
takes `7` and Phase 1 takes `8`. Older payloads are rejected, never converted.

`src/state/projectTransfer.ts`: `ivaSeats` on the export data (`:74`), the export builder (`:166`),
the decode (`:235`), the built-in-layer top-up (`:252`), the additive-paste merge with fresh ids
(`:359-372` pattern), the summary counts (`:107`, `:485`), and a `nextIvaSeatId` (`:626` pattern).

### 3.6 Seat view — "sit in it" (the practical half)

**The game has no editor-side IVA preview** (gotcha 8), so this is the feature that makes authoring
possible instead of guesswork: sit at a seat, look around under **exactly the game's clamps**, and
see whether the window is where you thought and whether your head is inside a wall.

Pure clamp module **`src/ksa/ivaLook.ts`** — a verbatim port of `IVAController.OnFrame:69-112`:

```ts
/** KSA's up-pole exclusion threshold: `|dot(look, UpAxisAsmb)| > 0.9` (`IVAController.cs:97`). */
export const IVA_UP_DOT_LIMIT = 0.9

/**
 * Clamps a candidate look direction the way the in-game IVA camera does, every frame:
 *  1. never more than 90° from `forward` (compared against the NORMALIZED forward axis);
 *  2. never closer than `acos(0.9) ≈ 25.84°` to `up` — compared against the **RAW** up axis,
 *     magnitude included, which is exactly why a non-unit `<UpAxis>` changes the usable pitch
 *     (see scope/connectors-coordinates-iva.md gotcha 3).
 * Returns a unit vector.
 */
export function clampSeatLook(look: Vec3, forward: Vec3, up: Vec3): Vec3
```

Tests: 120° off forward comes back at exactly 90°; 10° from up comes back at 25.84°; with
`|up| = 2` the up clamp engages at `acos(0.45) ≈ 63.26°`; an already-legal direction is returned
unchanged.

Ephemeral state **`src/state/ivaStore.ts`**:

```ts
/** The seat currently being previewed from, or null. Ephemeral: never persisted, never in undo. */
export const $seatView = atom<string | null>(null)          // seat id
/** Free-look offset while in seat view (radians). Reset on enter. */
export const $seatLook = atom<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 })
export function enterSeatView(seatId: string): void
export function exitSeatView(): void
```

`src/three/Viewport.ts` gains a seat-view mode (it already owns the camera, `OrbitControls`, and a
`readCameraState`/`restoreCamera` pair at `:188-210` built for exactly this kind of swap):

- `enterSeatView(pose)`: snapshot `readCameraState()`, `this.controls.enabled = false`, install
  pointerdown/move/up handlers on `renderer.domElement` that accumulate yaw/pitch into `$seatLook`,
  and set `camera.fov = 50` (already the default).
- Per frame (or on change — the renderer is on-demand, so `invalidate()` after each update): compose
  the look direction from the seat's forward/up and the accumulated yaw/pitch, run it through
  `clampSeatLook`, then `camera.position.set(seat.position)`, `camera.up.set(up)`,
  `camera.lookAt(position + look)`.
- `exitSeatView()`: `restoreCamera(snapshot)`, `controls.enabled = true`, remove the handlers.
- Suppress the gizmo, `SelectionManager` clicks and the seat markers themselves while in seat view
  (you are inside the marker; it would fill the screen).

UI: a **floating "Seat 1 / 2 …" bar** while in seat view (reuse `FloatingPreviewToolbar.tsx`'s
shape) with prev/next seat, "Exit" and an `Escape` binding; entered from `IvaSeatHeader`'s
"Sit in this seat" and from the Assets-list row menu.

**Deliberately not modelled in the preview:** KSA's mouse smoothing and `LookSensitivity` (cosmetic),
and the exterior/interior render gate — flexo renders every SubPart normally, so the preview shows
the interior *and* the hull. That is more informative than the game view, but say it in the docs.

### 3.7 `<Internal>` becomes plain user data — delete "de-IVA" (Phase 0, standalone)

"De-IVA" is not a concept KSA has. It is one boolean on one element, and flexo currently hard-codes
one value for it. **Replace the whole mechanism with the flag itself**, editable in bulk from the
SubPart list. Net effect: less code, no new export setting, no `_NotIVA` special case, and the user
decides.

**Resolution rule — the one function everything routes through** (new, in `src/ksa/modExport.ts` or
a small `src/ksa/internalFlag.ts`; keep it pure):

```ts
/**
 * The `<Internal>` value a SubPart template exports with: the user's explicit flag if the
 * document carries one, else the template's own value (a built-in's catalogued `<Internal>`,
 * `false` for a flexo custom mesh).
 */
export function resolveInternal(
  part: EditingPart,
  templateId: string,
  entry: CatalogSubPart | undefined,
): boolean {
  return part.internalFlags[templateId] ?? entry?.internal ?? false
}
```

**Export (`buildExportVariantMap`, `src/ksa/modExport.ts:198-229`).** A built-in template needs a
redeclared variant only when flexo must change something about it — which is now *either* SubPart
GameData *or* an `<Internal>` value that differs from the built-in's own:

```ts
const wantInternal = resolveInternal(part, templateId, entry)
const internalDiffers = wantInternal !== (entry.internal ?? false)
if (!internalDiffers && !hasSubPartGameData(part, templateId)) continue
out.set(templateId, {
  originalId: templateId,
  // The `_NotIVA` suffix is DELETED — one naming rule for every variant.
  variantId: `flexo_${base}_${templateId}`,
  meshId: entry.meshNodeName,
  materialId: entry.materialId ?? null,
  colliders: entry.colliders ?? [],
  internal: wantInternal,
  rayTracing: entry.rayTracing ?? null,
})
```

Three things fall out, all improvements:

- **The common cases now emit no variant at all.** Leave an interior prop interior (building a real
  IVA space) → the placement references the built-in id directly and keeps its own `<Internal>` +
  `<RayTracing>` for free. Today every such prop is redeclared.
- **`ExportVariant` gains `internal: boolean` and `rayTracing: string | null`**, and
  `ReferenceSubPartPlan` (`src/ksa/assetsXmlSerializer.ts:102` area) gains the same two, emitting
  `<Internal>true</Internal>` when set and `<RayTracing>{mode}</RayTracing>` when non-null. The
  reference-SubPart comment at `:171-175` frames the whole path as "de-IVA"; it now serves both
  directions — rewrite the prose, keep the fresh-`<PartModel Id>` rule it documents, which is
  unchanged and still load-bearing.
- 🐛 **Carrying `<RayTracing>` forward fixes a latent bug.** The variant drops it today, so a
  redeclared `ShadowProxy` mesh (Core's `CoreIVASpaceA_Subpart_MediumCapsuleARayBlocker` is
  catalogued and placeable) turns from an invisible ray occluder into a **visible** mesh. Requires
  capturing it: `catalog.ts:199` area gains
  `rayTracing: firstChildByTag(partModel, 'RayTracing')?.textContent?.trim() || undefined` and
  `CatalogSubPart.rayTracing?: string` (kept as the raw token — flexo never interprets it, it only
  copies it; `PartModelModule.RaytracingMode` values are `Disabled`/`Enabled`/`ShadowProxy`).

**Custom meshes need no variant** — `assetsXmlSerializer` already declares them, so it just emits
`<Internal>true</Internal>` inside their `<PartModel>` when `resolveInternal` says so.

**Glass is excluded, hard.** A mesh that exports through `<PartModelGlass>` (a `kitten.transparent`
visor with `surface` ∈ {`glass`, `glassGlow`}, or an `imported.transparent` mesh) has no `<Internal>`
field in KSA at all (§1.5). The toggle is **disabled** for those with a tooltip saying so, and
`resolveInternal`'s result is ignored on that path. (For a `glassGlow` mesh — which expands to a
glass shell + an opaque emissive layer via `modExport.expandGlassGlow` — treat the whole mesh as
glass and disable the toggle; marking only half of a layered surface interior-only is worse than not
offering it.)

**Store action** (`src/state/editorStore.ts`), discrete, one undo entry:

```ts
/**
 * Discrete: sets the `<Internal>` (interior-only) flag on the DISTINCT SubPart templates of the
 * given placements. KSA's `<Internal>` lives on the template's `<PartModel>`, so this affects
 * every placement of each template — the UI says so.
 *
 * Templates whose geometry exports as `<PartModelGlass>` are skipped (KSA glass has no such
 * field); the caller filters them out so the menu can disable them, and this is the backstop.
 */
export function setPlacementsInternal(indices: readonly number[], internal: boolean): void
```

It writes the explicit boolean unconditionally (no "delete the key when it matches the inherited
value" — that would need the catalog inside `editorStore`, which imports no catalog today). Writing a
redundant `true` costs nothing: the `internalDiffers` test above collapses it to zero XML change.

**UI — the bulk operation the user drives it with:**

| Site                                                                | Change                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/ui/AssetsList.tsx` → `SubPartRowMenu` (`:376-452`)             | A **`Interior (IVA only) ▸ On / Off`** submenu, between `SubPart Data` and `Change Layer`. It is the **one** item in this menu that acts on the multi-selection: **if this row is part of the current SubPart selection, apply to all of it, else to this row alone** — label the submenu `Interior (IVA only) — 4 selected` in the bulk case so it is never ambiguous. Update the component docstring, which currently promises every item is per-row. Right-click already routes here (`:336-341`), so this satisfies "right-click menu option in the subpart list" with no new plumbing. |
| `src/ui/AssetsList.tsx` row `sub`                                   | append `' · interior'` to a subpart row whose resolved flag is true — the flag must be **visible**, since it now defaults to the game's value instead of being normalised away. Needs `$catalogIndex` from `catalogStore` (a normal UI import; `ExportButton`/`SubPartBrowser` already do it). Also make `'interior'` a search term. |
| `src/ui/MultiSelectToolbar.tsx` (`:19-35`)                          | the same On/Off menu next to `ChangeLayerButton`, for discoverability when a big selection is live                                                                                                                                                                                                            |
| `src/ui/SubPartBrowser.tsx`                                         | badge catalog entries with `internal` so a user knows an IVA prop is interior-only **before** placing it                                                                                                                                                                                                     |
| `src/ui/ExportButton.tsx`                                           | the two new warns in §3.8                                                                                                                                                                                                                                                                                    |

**Codec / transfer.** `CompactProject` gains `ifl?: Record<string, boolean>` (omitted when empty);
`projectTransfer` merges the map on paste (incoming keys win only for templates the paste actually
brings in, so a paste can't silently re-flag an existing template).

**⚠️ Behaviour change to call out in the release note and `docs/importing-models.md`.** Placing a
Core IVA prop and exporting used to make it visible everywhere; now it stays interior-only (what the
game's own data says) until the user flips it. That is the point of the change — it is discoverable
via the row badge, the browser badge and the export warn, and it is one menu click to restore the old
behaviour for a whole selection.

### 3.8 Validation

New pure **`src/ksa/ivaSeatValidation.ts`**, same shape as `colliderValidation.ts` (`:21-37`,
`hasBlockingIvaSeatIssue` mirroring `:151`) so `ExportButton` can render it with the existing
block/warn treatment (`src/ui/ExportButton.tsx:91` — add
`...validateIvaSeats(part, catalog)` to the issues array).

| Severity  | Rule                                                                                                       | Why (source)                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **block** | a seat's derived forward/up is non-finite (a corrupted payload; `seatAxesFromRotation` returned NaN)        | KSA builds a NaN camera rotation (`Camera.LookAtRotation`)                                                                                 |
| **block** | two seats at the identical `<Position>` **and** orientation                                                | not fatal in-game, but `C` appears to do nothing — almost certainly a duplicate the author forgot to move. (Downgrade to `warn` if that proves annoying in practice.) |
| warn      | the part has seats but **no interior geometry** — no placed template whose `resolveInternal` is true         | the seat looks out through the back-face-culled hull at space (§1.5). Names the `Interior (IVA only)` menu action in the message           |
| warn      | the part has **interior geometry but no seats**                                                             | `<Internal>` hides it outside IVA and with no seat the mode is never offered ⇒ **invisible in every camera mode** unless another part in the vehicle supplies a seat (§1.4, gotcha 6b). This is the check that replaces the old auto-de-IVA's implicit safety net |
| warn      | a template flagged interior exports through `<PartModelGlass>`                                              | KSA glass has no `<Internal>`; the flag is silently ignored (§3.7). Should be unreachable through the UI — this is the backstop            |
| warn      | a seat sits **outside every collider** the part declares (and the part declares at least one)               | the eye point is outside the collision volume — usually means the seat is outside the hull. Uses the existing pure `pointInCollider` (`src/measure/colliderCoverage.ts:81`) with the seat quaternion from `ksaQuatFromEulerXyz`. (`src/measure/` is a framework-free sibling of `src/ksa/` and only imports *types* back from it, so there is no runtime cycle.) |
| warn      | more than 8 seats                                                                                           | every extra seat is one more `C` press to cycle past; almost certainly a mistake                                                           |
| warn      | a seat's `<Position>` is exactly `(0,0,0)`                                                                  | the default — the author probably never moved it                                                                                           |

The **non-unit-axis** and **parallel-axis** cases cannot reach validation: the parser drops them on
import and the editor can only produce unit, orthogonal axes by construction (`rotation` is the
source of truth). Say that in the module docstring so nobody adds a dead rule.

---

## 4. Phases

Each phase is independently shippable and independently verifiable. **Phase 0 has no dependency on
the rest** — it is a standalone refactor that removes a concept, and it can land, ship and be
reviewed on its own.

### Phase 0 — `<Internal>` as user data; delete "de-IVA" (standalone)

1. `src/ksa/types.ts` — `EditingPart.internalFlags`, `createEmptyPart`.
2. `src/ksa/catalog.ts` — capture `CatalogSubPart.rayTracing`; rewrite the `internal` docstring
   (`:31-35`) to describe the flag, not the vanished de-IVA behaviour.
3. `resolveInternal` (pure) + `ExportVariant.internal`/`.rayTracing` +
   `buildExportVariantMap`'s new gate, **`_NotIVA` deleted** (`src/ksa/modExport.ts`).
4. `src/ksa/assetsXmlSerializer.ts` — `ReferenceSubPartPlan.internal`/`.rayTracing`, emit both;
   custom-mesh `<PartModel>` emits `<Internal>` from `resolveInternal`; rewrite the `:171-175`
   comment.
5. `src/state/editorStore.ts` — `setPlacementsInternal`.
6. UI: the `SubPartRowMenu` submenu, the `MultiSelectToolbar` menu, the row badge, the
   `SubPartBrowser` badge (§3.7).
7. `src/state/projectCodec.ts` (`ifl`) + `projectTransfer` merge. **This is the version bump** —
   land it as v7 here and let Phase 1 add `iv` to the same version if the two ship together;
   otherwise Phase 1 bumps to v8.
8. Docs/scope for this half (§5).

**Tests**

- `modExport.test.ts` — an untouched placed Internal prop produces **no variant** (was: a `_NotIVA`
  variant); flagging it exterior produces `flexo_<base>_<id>` with no `<Internal>`; flagging a custom
  mesh interior emits `<Internal>true</Internal>` on its own `<PartModel>` with no variant; a
  variant of a `ShadowProxy` template carries `<RayTracing>ShadowProxy</RayTracing>` forward.
- `assetsXmlSerializer.test.ts` — **update the existing de-IVA test** (`:163-197`), which asserts
  `_NotIVA` ids and the absence of `<Internal>`; it becomes the "exterior override" case.
- `editorStore.test.ts` — `setPlacementsInternal` undo; it collapses duplicate templates across a
  multi-selection into one write; it skips glass meshes.
- `projectCodec.test.ts` — `internalFlags` round-trips and is omitted when empty.

**Verify:** export a project with one Core IVA prop left interior and one flagged exterior; confirm
the first produces no `<SubPart>` redeclaration and the second produces exactly one, non-Internal.
In-game: the interior prop is invisible outside IVA, the exterior one is visible.

### Phase 1 — Seat contract & round-trip (no UI)

The risky part; do it first and alone.

1. `src/ksa/ivaSeatAxes.ts` + `src/ksa/ivaSeatAxes.test.ts` (§3.2). **Land the tests with the module
   — the whole design rests on this conversion.**
2. `src/ksa/types.ts` — `IvaSeat`, `IVA_SEAT_LAYER_ID`, `createIvaSeatLayer`, `BUILT_IN_LAYER_IDS`,
   `EditingPart.ivaSeats`, `createEmptyPart`. Also **remove `<IVASeat>` from the `RawXmlNode`
   docstring's passthrough examples (`:977`)** — it is modeled now.
3. `src/ksa/partXmlParser.ts` — `ivaSeatsFromElement`; wire into `parseGameDataElement`; add
   `'IVASeat'` to `KNOWN_PART_GAMEDATA_CHILDREN` **only**; `ParsedGameData.ivaSeats`.
4. `src/ksa/partXmlSerializer.ts` — rename `buildColliderVec3` → `buildVec3Attrs`, add
   `buildIvaSeatElement` + the emit loop in `serializeGameData`.
5. `src/ksa/partCatalog.ts` — read geometry `<Part><IVASeat>`; merge both Part-level sources onto
   `CatalogPart.ivaSeats` in document order.
6. `src/state/partImport.ts` + `editorStore.addPart`/`applyImportedGameData` — bring an imported
   part's seats into the document with fresh ids on the IVA Seats layer, in order.
7. `src/state/projectCodec.ts` — `CIvaSeat` + `iv`, bump `PROJECT_EXPORT_VERSION` (see §3.5).
8. `src/state/projectTransfer.ts` — merge seats on paste/import with fresh ids.
9. `src/ksa/ivaSeatValidation.ts` (block rules + the no-`<Internal>`-geometry warn) wired into
   `ExportButton`.
10. Docs/scope (§5).

**Tests**

- `partXmlParser.test.ts` — parse Core's two-seat block (§1.7) verbatim → 2 seats, positions exact,
  `rotation` identity on both; assert `unknownChildren` no longer contains `IVASeat`.
- `partXmlSerializer.test.ts` — round-trip: identity rotation emits `<ForwardAxis X="1"/>` and
  `<UpAxis Z="-1"/>`; a rotated seat emits unit axes; **no `Id` attribute is ever emitted**; the
  emitted order matches the array order.
- Element-presence defaults: `<IVASeat><Position X="1"/></IVASeat>` (no axis elements) parses to
  identity rotation; `<IVASeat><ForwardAxis/></IVASeat>` (present, empty) is **dropped with a
  warning**.
- `ivaSeatAxes.test.ts` — the five test groups in §3.2.
- `projectCodec.test.ts` — seats survive encode → decode; the previous version's payload is rejected.
- `editorStore.test.ts` — an undo test for **every** new mutation (the AGENTS.md undo invariant):
  `addIvaSeat`, `removeIvaSeat`, `moveIvaSeat`, `aimIvaSeat`, plus the delete/duplicate/paste paths.
- `ivaSeatValidation.test.ts` — the seats-without-interior and interior-without-seats warns fire on
  the right documents and stay quiet otherwise.

**Verify:** hand-write the §1.7 fixture, export, and diff the `<IVASeat>` blocks against
`Content/Core/CoreIVASpaceAGameData.xml` — they should be semantically identical (attribute order and
`formatG6` spelling may differ).

### Phase 2 — 3D authoring

1. `src/three/IvaSeatObject.ts` (§3.3).
2. Selection/gizmo/store plumbing per §3.4 (every row of that table).
3. `AddButton` item, `TransformInspector`'s `IvaSeatHeader` (id, order + default badge, axis readout,
   aim presets, notes), `AssetsList` section.
4. `$ivaSeatSettings` in `settingsStore` (markerSize, showGazeCone) + a row in the Settings popover
   next to the connector size.
5. "Aim at selection" via an intent atom consumed by `EditorScene` (the `$colliderFitRequest`
   pattern).

**Verify:** project-local Playwright against `/flexo/` (per the browser-verification rule) — add two
seats, drag translate + rotate, reorder them, confirm the exported XML numbers match the inspector's
axis readout, and confirm the marker's forward cone points where the readout says.

### Phase 3 — Seat view

1. `src/ksa/ivaLook.ts` + tests (§3.6).
2. `src/state/ivaStore.ts`, `Viewport` seat-view mode, the floating seat bar, `Escape` to exit.
3. Suppress the gizmo, click-selection and the seat markers while in seat view.

**Verify in-game (the real acceptance test):** build a small pressurised can — a custom interior
mesh (or placed `CoreIVASpaceA_*` SubParts) + one `<IVASeat>` at eye height looking at a window —
export the mod, launch, **Shift+C twice** to reach IVA, then **C** to cycle. Confirm: the mode is
offered at all; the eye lands where flexo showed it; the look limits match the preview; the interior
renders and the exterior does not occlude it; a second seat cycles.

### Phase 4 — Polish / QA

1. The remaining `warn` rules (§3.8), including the seat-outside-the-collision-volume check.
2. Viewport index labels on the markers (`1`, `2`, … via the existing `labelRenderer`).
2b. A **"Hide interior"** view toggle (persisted, in the View menu next to the other visibility
   toggles): hides every mesh whose resolved `<Internal>` is true, so the workspace shows the part
   exactly as the game does *outside* IVA. The natural companion to the Phase 0 flag — flexo renders
   interior meshes normally the rest of the time, which is what you want while authoring one.
3. "Add kitten at this seat" — place a kitten visual aide at the seat position with the seat's yaw,
   so eye height and head clearance can be eyeballed against a real crew member. Be honest in the
   UI that the kitten's origin is not its eye point, so expect to nudge it.

---

## 5. Mandated docs / scope updates (AGENTS.md, non-negotiable)

| File                                                | Change                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`scope/connectors-coordinates-iva.md`**           | The §1 contract, in the doc that already owns IVA: new "Flexo modules" rows (`ivaSeatAxes.ts`, `ivaLook.ts`, `ivaSeatValidation.ts`, `IvaSeatObject.ts`), a game-side anchor row (`IVASeat.cs`, `IVAController.cs`, `Camera.LookAtRotation`, `AttachedInternal.cs`, `Input.cs` bindings), a **`<IVASeat>` contract** subsection (schema + the element-vs-attribute default trap + the two view clamps + document order = cycle order + first seat = default), and the §1.6 gotcha list. **Rewrite the existing "IVA → NotIVA export" subsection (`:56-59`) and its gotchas (`:94-95`)**: the automatic de-IVA is gone, replaced by the per-template `<Internal>` flag (§3.7) — record that `<Internal>` exists ONLY on `<PartModel>` (one `[XmlElement("Internal")]` in the whole decomp), that a variant now also carries `<RayTracing>` forward, and that the fresh-`<PartModel Id>` rule still applies. Bump the baseline-status line. **Also fix the stale symbol names in the Flexo-modules table (`:28`)** — it cites `buildIvaVariantMap`/`IvaVariant`/`ivaRemapFromVariants`, none of which exist; the code has `buildExportVariantMap`/`ExportVariant`/`variantRemap`, and after Phase 0 the row's job is the `<Internal>` flag, not de-IVA. |
| `scope/gamedata-modules.md`                         | `IVASeat` moves from **passthrough** to **MODELED** in the 5018 `Components` element-name list (`:92-96`) and in the round-trip-safety note that currently cites `<IVASeat>` as a passthrough example (`:70`). Note that the SubPart-level variant is deliberately still passthrough.                                                                                                          |
| `scope/FULL_SCOPE.md`                               | The integration-map row (`:159`) is titled **"Connectors, coordinates, IVA/NotIVA"** — rename the IVA half (there is no "NotIVA" concept any more), add `IVASeat.cs`/`IVAController.cs` to its game anchors, and say IVA **seats** are modeled, not just the `<Internal>` render gate.                                                                                                            |
| **`docs/iva-seats.md`** (new)                       | The flexo-internal view: document model, the rotation⇄axes convention and why identity == KSA's defaults, the layer/selection, seat order semantics, the seat-view preview and what it does/doesn't simulate, the interior-geometry requirement, validation, limits.                                                                                                                            |
| `AGENTS.md`                                         | Link the new doc in the documentation list; add an "## IVA seats (interior camera vantage points)" section next to Colliders/Kittens.                                                                                                                                                                                                                                                         |
| `docs/xml-io.md`                                    | The always-emit-all-axes rule and the element-absent-vs-attribute-absent default trap.                                                                                                                                                                                                                                                                                                        |
| `docs/editor-state.md`                              | The 5th selection kind + the new mutators' undo enrolment.                                                                                                                                                                                                                                                                                                                                    |
| `docs/3d-workspace.md`                              | `IvaSeatObject`, the marker anatomy (+X cone / −Z up stick), and the seat-view camera mode.                                                                                                                                                                                                                                                                                                   |
| `docs/layers.md`                                    | The built-in IVA Seats layer.                                                                                                                                                                                                                                                                                                                                                                |
| `docs/coordinates.md`                               | A pointer to `ivaSeatAxes.ts` as a **second** consumer of the `EULER_ORDER` calibration, and to the cross-check test that keeps the two in agreement.                                                                                                                                                                                                                                          |
| `docs/projects.md` / `docs/state-persistence.md`    | The codec version bump (6 → 7) and the new persisted settings.                                                                                                                                                                                                                                                                                                                               |
| `docs/custom-assets.md`                             | A custom mesh can be marked interior-only, and glass cannot.                                                                                                                                                                                                                                                                                                                                 |
| `docs/importing-models.md`                          | The Phase 0 behaviour change: a placed interior prop now stays interior on export (it used to be silently made visible everywhere), and how to flip it for a whole selection.                                                                                                                                                                                                                  |
| **Every remaining mention of "de-IVA" / "NotIVA"**  | The concept is gone, so the prose must go with it. Grep-verified exhaustive list (outside `plans/`): `src/ksa/assetsXmlSerializer.ts:102`, `:110`, `:174`, `:191`; `src/ksa/modExport.ts:196`, `:628`, `:660`; `src/ksa/partXmlSerializer.ts:97`; `src/ksa/catalog.ts:31-35`; `scope/connectors-coordinates-iva.md:1`, `:3`, `:9`, `:28`, `:56-59`, `:95`, `:226`; `scope/FULL_SCOPE.md:159`. Reword each as "export variant" / "the `<Internal>` flag". (`AGENTS.md` has no de-IVA prose today — only the new IVA-seats section above.) |
| `scope/custom-assets-and-mod-export.md`             | The export-variant contract: variants are now minted only for a GameData carrier or an `<Internal>` mismatch, they carry `<Internal>` + `<RayTracing>` forward, and the `_NotIVA` naming is gone.                                                                                                                                                                                              |
| `src/ksa/__fixtures__/`                             | **Add `CoreIVASpaceAGameData.xml`** (31 lines, the only shipped `<IVASeat>` data) so the parser test runs on real game data in open-source CI. Per AGENTS.md: drop a byte-identical copy in, then `cd scripts && bun run sync-fixtures`; the drift test discovers it from the directory.                                                                                                        |

---

## 6. Deliberate limits

- **Part-level seats only.** `<IVASeat>` is schema-legal on a `<SubPart>`/`<SubPartGameData>` too, and
  such a seat would even follow joint animation (gotcha 9) — but Core authors none, the use case is
  vanishing, and it would double the frame math (per-placement visuals + write-back inversion, cf.
  `colliderWorld`/`colliderLocalFromWorld`). `'IVASeat'` stays out of
  `KNOWN_SUBPART_GAMEDATA_CHILDREN`, so a SubPart-level seat on an imported part **round-trips
  verbatim** through the existing passthrough; it just isn't editable.
- **No `AttachedInternal` authoring.** flexo puts seats on its own part (§1.2). An imported part's
  `<AttachedInternal>` is preserved verbatim by the passthrough, but flexo will not follow the
  reference to import the interior part's seats — they belong to a different Part template, which is
  outside flexo's one-part document model.
- **The seat `Id` is not round-tripped.** flexo emits no `Id` (§3.5) and regenerates `_seatN` in
  document order on import. Order is the only identity a seat has in-game, and order is preserved.
- **A non-perpendicular authored `<UpAxis>` is re-orthogonalised on round-trip** — textually lossy,
  semantically lossless (KSA orthonormalises identically at runtime, §1.3).
- **The preview is not the game view.** flexo renders every SubPart regardless of `<Internal>`, so
  seat view shows the interior *and* the hull; and it omits KSA's mouse smoothing / sensitivity
  setting. The look clamps, eye position and FOV are faithful.
- **`<Internal>` is per-TEMPLATE, never per-placement.** KSA puts it on the `<SubPart>`'s
  `<PartModel>`, and a placement is a `PartInstance` whose `Components` list is save-game state
  (`XmlHelper.cs:32`), so "this chair is interior but that identical chair is not" is not
  representable. The bulk toggle acts on the distinct templates behind the selection and the UI says
  so. Same limitation, same wording, as a SubPart-owned collider.
- **Glass can never be interior-only** — `<PartModelGlass>` has no `<Internal>` field (§1.5). The
  toggle is disabled for glass-exporting meshes rather than silently ignored.
- **A variant of a `<PartModelDynamic>` built-in is redeclared as a plain `<PartModel>`**, losing its
  heat-effect (ThinFilm) shading. Pre-existing — `assetsXmlSerializer` has only ever emitted
  `<PartModel>` for reference SubParts — but after Phase 0 it is *avoidable*: leave such a template's
  `<Internal>` flag alone and no variant is minted at all.
- **No crew, no seat geometry, no ergonomics.** A seat is a camera vantage point; KSA has no crew
  model in a part. The kitten visual aide (Phase 4) is the only ergonomics tool, and it is a
  eyeball-it reference, not a measurement.
- **No in-game seat labels.** KSA shows only a `TimedAlert.Create("IVA Camera", …)` on entry
  (`IVAController.cs:196`); there is no per-seat name in the schema, so there is nothing to author.
