# Part XML serialization and parsing

Flexo targets the current KSA content schema. The content loader resolves the files in manifest order through the game’s row inheritance and patch rules before the Part and SubPart readers see them. The readers accept flattened `<Part>` and `<SubPart>` elements; old `PartGameData` and `SubPartGameData` rows are not supported. See [the game contract](../scope/part-and-subpart-xml.md) for the schema and its source anchors.

## Export

`serializePartsXml` writes one `<Part Id>` geometry row per included editor Part. Placements use `SubParts/SubPart Key Ref`, and connectors use `Connectors/Connector Key`. Transform components are omitted at identity; rotation is Euler XYZ in radians, and numbers use `formatG6`. A present `Scale` always supplies all three axes because missing scale axes default to zero in KSA. `CrashTolerance`, when set, is emitted in pascals on the Part row.

`serializeGameDataXml` writes subsequent same-tag `<Part Id Modify="Patch">` and `<SubPart Id Modify="Patch">` rows. Each array uses its declared wrapper with `Modify="Extend"`; connector entries already present in geometry use `Modify="Patch"` by Key. Components, inert masses, engine arrays, editor tags and diameters all have distinct wrappers. Unknown component items are retained separately from unknown row children so they join a single Components array. Template override entries can remain empty to record deletion of inherited gameplay data.

```xml
<Assets>
  <Part Id="Example">
    <SubParts><SubPart Key="body" Ref="ExampleBody" /></SubParts>
    <Connectors><Connector Key="top" /></Connectors>
  </Part>
  <Part Id="Example" Modify="Patch" DisplayName="Example">
    <EditorTags Modify="Extend"><EditorTag Ref="Fuel Tanks" /></EditorTags>
    <Connectors Modify="Extend"><Connector Key="top" Modify="Patch"><Flags>Edge</Flags></Connector></Connectors>
    <Components Modify="Extend">
      <Tank Key="tank"><SphericalTank><Material Ref="Aluminum.2014" Phase="Solid" /></SphericalTank></Tank>
    </Components>
  </Part>
</Assets>
```

`Id` names a top-level asset. `Ref` names another top-level asset. `Key` names a locally keyed object, including a placement or component, and `KeyRef` refers to a local object, optionally scoped to a placement by `SubPart`. The editor retains its existing `instanceId` and module `id` names for those local keys. Absent component keys use the KSA type name. Connector flags are whitespace-separated, including `Edge`; tank affinity can contain any of `Engine`, `Thruster`, `Air`, and `Water`.

Mass, tank and reactant materials use separate `Ref` and `Phase` attributes at the XML boundary. The editor keeps runtime-style phase identifiers such as `Aluminum.2014(s)` internally. Colliders are Components with a nested Colliders array, and each shape has a Key. Gimbals are a separate Gimbals array referencing placements. Engine feeds use FeedsFroms wrappers and child Container or Connector KeyRefs, or `FromParent`. Animation modules reference a top-level file-backed KeyframeAnimation row; tracking and exclusions use placement KeyRefs.

## Import and persistence

The parser consumes the resolved document, preserving unmodeled row data and unmodeled Components items in separate raw XML lists. When importing into an existing editor Part, connector and placement references in raw data are remapped by their reference type. Animation paths are resolved from top-level animation definitions in the same flattened document. Geometry, gameplay data, colliders, lights and seats are read from the same resolved row, rather than overlaid from filename pairs.

The project snapshot schema and compact export versions gate incompatible data. Old project versions are discarded or rejected; they are not converted. Current snapshots default-fill missing fields, including the raw component lists, while retaining fields already present. See [projects](projects.md) and [multi-part export](multi-part.md) for persistence and delivery behavior.

`src/ksa/currentPartXml.test.ts` exercises current wrappers, references, unknown components and geometry/patch resolution. The parser, serializer, project codec and store tests cover additional editable fields and persistence. These tests do not establish that the game has loaded or rendered an exported mod.
