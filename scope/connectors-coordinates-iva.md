# Scope — Connectors, coordinate mapping, IVA/NotIVA

> How flexo places geometry in KSA's frame, models connectors, and de-IVAs internal props.
> Read alongside [docs/coordinates.md](../docs/coordinates.md) and
> [docs/ksa-part-connector-notes.md](../docs/ksa-part-connector-notes.md).

**Baseline:** verified against KSA build **2026.6.9.4750**.
**Baseline status:** ⚠️ **MIXED** — the coordinate calibration, connector flag _schema_, and
IVA/NotIVA are all **intact**, but the **`<DockingPort>` GameData schema is BREAKING** (see
[gamedata-modules.md](gamedata-modules.md)) and the face-snapping model is now data-driven (docs
drift). See [plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

---

## Flexo modules

| Path                                                | Role                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/three/coords.ts`                               | **The single chokepoint** for KSA-Part-space ⇄ three.js. `applyPlacement`, `matrixFromTransform`, `transformFromMatrix`. The one calibration knob `EULER_ORDER = 'ZYX'`. |
| `src/three/coords.test.ts`                          | Locks the mapping by reproducing KSA's `QuaternionEx.CreateFromXyzRadians` and asserting `applyPlacement` matches to <1e-6.                                              |
| `src/three/debugCalibration.ts`                     | `?debug=dockingport`: loads `CoreCouplingAAssets.xml` part `CoreCouplingA_Prefab_DockingPort1WA` and renders its SubPart placements.                                     |
| `src/three/ConnectorObject.ts`                      | Renders a connector as a cube + cone along **local +X** (the facing arrow).                                                                                              |
| `src/ksa/types.ts`                                  | `Connector` (`extends Transform`; `id`, `flags`, `layerId`); `ConnectorFlag = 'Internal'\|'ToSurface'\|'FromSurface'`; `Decoupler`/`DockingPort`/`EvaDoor`.              |
| `src/ksa/partXmlParser.ts` / `partXmlSerializer.ts` | `parseConnectorFlags`/`connectorsFromPartElement`; `buildConnectorElement`/`flagsString`.                                                                                |
| `src/ksa/modExport.ts`                              | `buildIvaVariantMap`/`IvaVariant`/`ivaRemapFromVariants` — de-IVA each placed Internal SubPart.                                                                          |
| `src/ksa/assetsXmlSerializer.ts`                    | `ReferenceSubPartPlan` — reference-only `<SubPart>` wiring a fresh `<PartModel>` id to built-in `<Mesh>`/`<Material>`.                                                   |

## Game-side anchors (`decomp/KSA/`)

| Concern                   | Class                                                                                                                                                | XML                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Connector schema          | `Part.cs` → `Part.Connector.TemplateBase` (`Id` attr, `<Transform>`, `<Flags>`); enum `Part.Connector.Flag {Internal=1, ToSurface=2, FromSurface=4}` | `<Connector Id><Transform/><Flags/></Connector>` on `<Part>`                 |
| Face-snapping / placement | `VehicleEditor.cs`, `EditorTag.cs`, `EditorTagDefinition.cs`                                                                                         | `<EditorTag Value>`, `<EditorTagDef …>`                                      |
| Decoupler                 | `DecouplerTemplate.cs`                                                                                                                               | `<Decoupler ConnectorId Force>`                                              |
| Docking port              | `DockingPortTemplate.cs`, `DockingPort.cs`                                                                                                           | `<DockingPort>` — **CHANGED, see gamedata-modules.md**                       |
| IVA / NotIVA              | `PartModelModule.cs` (`<Internal>` bool, `<RayTracing>` enum `{Disabled, ShadowProxy}`, `<Mesh>`, `<Material>`), `PartModel.cs` (render gate)        | `<PartModel><Internal>true</Internal><RayTracing>…</RayTracing></PartModel>` |
| Coordinate basis          | `Double3Ex.cs` (`Up=(0,1,0)`, `Right=(1,0,0)`, `Forward=(0,0,-1)`), `QuaternionEx.cs` (`CreateFromXyzRadians`)                                       | —                                                                            |

## The contract — what flexo bakes in

**Connectors**

- `<Connector Id>` with nested `<Transform>` + optional `<Flags>` text (`", "`-joined subset of `Internal`/`ToSurface`/`FromSurface`; empty ⇒ omit ⇒ connect-to-anything). Matches enum `{Internal=1, ToSurface=2, FromSurface=4}`.
- Flag semantics (`docs/ksa-part-connector-notes.md`, still implemented in `VehicleEditor.cs`): `Internal` — two Internal connectors can't mate (with ConnectorTyping on); `ToSurface` — unidirectional, attaches _to_ a surface; `FromSurface` — others attach _from their surface_ to this (radial decoupler).
- Connector "facing" is visualized as **local +X** (a flexo editor convention; the game mates by the full `Transform`, and as of 4750 snaps off the part's **+Z** bounding face — not a connector axis).

**Coordinate transform + `?debug=dockingport`**

- KSA and three.js share basis: RH, Y-up, **−Z-forward**, meters → position & scale applied directly, no swap/flip (verified `Double3Ex.cs`).
- Rotation: KSA stores Euler "XYZ" radians but composes opposite to three.js `'XYZ'`; numerically **bit-for-bit three.js `'ZYX'`** (`EULER_ORDER='ZYX'`, reproduced from `QuaternionEx.CreateFromXyzRadians`).
- Calibration renders `CoreCouplingAAssets.xml` part `CoreCouplingA_Prefab_DockingPort1WA` (the **Assets** geometry file — _not_ the GameData file) → correct ⇒ radially-symmetric port.

**IVA → NotIVA export**

- KSA gate (`PartModel.cs`): an Internal PartModel renders only in IVA camera mode (`Template.RayTracing != ShadowProxy && (!Template.Internal || viewport.Mode == IVA)`).
- flexo re-homes each placed Internal SubPart onto a fresh, project-unique SubPart `flexo_<base>_<id>_NotIVA` that **reuses the built-in `<Mesh>` + `<Material>` ids**, **omits `<Internal>` + `<RayTracing>`**, with a **fresh `<PartModel>` Id** (KSA dedupes PartModels by id).

## Known gotchas

- `EULER_ORDER` is the single calibration knob — change it only in `coords.ts`; everything routes through it. Single-axis rotations look right under either order, masking a wrong order until a multi-axis part scrambles.
- IVA variant must use a **fresh PartModel Id** (reusing one silently collides via the dedup).
- IVA props render black/invisible outside IVA unless de-IVA'd (the whole NotIVA feature exists for this).
- Connector `<Flags>` must be emitted in BOTH the Part and GameData documents.

## What changed in 4750

- 🔴 **DockingPort GameData schema (BREAKING)** — attribute-form → child-element form, renamed fields, impulse→energy units. Detail + fix in [gamedata-modules.md](gamedata-modules.md). NB: this is **GameData** (`CoreCouplingAGameData.xml`); the coordinate calibration renders the **Assets** geometry file, which is byte-identical, so calibration is unaffected.
- 🟡 **Face-snapping rewrite (SCHEMA-DRIFT, docs only).** `VehicleEditor` face-snapping is now **data-driven** via `EditorTagDefinition` booleans (`FaceSnapBlacklist`/`RootPartWhitelist`/`FaceSnapTargetWhitelist`/`FaceSnapTargetBlacklist`/`DiameterFilterlist`/`NotaCategory`); the built-in `EditorTag` statics `NoFaceSnapping`/`Tanks`/`Coupling`/`Structural` were **removed** from `EditorTag.cs` (now data-driven via `RegisterTag`). Snapping now uses the moving part's **+Z** bounding face (rev 4687/4719/4739). **Connector flag schema + `<Connector>/<Flags>` are unchanged → export is safe.** flexo's `editorTags` is freeform passthrough → users can still apply these tags. Action: refresh `docs/ksa-part-connector-notes.md` to note the data-driven model; optionally surface known face-snap tags in the UI.
- ✅ `Double3Ex.cs` + `QuaternionEx.cs` + `CoreCouplingAAssets.xml` zero-diff → `EULER_ORDER='ZYX'` holds, calibration valid.
- ✅ `PartModel.cs` + `PartModelModule.cs` zero-diff → IVA/NotIVA valid.
- ✅ `Part.cs` connector change = an in-game assembly-merge position-offset fix (flexo doesn't simulate merging). `Decoupler` schema unchanged (runtime-only diff).
