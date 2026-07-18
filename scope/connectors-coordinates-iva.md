# Scope — Connectors, coordinate mapping, IVA/NotIVA

> How flexo places geometry in KSA's frame, models connectors, and de-IVAs internal props.
> Read alongside [docs/coordinates.md](../docs/coordinates.md) and
> [docs/ksa-part-connector-notes.md](../docs/ksa-part-connector-notes.md).

**Baseline:** re-vetted against KSA build **2026.7.6.4939** (decomp @ 4939 + shipped Core XML).
**Baseline status:** ✅ **CURRENT** — the coordinate calibration, connector flag _schema_, and
IVA/NotIVA are all **intact**; the `<DockingPort>` GameData schema (BREAKING in 4750) is fixed. As
of 4826, connectors carry new attach-node grouping (`<Sibling>` geometry / `<Aligned>` GameData);
`<Sibling>` is now preserved via `Connector.siblingIds`, `<Aligned>` rides the gap-6 passthrough
with its `<ConnectorRef>` ids remapped through the regenerated connector ids on import/paste
(see [What changed in 4826](#what-changed-in-4826)). See
[plans/FIX_CURRENT_GAPS_PLAN.md](../plans/FIX_CURRENT_GAPS_PLAN.md).

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

**Vehicle reference orientation (root part = the flight-computer "up")**

flexo edits parts, not vehicles, so it never computes this — but it is the contract behind "which way
is up" for any **control / root-eligible** part flexo emits. Verified 4750; full trace in
[analysis/HOW_UP_WORKS.md](../analysis/HOW_UP_WORKS.md).

- The flight computer aims the vehicle **Body-frame +X** (nose/forward) at every auto-point mode
  (`Up`=local zenith, `Forward`=surface velocity, `Prograde`, `RadialOut`, … —
  `FlightComputer.UpdateAttitudeTrackError` uses `double3.UnitX.Transform(...)`); **+Z** is the roll
  reference (`RollMode`). This is the **same +X-forward convention** flexo already draws for connector
  facing (above).
- **Body frame == Assembly (editor) frame** (`Vehicle.cs` `Asmb2Cce => Body2Cce`), and at launch the
  **root part is pinned to identity** in that frame — its editor orientation is folded into the
  vehicle's world attitude (`VehicleEditor.cs` ~`:845`). ⇒ **the root part's local axes ARE the
  vehicle reference axes; root-local +X = the ship's forward/up.**
- `<Control/>` does **NOT** set this. `Control`/`ControlTemplate` are empty markers (`Control.cs`);
  `Vehicle.IsControllable` = _any_ `Control` module present, anywhere in the tree. There is **no
  control-point / "control-from-here" / reference-transform** in 4750 — the orientation reference is
  always the root part, regardless of where the `Control` marker lives.
- **Root-eligibility contract** (`VehicleEditor.IsAllowedAsRootPart`): a part may be root iff it has
  (a) an editor tag flagged `RootPartWhitelist` (Core: `Capsules`, `Engines`, `Fuel Tanks`,
  `Coupling`, `Structural`, `Interstage`, `Cargo`), (b) **≥1 connector**, and (c) **no**
  `ToSurface`/`FromSurface` connector (stack nodes only).

**flexo implication:** none today (flexo does no vehicle assembly). If flexo ever generates a
control/reference part, author its **local +X toward the intended forward/up**, and give it a stack
connector + a root-whitelisted `<EditorTag>` so it can serve as the anchor. A _passive_
"attach-it-to-reorient-up" part is **impossible data-only** (no control point) — "up" only ever
follows the root part.

## Known gotchas

- `EULER_ORDER` is the single calibration knob — change it only in `coords.ts`; everything routes through it. Single-axis rotations look right under either order, masking a wrong order until a multi-axis part scrambles.
- IVA variant must use a **fresh PartModel Id** (reusing one silently collides via the dedup).
- IVA props render black/invisible outside IVA unless de-IVA'd (the whole NotIVA feature exists for this).
- Connector `<Flags>` must be emitted in BOTH the Part and GameData documents.

## What changed in 4939

**INTACT — no flexo change.** `QuaternionEx.cs`, `Double3Ex.cs`, `Control.cs`,
`ControlTemplate.cs`, `FlightComputer.cs`, and `DockingPortTemplate.cs` are absent from the
4892→4939 diff; `VehicleEditor.cs` still pins the root to identity
(`Root.Asmb2ParentAsmb = doubleQuat.Identity` — rev 4904 was a refactor plus fuel-line UI);
grep for `controlpoint|control from here|referencetransform` still empty, so the
reference-orientation contract (aim **Body +X**, roll **+Z**, up-follows-root) holds. Connector
schema: `[XmlElement("Flags")]` and `[XmlElement("Sibling")]` unchanged on
`Part.Connector.TemplateBase` — but rev 4929 moved Core's sibling CONTENT to GameData-level
`<SymmetryGroup>` (expanded into `SymmetrySiblings` at load, unknown connector ids skipped), so
shipped Assets XML now authors zero `<Sibling>` elements; flexo's `siblingIds` emit remains
valid schema. See
[part-and-subpart-xml.md](part-and-subpart-xml.md#what-changed-in-4939).

## What changed in 4892

**INTACT — no flexo change.** `QuaternionEx.cs`, `Double3Ex.cs`, `Control.cs`,
`ControlTemplate.cs`, `DockingPortTemplate.cs`, `DecouplerTemplate.cs`, `PartModel.cs` all
byte-identical; `Part.Connector` `Flag` enum + `<Flags>`/`<Sibling>` schema unchanged (the
runtime-only `Connector.Blocked` obstruction concept from 4826 was removed again);
`PartModelModule` template (`<Mesh>/<Material>/<RayTracing>/<ShadowCaster>/<Internal>`)
unchanged — only two new runtime selection-flag bits. Reference-orientation contract
re-verified: `VehicleEditor` still folds the root's editor rotation into the world attitude and
pins `Parts.Root.Asmb2ParentAsmb = Identity` at launch; `FlightComputer.UpdateAttitudeTrackError`
still aims **Body +X** / rolls **+Z**; no ControlPoint/reference-transform concept appeared
(grep-clean). Rev 4876's "axes gizmo ASMB frame" is a **display-only** camera nav-ball (its +X
handle = top view — the game itself confirming +X-up) plus a new ASMB/Local manipulation-gizmo
toggle. The new fuel-line system (`FuelLink*`, rev 4882) persists as `<FuelLink PartA PartB Flow
Enabled>` in **vehicle saves** (`VehicleSaveData`) with uint instance ids — nothing lands in
Part/SubPart templates or GameData, so it is NOT a flexo surface.

## What changed in 4826

- **New connector attach-node grouping = the game's new part-symmetry system.** KSA 2026.7 added `<Sibling>` (geometry connector) + `<Aligned>` (GameData) to the multi-mount adapter prefabs (engine plates, interstage bridges, radial fuel-tank clusters). Decomp-confirmed (4750 → 4826):
  - **`<Sibling Id="_connectorN"/>`** — decomp: `Part.Connector.TemplateBase.SymmetrySiblings` = `[XmlElement("Sibling")] List<ConnectorReference>` (`ConnectorReference` = `[XmlAttribute("Id")]`). A child of the geometry `<Part>`'s `<Connector>`, listing its symmetry group-mates. flexo parses connectors (`connectorsFromPartElement`) and re-emits them (`buildConnectorElement`) with **no passthrough on connector children**, so it dropped `<Sibling>` on round-trip. **Fixed:** `Connector.siblingIds[]` (parse/emit); on import + project-paste the ids are **remapped through the regenerated-connector id map** (dropping refs outside the imported set) so they never dangle; intra-part duplicate/stamp carry them as-is (same id space). Persisted as codec `sb`. Regression: `partXmlParser.test.ts` "`<Sibling>` attach-node grouping".
  - **`<Aligned><ConnectorRef Id/></Aligned>`** — decomp: `PartTemplate.Aligned` = `[XmlElement("Aligned")] List<Part.AlignedConnectors.AlignedConnectorsRef>` (`AlignedConnectorsRef` = `[XmlElement("ConnectorRef")] List<ConnectorReference>`). A modeled child of `<PartGameData>`, but **not** in flexo's `KNOWN_PART_GAMEDATA_CHILDREN`, so the gap-6 `RawXmlNode` passthrough captures + re-emits it. Verbatim re-emit alone was a bug: imports regenerate `_connectorN` ids, so the raw `<ConnectorRef>`s went stale (or collided with a pre-existing connector). **Fixed:** `remapRawConnectorRefs` (partXmlParser.ts) rewrites `ConnectorRef`/`Sibling` `Id`s inside preserved raw XML (any depth — also covers `<SymmetryGroup>`) through the regenerated-connector id map in both import paths (`applyImportedGameData` in editorStore.ts, `mergeGameData` in projectTransfer.ts); unmapped ids stay verbatim. Locked by `partXmlParser.test.ts` "`<Aligned>` connector groups verbatim" + "remapRawConnectorRefs…", `editorStore.test.ts` / `projectTransfer.test.ts` "rewrites `<ConnectorRef>`s…".
  - The runtime `PartSymmetryInstance`/`SymmetryLayerInstance`/`SymmetryData`/`Part.SymmetryLink` classes (Part.cs `SaveSymmetryLinks`/`RestoreSymmetryLinks`, `PartInstance.Symmetry`) are **vehicle-assembly / save-file state — outside flexo's part-template scope**; only the connector-level template hints above reach flexo.
- **Reference-orientation contract unchanged (decomp-verified 4826):** still no `ControlPoint` / "control-from-here" / reference-transform; `Control`/`ControlTemplate` are still empty markers; the vehicle's "up" still follows the root part. `Double3Ex.cs`/`QuaternionEx.cs`/`PartModel.cs`/`PartModelModule.cs` unchanged → `EULER_ORDER='ZYX'` + IVA gate still valid.

## What changed in 4750

- 🔴 **DockingPort GameData schema (BREAKING)** — attribute-form → child-element form, renamed fields, impulse→energy units. Detail + fix in [gamedata-modules.md](gamedata-modules.md). NB: this is **GameData** (`CoreCouplingAGameData.xml`); the coordinate calibration renders the **Assets** geometry file, which is byte-identical, so calibration is unaffected.
- 🟡 **Face-snapping rewrite (SCHEMA-DRIFT, docs only).** `VehicleEditor` face-snapping is now **data-driven** via `EditorTagDefinition` booleans (`FaceSnapBlacklist`/`RootPartWhitelist`/`FaceSnapTargetWhitelist`/`FaceSnapTargetBlacklist`/`DiameterFilterlist`/`NotaCategory`); the built-in `EditorTag` statics `NoFaceSnapping`/`Tanks`/`Coupling`/`Structural` were **removed** from `EditorTag.cs` (now data-driven via `RegisterTag`). Snapping now uses the moving part's **+Z** bounding face (rev 4687/4719/4739). **Connector flag schema + `<Connector>/<Flags>` are unchanged → export is safe.** flexo's `editorTags` is freeform passthrough → users can still apply these tags. Action: refresh `docs/ksa-part-connector-notes.md` to note the data-driven model; optionally surface known face-snap tags in the UI.
- ✅ `Double3Ex.cs` + `QuaternionEx.cs` + `CoreCouplingAAssets.xml` zero-diff → `EULER_ORDER='ZYX'` holds, calibration valid.
- ✅ `PartModel.cs` + `PartModelModule.cs` zero-diff → IVA/NotIVA valid.
- ✅ `Part.cs` connector change = an in-game assembly-merge position-offset fix (flexo doesn't simulate merging). `Decoupler` schema unchanged (runtime-only diff).
