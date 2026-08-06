# Part XML Serialize / Parse

Flexo exports the project's parts — **all of the included ones, into one set of files** — to
KSA "Assets" Part XML, and can parse a Part back (used by the coordinate calibration and
future import). All XML uses built-in DOM APIs — `@xmldom/xmldom` (browser-compatible, also
runs in node tests); no third-party XML library.

## Serializer — `src/ksa/partXmlSerializer.ts`

`serializePartsXml(entries: Array<{ part: EditingPart; remap: TemplateRemap }>): string`
mirrors space-tape's `PartXmlSerializer.cs`, one `<Part>` element per entry:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Assets>
    <Part Id="...">
        <SubPart Id="instance" InstanceOf="template">
            <Transform>
                <Position X="0.1427" Z="-0.0601"/>
                <Rotation X="3.14159"/>
                <Scale X="2"/>
            </Transform>
        </SubPart>
        <Connector Id="_connector1">
            <Transform><Position X="0.5"/></Transform>
            <Flags>Internal, ToSurface</Flags>    <!-- ", "-joined; omitted when empty -->
        </Connector>
    </Part>
</Assets>
```

The geometry `<Part>` carries **only** SubPart placements and connectors (transform
+ `<Flags>`). Editor tags, display name, mass, tanks, power and coupling all live on
the separate `<PartGameData>` document (below) — matching KSA's split. (Connector
`<Flags>` are emitted in **both** documents, mirroring space-tape's two serializers.)

Rules (verified against Core XML + the C# serializer):
- `<Transform>` is **omitted** when position=0 ∧ rotation=0 ∧ scale=1.
- Each of `<Position>/<Rotation>/<Scale>` is omitted when equal to its default
  (0 / 0 / 1) within `EPSILON = 1e-9`.
- Each axis attribute (`X`/`Y`/`Z`) is omitted when equal to the default.
- Rotation is **Euler XYZ radians**.
- Numbers use `formatG6` (see below).
- Built with `DOMImplementation` + `XMLSerializer`, then pretty-printed (4-space
  indent) by a small string pass (safe — no mixed text nodes).

### GameData document — `serializeGameDataXml(entries, base): string`

Mirrors space-tape's `GameDataXmlSerializer.cs`. The popup-only metadata
(`EditingPart.gameData` + `editorTags`) plus connector flags:

```xml
<Assets>
    <PartGameData Id="..." DisplayName="My Tank">   <!-- DisplayName omitted when blank -->
        <EditorTag Value="Tanks"/>
        <CustomMass><Mass Kg="250"/></CustomMass>   <!-- omitted unless > 0 -->
        <CylindricalTank>
            <Material Id="Aluminum.2014(s)"/>
            <Length M="3"/>                         <!-- cylinder only -->
            <OuterRadius M="0.8"/>
            <WallThickness Mm="2.5"/>
        </CylindricalTank>
        <SphericalTank> … </SphericalTank>          <!-- no <Length> -->
        <Battery><MaximumCapacity KWh="0.5"/></Battery>
        <Generator><Produced W="12"/></Generator>
        <PowerConsumer><Consumed W="3"/></PowerConsumer>
        <Connector Id="_connector1"><Flags>ToSurface</Flags></Connector>  <!-- every connector; <Flags> only when set -->
        <Decoupler ConnectorId="_connector2" Force="750"/>
        <DockingPort ConnectorId="_connector3" LatchingImpulse="6000" PushoffForce="7000"/>
        <EVADoor SeatId="pilot"/>   <!-- SeatId is EVADoorTemplate's ONLY field; emitted only when linked -->
    </PartGameData>
</Assets>
```

Every piece is omitted when empty/default. Each project exports both files
(`<Name>Part.xml` + `<Name>GameData.xml`) via `src/ksa/modExport.ts`.

**Engines** add more to this document: `<Rocket>`/`<Combustor>`/`<DeLavalNozzle>` per
`<SubPartGameData>`, part-level `<RocketEngineController>`/`<RocketThrusterController>` +
gas-generator `<Rocket>`/`<Combustor>` + `<SubPart Id><Gimbal>` overlays, and top-level
`<FixedReaction>` for custom propellants — all round-tripped by the parser. See
[engines.md](engines.md) for the schema, units, and default-omission rules.

### Both documents hold N parts

A project holds **N parts** and exports all the included ones into the same two files, as
siblings under one `<Assets>` root — legal because KSA's `AssetBundle` is a flat
`List<SerializedId>` (`scope/part-and-subpart-xml.md` ▸ *Multi-part export*). Both entry
points take the same `Array<{ part, remap }>` and emit in entry order:

- `serializePartsXml(entries)` — N `<Part Id>` siblings, each with its placements then its
  connectors.
- `serializeGameDataXml(entries, base)` — per entry a `<PartGameData>` followed by that
  part's `<SubPartGameData>` blocks, then **every part's `<FixedReaction>`s once each, hoisted
  to the END of the file**. `base` names the file and feeds the animation module ids, so it is
  shared by the whole document.

The `<FixedReaction>` hoist is a **first-wins dedupe by `Id`**: two parts burning the same
custom propellant (a duplicated part, a shared mixture) declare it once. Position is
irrelevant — KSA resolves a `<Combustor><Reaction Id>` only after all mod data has loaded — and
KSA's own registration is first-wins too, so a second declaration would be ignored anyway. Two
parts defining one id with **different** chemistry is an export blocker, so nothing is lost.
A `Category="Solid"` reaction missing its burn-rate law is still skipped with a warning.

Export **variant ids carry a per-part namespace token**: `flexo_<base>_<ns>_<templateId>`,
where `ns = partExportNs(part.partId)`. Without it, two parts placing the same built-in
template would mint one variant id, and KSA — which registers `<SubPartGameData Id>` once
globally — would attach part A's lights/tanks to part B's SubPart. `TemplateRemap` is the
`originalTemplateId → variantId` map each entry carries into both serializers.

The one call site is `buildMultiModContent(parts, projectName, catalog)` in
`src/ksa/modExport.ts`: it runs `expandGlassGlow` + `buildExportVariantMap` per part and
returns `{ base, partFile, partXml, gameDataFile, gameDataXml, perPart }`, shared by the
export buttons AND the XML preview. Delivery takes `NamedExportPart[]` throughout —
`buildModZip(parts, projectName, kittenTex?, catalog?)` and
`writeModToFolder(modsDir, parts, projectName, kittenTex?, catalog?)` — and both call
`buildMultiCustomBundle(content, kittenTex?)`, which merges every part's plan into ONE
`<Base>Assets.xml` via `serializeAssets(plans)`.

### `[Flags]` enum bodies MUST be whitespace-separated (hard requirement)

Any enum flexo emits as element text — `<Flags>`, `<Capabilities>`, `<RoleAffinity>` — is a
.NET `[Flags]` enum, and KSA deserializes with `System.Xml.Serialization.XmlSerializer`.
`XmlSerializationReader.ToEnum` splits the body with **`value.Split(null)`** (whitespace) and
throws `CreateUnknownConstantException` on any token it doesn't recognize.

```xml
<Flags>Internal ToSurface</Flags>   <!-- correct -->
<Flags>Internal, ToSurface</Flags>  <!-- token "Internal," ⇒ KSA's mod load THROWS -->
```

`flagsString()` and the `<Capabilities>` emitter therefore join with a space; the parser
accepts either separator on the way in. Single-token bodies (which is all Core authors) are
identical either way, which is exactly why this stayed latent until 2026.7.9 added
`<Capabilities>`.

## Number formatting — `src/ksa/formatG6.ts`

`formatG6(n)` replicates .NET `double.ToString("G6")`: 6 significant digits, trailing
zeros trimmed, `.NET`-style exponential (`E+NN`) only outside the fixed range
(exponent < -4 or ≥ 6). KSA's serializer uses "G6" for all transform numbers, so this
keeps export byte-compatible. **Never** write raw `toString()`/`toFixed()` into XML.

## Parser — `src/ksa/partXmlParser.ts`

`parsePartPlacements(xmlText, partId, parserImpl?)` is the inverse: finds the
`<Part Id=partId>`, reads each `<SubPart InstanceOf=…>` and its `<Transform>` into
`SubPartPlacement[]` (missing axes default to 0/0/1; rotation in radians). The
optional `parserImpl` lets tests inject `@xmldom/xmldom`'s `DOMParser`; the browser
uses the global `DOMParser`. `connectorsFromPartElement` reads inline `<Flags>` via
`parseConnectorFlags` (the `", "`-joined list → `ConnectorFlag[]`, unknowns dropped).
`gameDataFromAssets(xmlText, partId, parserImpl?)` is the inverse of
`serializeGameDataXml` for ONE part: it returns the `<PartGameData Id=partId>` block as
`{ editorTags, connectorFlags: Map<id, ConnectorFlag[]>, gameData: PartGameData }`
(or `null` if absent), and underpins the serialize→parse round-trip tests.

## Part catalog & GameData merge — `src/ksa/partCatalog.ts`

The "+ Part" importer builds its catalog from the Core `*Assets.xml` files, but in
KSA's Core data the geometry `<Part>` carries **no** connector `<Flags>` and (mostly)
no `<EditorTag>` — those live in the sibling `*GameData.xml` files under
`<PartGameData Id="…">`. So `loadCorePartCatalog()` also fetches each
`<name>GameData.xml` (derived from the asset filename; missing siblings are skipped
silently) and `mergeGameData()` folds them into each `CatalogPart`:

- connector `<Flags>` (a `ConnectorFlag[]` from `ToSurface`/`FromSurface`/`Internal`)
  are applied to the matching connector by `Id` (geometry is the source of truth —
  flags-only connectors with no geometry counterpart are ignored);
- `<EditorTag Value="…">` values are unioned into `editorTags`.

`addPart(placements, connectors, editorTags)` then unions the imported editor tags
into the current project. Without this merge the `ToSurface` flag (e.g. on solar
panels) and most editor tags were dropped on import. The vite dev server streams the
GameData files under `/ksa/`; `vite/ksaAssets.ts` copies the existing ones into
`dist/ksa/` for production.

## Editing UI

- **Data mode** (`src/ui/data/`) is the one GameData authoring surface. The right sidebar
  (`DataNavigator`) picks the scope — the Part, or one SubPart template — and the left
  sidebar (`DataScopeForm`) renders that scope's sections: Identity / Mass / Tanks
  (feed containers) / Power / Coupling / Wiring / Advanced / Passthrough at Part scope, and
  Tanks / Lights / Solar / Engine / Passthrough at template scope. Entry points are the mode
  switcher, `3`, the ⌘K commands `data.scopePart` and `data.scopeTemplate:<id>`, and Build's
  "SubPart Data →" jump. The v1 **Part Data** and **SubPart Data** fullscreen modals are
  deleted. Numeric fields reuse `PreciseNumberInput` (with `onInteractionStart` to push one
  undo step per typing session). Connectors are **not** here — they're edited in the
  3D workspace, and their flags are three switches in `ui/build/ConnectorInspector.tsx`;
  the Wiring section mirrors their `<Capabilities>` read-only, with a jump to that editor.
- `src/ui/data/PassthroughViewer.tsx`: a **read-only** view of the preserved XML described
  under "unmodeled XML" below — the `unknownAttrs` / `unknownChildren` tree and, at Part
  scope, the nodes re-nested inside `<CustomMass>`. It renders and copies; it never writes.
  **The capture, re-emit and connector-ref remap semantics are UNCHANGED** — the viewer reads
  the same `RawXmlNode` data the parser already produced, and `src/ksa/` was not touched to
  add it, so export output is byte-identical to before the viewer existed.
- `src/ui/ExportKsaDialog.tsx` / `src/ksa/modExport.ts`: write/zip the per-project
  `Part.xml` + `GameData.xml`, holding every included part. The dialog's **Inspect XML** mode
  previews exactly the bytes the mod ships (same `expandGlassGlow` → `buildMultiModContent`
  path), built lazily per tab by `src/state/exportPreviewStore.ts` — see "The Export to KSA
  dialog" below.

## The Export to KSA dialog

`src/ui/ExportKsaDialog.tsx` (dialog id `'export-ksa'`, `⌘E`, **File ▸ Export to KSA…**) is
the one delivery surface. It is mounted by `DialogRoot` and opened only by the
`file.exportKsa` command — no trigger button owns its state.

**Two modes on one toggle.**

- **Deliver mod** — the pre-flight, the mods-folder grant row, the export-shaping settings as
  read-only chips, and the two delivery actions in a **pinned footer** (so a noisy pre-flight
  can never scroll the buttons out of reach).
- **Inspect XML** — Part / GameData / Assets in a read-only mono textarea with the shared kit
  `CopyDownloadBar` (Copy + `Download .xml`, named `<base><Tab>.xml`).

**The pre-flight is one issue model.** `src/ksa/exportIssues.ts` `collectExportIssues(part,
reactions, catalog)` folds the basic trio (empty Part Id, duplicate instance ids, no SubParts)
and the four shared validators — `validateEngines`, `validateColliders`, `validateIvaSeats`,
`validateLights` — into `{severity, area, code, message, jumpTarget?}`, plus one `info` row
naming custom meshes that have no placements and therefore will not ship. The dialog calls
`collectProjectExportIssues(parts, coreReactions, catalog)`, which runs that per-part pass over
every included part (tagging each issue with `partEntryId`/`partName`) and then adds the
cross-part blockers that guard the mod's global id space: no parts included, duplicate
`<Part Id>`, two Part Ids that sanitize to the same variant namespace `ns`, a custom-mesh
SubPart id used by two parts, and one `<FixedReaction Id>` defined with different chemistry in
two parts. The validators themselves are untouched and still shared with Data/Engine mode.
The three severities render as
three disclosure boxes (`block` / `warn` / `info`), collapsed to their count line when a box
holds more than three issues (and always on phones). A row whose issue names a scope is a
**jump link**: it closes the dialog and calls `modeStore.setMode(mode, focus)` — Engine for an
engine module, Data ▸ Identity for a blank Part Id, Build (selecting the light) for a light.

**Blockers never gate the export.** A `block` finding relabels the primary button
`Export anyway (N blockers)`; both buttons stay enabled. Shipping a work-in-progress part is a
legitimate thing to do, and the pre-flight's job is to explain, not to refuse.

**The XML preview is lazy** (`src/state/exportPreviewStore.ts`). Nothing is built until a tab is
focused; Part + GameData come from one cheap synchronous `buildMultiModContent`, and the Assets
bundle — the full KTX2 encode / GLB atlas / kitten bake chain — runs ONLY on the Assets tab.
Results are memoized by an input stamp over `(part, partEntries, activePartId,
inactiveRevision, projectName, catalog, kittenTextureExport, decimateViewMeshes)` — the first
four being the identity tokens the exported parts list is a pure function of, since
`partsForExport()` allocates a fresh array on every call and can never be identity-compared. A
change to any of them does not silently re-run the encode: the tab shows
`Project changed — [Rebuild]`, and a rebuild aborts the in-flight build through the
`AbortSignal` `buildMultiCustomBundle` accepts (checked at each part boundary as well as each
asset). Closing the dialog aborts and drops every memo.
None of this changes a byte of output — the preview and the shipped mod come from the same
builders (the single-source invariant).

**Delivery.** `Export to mods folder` calls `getWritableModFolder()` (which may prompt inline —
the button press is the user gesture) and then `writeModToFolder`, whose semantics are
untouched: existing XML is never overwritten (`-N` suffixing), binaries are overwritten,
`mod.toml` is rebuilt from the folder listing. Success posts a status flash plus a sticky
*rich* "Export complete" notification listing the written files and the pre-flight counts at
export time; failure posts a `danger` notification with the full, untruncated message.
`Download mod zip` needs no permission at all and is promoted to the primary button on a
browser without the File System Access API (iOS), where the folder button is hidden entirely.

**The grant lifecycle has one implementation and two surfaces.** `modFolderStore` owns the
handle (IndexedDB `flexo-fs/handles/modsDir`, passive `queryPermission` on boot) and
`modFolderStatusLabel()` owns its wording; the dialog's inline row shows it with
Choose / Change / Re-grant, and **File ▸ Mods Folder ▸** shows the same label as a disabled
info row over `Choose Folder…`, `Re-grant Access` (only while `needs-permission`) and
`Forget Folder…` (only while a folder is set), which confirms before dropping the grant.

**Export-shaping preferences** (kitten texture mode, `_VM` decimation) are read-only chips that
deep-link to Settings ▸ Import & Export with a `returnTo`, so glancing at a preference re-opens
this dialog instead of losing it.

## Tests
- `partXmlSerializer.test.ts` — transform/axis omission + G6 formatting; tags on
  PartGameData (not Part); full GameData (mass, tanks, power, connectors+flags,
  coupling); empty-default omission.
- `formatG6.test.ts` — fixed/exponential cases.
- `partXmlParser.test.ts` — serialize→parse round-trips (placements, connector
  flag arrays, full `gameDataFromAssets`).

## Colliders

`<Collider>` is legal in **four** places in KSA's schema (geometry `<Part>`, geometry
`<SubPart>`, `<PartGameData>`, `<SubPartGameData>`), and the geometry/GameData pairs are
functionally identical — `PartTemplate.ApplyGameData` merges `Components` **additively**.
flexo therefore **reads all four and writes one**: every collider is normalised into the
GameData document, grouped by owner.

```xml
<PartGameData Id="...">
    …
    <Collider Id="flexoColliders">                  <!-- part-level group (ownerTemplateId null) -->
        <Cylinder Id="_collider1">
            <LocationAsmb X="0" Y="0" Z="0"/>       <!-- always all three axes -->
            <Collider2Asmb X="0" Y="0" Z="1.57"/>   <!-- Euler XYZ radians -->
            <LengthY M="2"/>                        <!-- ALWAYS emitted (see below) -->
            <Radius Cm="50"/>
        </Cylinder>
    </Collider>
</PartGameData>
<SubPartGameData Id="...">                          <!-- one group per owning template -->
    <Collider Id="flexoColliders"> … </Collider>
</SubPartGameData>
```

Rules that differ from the rest of this document:

- **No omit-at-default for dimensions.** `DistanceReference` reads back as **NaN**, not 0,
  when no unit attribute is present, so an omitted `<Radius>`/`<Length*>` would build a NaN
  Bepu shape in-game. `buildColliderElement` always emits every dimension the shape has
  (`colliderDimensionNames`), and both frame vectors with all three axes.
- **A `<SubPartGameData>` block is created for a template whose only data is a collider** —
  e.g. a landing-leg foot puck — and the existing block is reused when there is one, so a
  template never gets two.
- **The component `Id` is generated, not round-tripped.** Nothing references it, Core reuses
  `"Collider1"` everywhere, and it shares the id namespace `<FeedsFrom Container>` resolves
  against — so flexo emits one deterministic id per owner and validates it against that
  owner's `<Tank Id>`s.
- **Export variants copy the built-in template's colliders forward** into the Assets file
  under `Id="flexoInheritedColliders"` — a variant inherits nothing but the Mesh/Material it
  names.

See [colliders.md](colliders.md) and [scope/colliders.md](../scope/colliders.md).

## IVA seats

`<IVASeat>` is legal in the same **four** places `<Collider>` is, and the geometry/GameData
pairs are again functionally identical (the additive `Components` merge). flexo reads both
**Part-level** sites and writes one — every seat is normalised into the GameData document, in
array order, which is KSA's in-game seat cycle order. The SubPart-level pair stays on the
passthrough (`'IVASeat'` is in `KNOWN_PART_GAMEDATA_CHILDREN` only).

```xml
<PartGameData Id="...">
    …
    <IVASeat Id="pilot">                       <!-- only when the user authored an id -->
        <Position X="-0.45" Y="0.42" Z="-0.35"/>
        <ForwardAxis X="1" Y="0" Z="0"/>       <!-- ALWAYS all three axes (see below) -->
        <UpAxis X="0" Y="0" Z="-1"/>
    </IVASeat>
</PartGameData>
```

Rules that differ from the rest of this document:

- ⚠️ **Element-absent and attribute-absent are DIFFERENT defaults.** An entirely absent
  element takes the C# field initializer (`ForwardAxis = (1,0,0)`, `UpAxis = (0,0,-1)`), but a
  *present* element defaults each missing **attribute** to `0` — so `<ForwardAxis/>` is a
  **zero look direction** that NaNs the in-game camera. There is therefore **no omit-at-default
  for a seat's vectors**: `buildIvaSeatElement` writes all three axes of all three elements via
  `buildVec3Attrs` (the shared all-axes writer, also used for the collider frame vectors),
  never the omit-at-default `buildEngineVec3` style. Symmetrically, `ivaSeatsFromElement`
  branches on **element presence** rather than reading attributes with a `(1,0,0)` fallback.
- **The orientation is derived, not stored.** flexo keeps a `Transform.rotation` and converts
  through `src/ksa/ivaSeatAxes.ts` at the boundary; the emitted axes are always **unit**
  vectors (a non-unit `<UpAxis>` silently narrows the game's pitch clamp). Identity rotation
  emits `ForwardAxis X="1"` + `UpAxis Z="-1"` — Core's own authoring.
- **`Id` is emitted only when the user authored one.** Since KSA 2026.8.3.5117 an
  `<EVADoor SeatId>` names the `<IVASeat Id>` a hatch boards
  (`EVADoor.ResolveAlignedSeats` matches the two, skipping empty ids), so a seat a hatch opens
  onto MUST carry it — Core authors one on both capsule seats. flexo's editor-only `_seatN`
  id is still **never** emitted: `TemplateDataBase.Id` shares the namespace
  `<FeedsFrom Container>` resolves against, so only a deliberate, user-authored id belongs
  there. Both halves of the link (`IvaSeat.ksaId`, `evaDoor.seatId`) are optional and are
  omitted when unset, so an unlinked part round-trips byte-for-byte.
- **A degenerate authored pair is dropped on import** (either vector ~zero, or the two
  parallel) with a console warning — the game would build a NaN camera rotation from it.

See [iva-seats.md](iva-seats.md) and
[scope/connectors-coordinates-iva.md](../scope/connectors-coordinates-iva.md).
