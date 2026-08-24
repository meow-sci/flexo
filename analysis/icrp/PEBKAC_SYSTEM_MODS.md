# pebkac research — reuse candidates for ICRP's launch-site system-mod export

Repo: `/Users/asherwin/repos/meow-sci/pebkac` (all `src/…` refs below are relative to it).
KSA refs: `/Users/asherwin/repos/meow-sci/ksa-linux/Content` (build 2026.8.22.5348).

## 1. What pebkac is, and what it outputs

**Purpose.** "Problem Exists Between Kitten and Chair": a browser tool that takes a CSV of
celestial bodies (476-body Sol dataset, JPL-derived) and emits one KSA `<System>` XML, optionally
zipped as a mod (`README.md:1-12`, TODOs at `README.md:24-28`).

**Stack / UI / hosting.**
- Astro 5.16 static site + `@astrojs/react` island; React 19, react-aria-components, nanostores
  (+ `@nanostores/persistent`, logger), Monaco (CSV/XML editors), AG Grid (body picker), nuqs
  (tab in URL), jszip + file-saver (`package.json:16-40`; `astro.config.ts:8-12` — `site:
  https://meow.science.fail`, `base: '/pebkac/'`).
- Pages: `src/pages/index.astro` (landing; version stamp `index.astro:252`), `src/pages/builder.astro`
  → `src/components/BuilderPage.tsx:40-101` vertical tabs: Instructions / CSV / Pick Celestials /
  Crafts & Kittenauts / Other / System XML / Installation / Logs.
- Hosting: GitHub Pages via `withastro/action@v5`, Node 24 (`.github/workflows/deploy.yml:19-45`).
- State: single nanostores module `src/state/builder-state.ts` — `$csvData` → `$systemEntries`
  (computed CSV parse, :36-42), `$systemSettings` map (:44-53), `$selectedSystemEntries` (:61),
  `$generatedSystemXml` computed (:67-78) which re-runs the whole generator on every change.
  `$ksaCoreModCelestials` (:26-30) preloads Core XML **at build time** via Vite `?raw` imports
  (:19-20, typed by `types/vite-raw.d.ts:3-6,23-26`). Comment at :27: "Order matters! … first found wins".

**Output: mod folder layout** (`src/ts/zip/ZipDownloadService.ts:24-69`, asserted by
`src/test/zip-download-integration.test.ts:42-65`):
```
<systemId>/            # zip root == mod id == folder name
  System.xml           # the <System> document
  mod.toml
  README.txt           # manifest.toml [[mods]] snippet
```
`mod.toml` (`ZipDownloadService.ts:90-94`) is minimal — exactly three fields:
```toml
name = "<systemId>"
description = "A custom system"
systems = [ "System.xml" ]
```
No `assets = [...]`, no textures, no meshes are ever shipped. README (`:101-109`) tells the user to
add `[[mods]] id="<systemId>" enabled=true` to `%HOME%\Documents\My Games\Kitten Space Agency\manifest.toml`;
the Installation tab (`src/components/builder/InstallationInstructions.tsx:16-71`) says to extract
into `C:\Program Files\Kitten Space Agency\Content`.

**`<System>` XML shape written** (`src/ts/builder/generateSystemXmlRedux.ts:89-167`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<System Id="{systemId}">
  <DisplayName Value="{systemId}"/>                       <!-- :97-99 (variable misnamed loadFromLibraryElement) -->
  <LoadFromLibrary Id="Sol"/>                             <!-- if addSolReference, :127-129 -->
  <LoadVehicleFromLibrary Id="Rocket" Parent="Earth">     <!-- one per craft checkbox, :113-125,131-149 -->
    <SituationRef InstanceOf="RocketStartingSituation"/>
  </LoadVehicleFromLibrary>
  …
  <AtmosphericBody Id="Earth" Parent="Sol"> …full Core clone, mutated… </AtmosphericBody>   <!-- :158-162 -->
  <PlanetaryBody Id="Ceres" Parent="Sol"> …generated from CSV… </PlanetaryBody>
</System>
```
Note: `HomeBody="true"` (present on Core's `<LoadFromLibrary Id="Earth" … HomeBody="true"/>`,
`Content/Core/SolSystem.xml:39`) is **never** emitted by pebkac. `VesselTextures`/`TerrainTextures`
VRAM-estimate blocks (see `examples/MySystem.xml:5-24`) are also not emitted.

**LoadFromLibrary vs inline copies — the core mechanism.** For every selected CSV row
(`generateSystemXmlRedux.ts:40-56`):
1. `findExistingCelestialByIDFromAll` (:66-86) searches the preloaded Core corpora
   (`SolSystem.xml` first, then `Astronomicals.xml`) for an element with the same `Id` attr.
2. If found → **the Core element itself is mutated in place** by
   `transformSystemEntryToKsaXmlIntoElement` (`src/ts/transform/transformSystemEntryToKsaXml.ts:35-96`)
   and then moved into the new document (`generateSystemXmlRedux.ts:158-162`; `doc.importNode(el,true)`'s
   result is discarded and the original node is `appendChild`ed — works because browser DOM adopts).
   So Earth/Luna/Mars etc. are shipped as **full inline copies** of Core's body (element name kept:
   `AtmosphericBody` for Earth even though the CSV says `PlanetaryBody`, `src/data/earth_system_data.csv:4`).
3. If not found → a fresh `<{BODY_TYPE} Id Parent>` element is built (`:16-21,150-159`) with
   `<Orbit DefinitionFrame>` children (SemiMajorAxis Km / Inclination / Eccentricity / LongitudeOfAscendingNode /
   ArgumentOfPeriapsis / TimeAtPeriapsis Days, `:38-59`), `<Rotation DefinitionFrame>` (isTidallyLocked |
   SiderealPeriod, IsRetrograde, Tilt, Azimuth, InitialParentFacingLongitude, `:62-83`), `<MeanRadius Km>`,
   `<Mass Kg>` computed from GM/G (`:87-92,98-103`).
   `addElementWithAttribute` (`:105-125`) removes a same-named existing child first (so CSV orbit data
   overrides Core's), and appends with an ugly literal `"\n    "` text node.
   Only `Sol` (:127-129) is referenced via `<LoadFromLibrary>`; everything else selected is inline.
   **Important consequence:** bodies referenced only as `Parent` but not selected are *not* auto-added
   (except Earth via `forceEarthReference`, `:28-35`).

**Earth specifically.** `forceEarthReference` (default true, `builder-state.ts:47`) always includes
Earth because vehicles default to orbiting it (`generateSystemXmlRedux.ts:27-35`). Earth goes through
the clone-and-mutate path above → a full copy of Core's `<AtmosphericBody Id="Earth" Parent="Sol">`
(bundled snapshot at `src/data/mods/Core/Astronomicals.xml:522`) with the Orbit/Rotation/MeanRadius/Mass
children replaced from CSV. Nothing is renamed — the shipped body still has `Id="Earth"`.
(Given the KSA fact in the brief — duplicate Core Ids in a mod's own `<System>` go to a system-local
lookup and don't collide — this is what makes pebkac's mods load at all.)

**Textures / Paths.** `src/ts/xml/fixPathsToCore.ts:12-47` walks the whole doc and rewrites
every `Path="…"` to `Path="../Core/…"` and every `Id` that *starts with* `"Texture"` to `"../Core/Texture…"`
(git `9680fe0`: "Id attributes which use a path to textures get rewritten"). That is the sole
texture strategy: reference Core's on-disk files relatively from the sibling mod folder. It
never copies textures. It is a blunt regex-free string prefix: it does *not* touch `MeshCollection Id`,
`StaticObject=`, or `Material Id` refs (fine — those are Id lookups, not paths).
The current Core Earth block has 86 `Path="Textures/…"` attrs and 8 `Id="Texture…"` attrs, so
this rule still applies unchanged at 5348.

## 2. Does it author Landmark / City / Crater / Decal / lat-lon?

**No, none of it.** A grep of `src/ts src/components src/state scripts examples` for
`Landmark|IsLaunchPad|StaticObject|Decal|ProceduralModifier|Latitude|Longitude|<City|<Crater` hits
only orbital-element names (`LongitudeOfAscendingNode`, `InitialParentFacingLongitude` —
`SystemEntry.ts:16`, `transformSystemEntryToKsaXml.ts:56,82`). There is no lat/lon UI; the only
form is System ID + two checkboxes (`BuilderSystemSettings.tsx:16-30`) and five craft checkboxes
(`BuilderCrafts.tsx:13-36`). The only way `<Landmark>`/`<City>`/`<Modifier Type="Decal">` reach
pebkac output is **passively**, as untouched children of a cloned Core body. Its bundled Core
snapshot (v2026.3.3.3759) predates launch-pad landmarks entirely: that Earth block has no
`<Landmark>`/`<City>` and no Decal modifier (only Erosion/TilingDetail/Dunes); Venera landmarks
exist on Venus (`src/data/mods/Core/Astronomicals.xml:492-504`).

For reference, the **current** (5348) Core Earth shape ICRP must emit
(`ksa-linux/Content/Core/Astronomicals.xml`):
- Landmark: `:1869-1872`
  ```xml
  <Landmark Id="CCSFS LC-39A" IsLaunchPad="true" StaticObject="CoreLaunchPadA_Prefab_LaunchPadA">
      <Latitude Degrees="28.60829876577433" />
      <Longitude Degrees="-80.60412690984597" />
  </Landmark>
  ```
  Five such landmarks (`:1869-1888`), all binding the same `StaticObject` id; `<City Id>` entries
  precede them (`:1168-1868`) with the same Latitude/Longitude children.
- Terrain decal under `<Terrain><ProceduralModifiers>`: `:734-750`
  ```xml
  <Modifier Type="Decal" Name="LaunchSite_CCSFS-LC-39A" Biomes="Grass,Beach">
      <Amplitude Value="0" /> <Order Value="9999" />
      <Radius Value="275" /> <Rotation Degrees="0" />
      <Location Id = "CCSFS-LC-39A"> <Latitude Degrees="…"/> <Longitude Degrees="…"/> </Location>
      <AltitudeOffset Km="16.97" /> <SmoothFactor Value="0.69" /> <Additive Value="false" />
      <HeightMap Id="Circle" Path="Textures/Planets/_Decals/circle.dds" Category="TerrainHeight"/>
  </Modifier>
  ```
  (Radius 250-400 across the five sites, `:734-808`.)

## 3. Celestial XML model / types (reuse candidates)

There is **no typed celestial model**. Bodies are raw DOM `Element`s; the "schema" is XPath
element names. Modules under `src/ts/` and what they import:

| Module | Purpose | Pure? |
|---|---|---|
| `src/ts/data/CelestialType.ts:1` | `BodyType = "StellarBody"\|"AtmosphericBody"\|"Comet"\|"PlanetaryBody"\|"MinorBody"\|"Asteroid"` (no `TerrestrialBody`, which `examples/mercury.xml:1` uses — stale example) | yes |
| `src/ts/data/SystemEntry.ts:3-28` | CSV row shape (24 string columns) | yes |
| `src/ts/data/SystemSettings.ts:1-15` | systemId + 7 booleans | yes |
| `src/ts/data/ExtractedCelestials.ts:1-16` | `{fileName, doc, StellarBody[], …, allBodies[]}` — Element buckets | yes |
| `src/ts/data/GeneratorContext.ts:1-29` | G constant + info/warn/error log arrays | yes |
| `src/ts/xml/selectCelestialsFromKsaXml.ts:5-39` | **Parser**: `DOMParser` + `xpath.select('.//AtmosphericBody', …)` over any root (System or Assets) → `ExtractedCelestials` | yes (npm `xpath`) |
| `src/ts/builder/generateSystemXmlRedux.ts:23-64,66-86,89-167` | find-Core-body-by-Id + **clone-and-mutate** + `<System>` doc assembly | yes |
| `src/ts/transform/transformSystemEntryToKsaXml.ts:105-125` | `addElementWithAttribute(ctx, doc, parent, replaceExisting, name, attr, value)` — the one generic "upsert child element" helper; `:150-159 createCelestialRootElement` | yes (xpath) |
| `src/ts/xml/fixPathsToCore.ts:12-47` | `../Core/` path prefixer | yes |
| `src/ts/xml/prettifyDocument.ts:5-59`, `collapseXmlDeadspace.ts:3-33`, `serializeDocument.ts:1-7` (`XMLSerializer` + utf-8 preamble), `isXmlNodeTypeGuards.ts:3-16` | formatting/serialization | yes |
| `src/ts/zip/ZipDownloadService.ts` | jszip packager + mod.toml/README strings | yes (jszip) |
| `src/ts/builder/parseCsvIntoSystemEntries.ts:7-11` | udsv CSV parse | **no** — imports `./logger` → `src/state/builder-state.ts` (nanostores + ag-grid types + `?raw` Core XML imports) |

Everything except `parseCsvIntoSystemEntries`/`logger` is framework-free and uses only browser
DOM globals (`DOMParser`, `XMLSerializer`, `new Document()` at `generateSystemXmlRedux.ts:92` —
note this is the *browser* `Document` constructor; in Node it needs jsdom/xmldom, which the
tests supply via `vitest.config.ts:8` `environment: 'jsdom'` + `@xmldom/xmldom`).

**Importability.** No `exports`, no `main`, `"private"` unset, version 0.0.1
(`package.json:1-4`); `tsconfig.json` extends `astro/tsconfigs/strict`, `lib: ["DOM"]`, imports are
extension-less (`import … from "./isXmlNodeTypeGuards"`), so they are **not** Node-24
type-strip compatible and not consumable by relative path from flexo without a bundler
resolving them (Vite would, but crossing repo roots breaks `pnpm`/tsconfig `include` and
flexo's oxlint/oxfmt conventions). Realistically: **copy the ~200 lines you want, not import.**

There is also a "clone a Core body" precedent already in flexo:
`/Users/asherwin/repos/meow-sci/flexo/scripts/build-cartoon-moon.ts:586-604` (`buildBodyXml`) —
a line-oriented text clone of `<PlanetaryBody Id="Luna">` renamed to `Looney`, with the mod.toml
using **both** `assets = ["assets/cartoon_moon.xml"]` (an `<Assets>` bundle holding the body)
and `systems = ["systems/cartoon_sol.xml"]` (`:617-651`). That is the opposite packaging choice
from pebkac (pebkac inlines bodies directly inside `<System>`).

## 4. Sync with KSA updates + documented gotchas

- **Baseline stamp**: a single hand-edited string `game data baked from KSA v2026.3.3.3759`
  (`src/pages/index.astro:252`); commit history shows manual bumps (`5baccaa`, `8f06bbe` 3713,
  `5661081` 3335 "new rings system", `0d8d1a5` 3194 "vehicles get loaded differently"). **Five+
  builds stale vs flexo's 5348 baseline.**
- **Procedure** (`README.md:33-44`): bump the string, copy `Content/Core/Astronomicals.xml` and
  `SolSystem.xml` into `src/data/mods/Core/`. Only those two files; `SolSystemDense.xml`,
  `EarthSystem.xml`, `EarthOnly.xml` (listed in Core `mod.toml:21`) are not snapshotted.
- **No scope catalog, no decomp cross-check, no schema tests.** Tests
  (`src/test/*.test.ts(x)`, vitest + fast-check property tests) cover zip packaging, download button,
  editor-state wiring, browser compat — not XML validity against the game. Kiro spec/steering
  docs in `.kiro/` describe the zip feature only.
- **Gotchas it encodes (code, not docs):** (a) Core corpus search order matters, first-found wins
  (`builder-state.ts:27`); (b) all Core asset `Path`s must be re-rooted `../Core/` from a sibling
  mod folder (`fixPathsToCore.ts:3-8`); (c) `<Orbit DefinitionFrame>`/`<Rotation DefinitionFrame>`
  wrappers since 3194-era (`transformSystemEntryToKsaXml.ts:37,61`); (d) vehicles need
  `<LoadVehicleFromLibrary>` + `<SituationRef InstanceOf="{Id}StartingSituation">`
  (`generateSystemXmlRedux.ts:113-125`); (e) mod id == folder name, enable via user
  `manifest.toml` (`ZipDownloadService.ts:101-109`). Nothing about mesh/material ids, Category
  caps, LOD/`planetMeshes`, first-wins duplicate-drop, or `HomeBody`.

## 5. Tooling conventions; overlap with flexo

- pnpm (`pnpm-lock.yaml`), Astro/Vite, TypeScript 5.9 strict, vitest+jsdom+testing-library+fast-check,
  no linter/formatter configured (no oxlint/eslint/prettier), Bun not used. Node 24 in CI.
- Shares with flexo by convention only: React 19 + react-aria-components + nanostores +
  `@nanostores/react` + lucide-react, native `DOMParser`/`XMLSerializer` (flexo's rule too),
  pnpm. No code is shared; flexo has zero references to pebkac
  (`grep -rli pebkac flexo/{docs,scope,src}` → none). Different authors/style (semicolons, 2-space,
  classes) vs flexo (oxfmt). pebkac uses `?raw` Vite imports of game XML — the same trick flexo's
  ICRP could use for a Core Earth fixture, but flexo policy is "model only the current build"
  so the fixture must be stamped/regenerated per `upgrade-ksa`.

## 6. Recommendation for ICRP's launch-site mod export

**Reuse (copy into `apps/icrp/` or a shared flexo `src/ksa/system/` module; adapt to flexo style,
`.ts`-ext imports, oxfmt):**
1. `selectCelestialsFromKsaXml` pattern (`src/ts/xml/selectCelestialsFromKsaXml.ts`) — but drop the
   `xpath` dep: `doc.querySelector('AtmosphericBody[Id="Earth"]')` / `getElementsByTagName` is enough
   (flexo already parses GameData this way). Keep the "search corpora in order, first hit" idea.
2. The clone-and-mutate + `<System>` assembly shape from `generateSystemXmlRedux.ts:89-167`:
   `<System Id><DisplayName Value/>` + `<LoadFromLibrary Id Parent>` for untouched Core bodies + the
   inline cloned body. Fix: use `doc.importNode(el, true)` **result** (don't mutate the corpus
   element in place — ICRP will re-export repeatedly), and emit `HomeBody="true"` on the Earth entry
   only if the game still keys home-body on the `LoadFromLibrary` attr (it isn't accepted on inline
   bodies — verify in decomp `SystemInfo`).
3. `fixPathsToCore` (`src/ts/xml/fixPathsToCore.ts`) as-is, **but scoped**: apply only to the cloned
   Core subtree, *before* ICRP appends its own `<Landmark>`/`<Modifier Type="Decal">` nodes whose
   `HeightMap Path` may point at ICRP-shipped textures (or at `../Core/Textures/Planets/_Decals/circle.dds`
   — decide per decal). Never run it over the static-asset `<Assets>` XML.
4. `prettifyDocument` + `serializeDocument` (or flexo's existing serializer); `addElementWithAttribute`
   as a generic upsert helper (minus its literal `"\n    "` text nodes).
5. mod.toml + README/manifest.toml text from `ZipDownloadService.ts:90-109` as the **template**; extend
   with `assets = ["assets/<site>.xml"]` for the StaticObject bundle (cf. flexo
   `build-cartoon-moon.ts:617-625`). Keep "mod id == folder name == zip root" (`:38`). flexo already
   has .tar.gz/zip export plumbing — prefer that over jszip.

**Do not reuse:** CSV/udsv/`SystemEntry` orbital transform, nanostores state, AG Grid/Monaco UI,
`GeneratorContext` mass math, the `Texture`-prefixed-Id rule (keep it only if the 8 `Id="Texture…"`
attrs in Core Earth are actually path-resolved; check `TextureReference` in decomp), tests.

**ICRP must add (none of it exists in pebkac):**
- A stamped Core-Earth fixture for 5348 (`Astronomicals.xml:522-1889`) or read the user's install at
  runtime (File System Access API — pebkac's TODO `README.md:28`, never done), plus `upgrade-ksa`
  scope entry so the fixture is diffed per build (pebkac's manual stamp is the anti-pattern).
- Landmark authoring: per site `<Landmark Id IsLaunchPad="true" StaticObject="<ICRP static object id>">
  <Latitude Degrees/><Longitude Degrees/></Landmark>` appended after Core's `<City>`/`<Landmark>` run
  (`:1868-1888`); decide whether to keep or strip Core's five pads (Id collisions inside the cloned
  body are ICRP's to manage — same `Id` twice in one body is undefined).
- Decal authoring: `<Modifier Type="Decal" Name="LaunchSite_<id>" Biomes=… >` with Amplitude 0 /
  Order 9999 / Radius / Rotation / `<Location Id>` lat-lon / AltitudeOffset Km / SmoothFactor /
  Additive false / `<HeightMap Id Path Category="TerrainHeight">` inserted into
  `<Terrain><ProceduralModifiers>` (`:734-750` shape). Lat/lon + radius + biome UI with
  `useNumberDraft` per flexo rules; the `Biomes` filter must match Core's Earth biome names.
- Per-site StaticObject binding: the `StaticObject` attr must equal the `<StaticObject Id>` ICRP
  exports in its `assets=` bundle (flexo `scope/part-and-subpart-xml.md:200`); a single site may
  need N landmarks (one per pad) sharing one static object — mirror Core's 5→1 pattern.
- Export merge: one zip/tar with `mod.toml{name, description, assets=[…], systems=[…]}`,
  `systems/<Id>.xml` (System with cloned Earth + LoadFromLibrary for the rest of Sol — copy the
  current `Content/Core/SolSystem.xml:36-43` list, it changes per build), `assets/*.xml` static-object
  bundle + meshes/KTX2 textures. Remember pebkac's `../Core/` re-rooting assumes the mod is installed
  as a sibling of `Content/Core` — ICRP's install instructions (user `mods/` dir vs `Content/`) decide
  whether that prefix is right; verify against the current loader before copying it.
- Open verification (nothing in pebkac answers these): whether `HomeBody`, vehicle
  `LoadVehicleFromLibrary`, and `<VesselTextures>` blocks are required on a custom system in 5348;
  whether an inline Earth with a system-local Id still resolves `MeshCollection Id="EarthScale"`
  from Core's `planetMeshes`; whether `Category="TerrainHeight"` on the decal `HeightMap` is enforced
  (flexo `scope/ground-clutter.md:255-263` says height textures were retagged `Terrain`→`TerrainHeight`).
