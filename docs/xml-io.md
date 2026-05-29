# Part XML Serialize / Parse

Flexo exports the edited Part to KSA "Assets" Part XML and can parse a Part back
(used by the coordinate calibration and future import). All XML uses built-in DOM
APIs — `@xmldom/xmldom` (browser-compatible, also runs in node tests); no
third-party XML library.

## Serializer — `src/ksa/partXmlSerializer.ts`

`serializePart(part: EditingPart): string` mirrors space-tape's
`PartXmlSerializer.cs`:

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

### GameData document — `serializeGameData(part): string`

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
        <DockingPort ConnectorId="_connector3" Force="600"/>
        <EVADoor ConnectorId="_connector3"/>
    </PartGameData>
</Assets>
```

Every piece is omitted when empty/default. Each project exports both files
(`<Name>Part.xml` + `<Name>GameData.xml`) via `src/ksa/modExport.ts`.

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
`serializeGameData`: it returns the `<PartGameData Id=partId>` block as
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

- `src/ui/PartDataButton.tsx`: the **Part Data** dialog — collapsible sections
  (Identity / Mass / Tanks / Power / Coupling) over `EditingPart.gameData` + the
  Part Id and editor tags. The section editors live in `src/ui/GameDataSections.tsx`;
  numeric fields reuse `PreciseNumberInput` (with `onInteractionStart` to push one
  undo step per typing session). Connectors are **not** here — they're edited in the
  3D workspace, and their flags are three checkboxes in `TransformInspector.tsx`.
- `src/ui/ExportButton.tsx` / `src/ksa/modExport.ts`: write/zip the per-project
  `Part.xml` + `GameData.xml`.

## Tests
- `partXmlSerializer.test.ts` — transform/axis omission + G6 formatting; tags on
  PartGameData (not Part); full GameData (mass, tanks, power, connectors+flags,
  coupling); empty-default omission.
- `formatG6.test.ts` — fixed/exponential cases.
- `partXmlParser.test.ts` — serialize→parse round-trips (placements, connector
  flag arrays, full `gameDataFromAssets`).
