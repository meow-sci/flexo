# Check XML with KSA's managed schema

This optional .NET 10 harness runs the game's actual `ContentPrePass`, native Part
family check and `ContentDeserializer`. It does not load payloads, initialize the
renderer, resolve every global/local runtime reference, or run `OnDataLoad`.
It is an extra local check; licensed game assemblies are not bundled or required
by normal CI.

Generate a corpus from all current renderable stock Parts and exported template copies:

```sh
FLEXO_SCHEMA_OUTPUT_PATH=/tmp/flexo-exported.xml pnpm exec vitest run src/ksa/exportSchema5801.test.ts
```

With a runtime compatible with the game's assembly architecture:

```sh
KSA_ASSEMBLY_DIR=/path/to/current/dll KSA_DEPENDENCY_DIR=/path/to/game dotnet run --project scripts/ksa-schema-check/Validate.csproj -- /tmp/flexo-exported.xml.sources.json
```

The JSON input retains source order and filenames. The harness writes the native
flattened rows beside it as `.native.xml`. Compare element names, attributes, text
and child order against `/tmp/flexo-exported.xml`, ignoring formatting whitespace
and attribute ordering. Passing an XML file directly checks deserialization only.

The 5801 audit ran on an ARM Mac without Rosetta. Its x64 KSA assembly could not load
directly. Temporary Mono.Cecil copies changed assembly architecture metadata to
AnyCPU while preserving managed IL, then ran schema-only code on .NET 10. Original
assemblies and private assets were untouched. This is not running-game validation.
See `plans/KSA_5801_UPGRADE.md` for the exact audit results.
