> Companion reference for [KSP_CRAFT_PLAN.md](../KSP_CRAFT_PLAN.md). Extracted from the stock KSP 1.12.5 install (corpus census + fixtures) from local checkouts (.tmp-repos/, .tmp-ksp/) on 2026-07-26; verify against those trees if in doubt.

# Stock KSP Install Survey — grounding for .craft/.mu → GLB converter

Install root: `/Users/asherwin/repos/meow-sci/flexo/.tmp-ksp/ksp` (read-only). Surveyed 2026-07-26.

## 1. Version

- `readme.txt`: **Version 1.12.5** (Unity 2019.2.2f1 per changelog line).
- `buildID.txt`:
  ```
  [config]
  build id = 03190
  2022-12-12 17:09:05 EST
  Branch: master
  language = en-us
  distribution name = Steam
  ```
- This is the final KSP1 release. Root also has `PartDatabase.cfg`, `Physics.cfg`, `Ships/`, `Missions/`, `thumbs/` (craft PNGs), and **empty legacy dirs** `Parts/`, `Internals/`, `Resources/`, `sounds/` (pre-GameData loader era; safe to ignore — everything lives under `GameData/`).

## 2. GameData layout

`GameData/` contains exactly two trees: `Squad` (base game) and `SquadExpansion` (`MakingHistory`, `Serenity` DLCs — present in this install).

Squad top level (depth 1): `Agencies, Alarms, Contracts, Controls, Experience, FX, Flags*, Interiors, KSPedia, Localization, MenuProps, Missions, PartList, Parts, Plugins, Props, Resources, Sounds, Spaces, Strategies, Tutorials, zDeprecated`.

Parts live in `GameData/Squad/Parts/<Category>/<partFolder>/` with cfg + mu + dds side by side (see §9). Categories:

| Category | cfg | mu | dds |
|---|---|---|---|
| Aero | 61 | 63 | 58 |
| Cargo | 10 | 10 | 20 |
| Command | 30 | 30 | 79 |
| CompoundParts | 2 | 2 | 4 |
| Coupling | 8 | 12 | 4 |
| Electrical | 16 | 16 | 26 |
| Engine | 38 | 39 | 99 |
| FuelTank | 49 | 49 | 45 |
| Misc | 6 | 6 | 9 |
| Prebuilt | 5 | 0 | 0 |
| Resources | 12 | 12 | 20 |
| Science | 10 | 10 | 16 |
| Structural | 25 | 26 | 33 |
| Thermal | 6 | 6 | 4 |
| Utility | 70 | 70 | 136 |
| Wheel | 10 | 10 | 17 |

(`Squad/Parts/@thumbs/` = 213 pre-rendered PNG part icons, not textures.)

Totals (`grep -rE '^PART([[:space:]]|\{|$)'` on `*.cfg`; exactly one PART per matching file):

| Tree | cfg files | PART{} defs | .mu | .dds |
|---|---|---|---|---|
| GameData/Squad | 533 | **422** | 551 | 895 |
| GameData/SquadExpansion | 220 | **143** | 151 | 166 |
| — MakingHistory | | 83 | 99 | |
| — Serenity | | 60 | 52 | |

Notes: Squad's 422 includes `Parts/Prebuilt` (flag/kerbalEVA pseudo-parts, no .mu) and `Squad/zDeprecated/` (64 cfgs of retired parts, still loadable, `TechHidden`). `.mu` count > part count because IVA spaces (`Squad/Spaces`, 54 mu) and props (`Squad/Props`, 54 mu) are also .mu, plus multi-variant Assets folders.

## 3. Stock ships

`Ships/VAB`: 23 .craft, `Ships/SPH`: 20 .craft (each with a `.loadmeta` sidecar; thumbnails in root `thumbs/`).

VAB: AeroEquus, Ariane 5, ComSat Lx, Dynawing, GDLV3, Ion-Powered Space Probe, Jumping Flea, Kerbal 1, Kerbal 1-5, Kerbal 2, **Kerbal X**, Learstar A1, Orbiter 1A, Orbiter One, PT Series Munsplorer, Rover + Skycrane, Science Jr, Slim Shuttle, Space Station Core, Super-Heavy Lander, Two-Stage Lander, Viewmatic Survey Satellite, Z-MAP Satellite Launch Kit.
SPH: Aeris 3A, Aeris 4A, Albatross 3, Bug-E Buggy, Crater Crawler, Dove, Gull, Mallard, Osprey, Prospector Rover, Ravenspear Mk1/Mk3/Mk4, Rocket-power VTOL, Satellite Launcher, Skywinder AE1, Stearwing A300, Stratolauncher, Thunderbird, Velociteze.

**Craft `version =` histogram**: 14 × `1.2.0` (all-SPH planes + Viewmatic), 28 × `1.6.0`, 1 × `1.10.0` (Ariane 5). None saved in 1.12 format — parser must accept old craft versions.

**Recommended fixture craft: `Ships/VAB/Kerbal X.craft`** — `version = 1.6.0`, **73 PART blocks**, all stock Squad parts (mk1-3pod, FL-T400/T800 tanks, Rockomax tanks, LV-T45/Mainsail engines, ladders, legs, chutes), 19 of its PART blocks carry ModulePartVariants. Header uses `ship = #autoLOC_501232 //… = Kerbal X` (localization tag + inline comment — parser must strip `//` comments).

**Encoding gotcha**: 7 stock craft (`ComSat Lx`, `Ion-Powered Space Probe`, `Orbiter One`, `Rover + Skycrane`, `Science Jr`, `Space Station Core`, `Z-MAP Satellite Launch Kit`) are **ISO-8859-1, not UTF-8** (high-bit chars in description). BSD grep silently treats them as binary; a TS reader doing strict `utf-8` decode will corrupt/throw. Decode with latin-1 fallback. All craft files are CRLF.

### ModulePartVariants snapshots in stock craft

Yes — 21 of 43 stock craft contain `ModulePartVariants` MODULE snapshots. **The selected variant is stored in the `selectedVariant` key inside the `MODULE { name = ModulePartVariants }` snapshot.** Critical fallback rule: in older-saved craft (e.g. every variant module in Kerbal X, v1.6.0) the module snapshot is present but **`selectedVariant` is absent** → converter must fall back to the part cfg's `baseVariant` (or first VARIANT if no baseVariant).

Verbatim PART block with an explicit `selectedVariant` — `Ships/VAB/AeroEquus.craft`:

```
PART
{
	part = noseCone_4292294842
	partName = Part
	persistentId = 3836572926
	pos = 1.01166475,7.46299314,-1.01166475
	attPos = 0,0,0
	attPos0 = 2.67139453E-14,1.28183746,2.28182387E-07
	rot = -1.77635684E-15,-0.707106829,1.77635684E-15,0.707106948
	attRot = 0,0,0,1
	attRot0 = 1.14048504E-08,-0.923879623,2.75337513E-08,-0.382683396
	mir = 1,1,1
	symMethod = Radial
	autostrutMode = Off
	rigidAttachment = False
	istg = 6
	resPri = 0
	dstg = 6
	sidx = -1
	sqor = -1
	sepI = 5
	attm = 0
	modCost = 0
	modMass = 0
	modSize = 0,0,0
	sym = noseCone_4293293136
	sym = noseCone_4292294930
	sym = noseCone_4292294886
	attN = bottom01,solidBooster.v2_4292299246_0|0|0
	EVENTS
	{
	}
	ACTIONS
	{
	}
	PARTDATA
	{
	}
	MODULE
	{
		name = ModulePartVariants
		isEnabled = True
		useVariantMass = True
		stagingEnabled = True
		selectedVariant = BlackAndWhite
		EVENTS
		{
		}
		ACTIONS
		{
		}
		UPGRADESAPPLIED
		{
		}
	}
}
```

(For contrast, Kerbal X's `fuelTank_4294015818` (FL-T400) block has the same MODULE but no `selectedVariant` line — and also shows `attN = top,pointyNoseConeB_4293954222_0|0.981725|0` node-attach syntax and RESOURCE blocks.)

Other stock selectedVariant values seen: `White`, `ESA` (Ariane 5 Rockomax tanks), `BlackAndWhite`.

## 4. Texture formats

fourCC at DDS byte offset 84:

- Sample of 200 `GameData/Squad` .dds: **158 DXT5, 42 DXT1** — nothing else.
- All 1061 .dds under GameData: **873 DXT5, 188 DXT1**. Zero DX10 headers, zero uncompressed (fourCC=0), zero other codecs.

So a DDS decoder needs exactly **BC1 (DXT1) + BC3 (DXT5)**, plus the KSP convention that DDS files are stored **vertically flipped** (bottom-up) — no DX10/BC5/BC7 path required for stock. Normal maps are DXT5 (Unity-style "DXT5nm" AG-swizzle applies to `_BumpMap`-slot textures).

Leftover legacy formats in stock GameData:
- `.mbm`: **2** — `Squad/Spaces/mk1pod_IVA/pilot Seat.mbm`, `Squad/Spaces/mk2LanderCanInternal/pilot Seat.mbm` (IVA-only; ignorable initially, trivial raw format if ever needed).
- `.tga`: **0**.
- `.truecolor`: **27**, all `Squad/Agencies/*_scaled.truecolor` (agency logos, not parts).
- `.png`: 632 — flags, UI icons, `@thumbs` part icons; not used by part materials.

Bottom line: **for part rendering, DDS DXT1/DXT5 is 100% of the surface.**

## 5. Legacy `mesh =` parts (no MODEL node)

~150 Squad part cfgs still use the legacy `mesh = model.mu` key with no MODEL{} node (all of Science, most Electrical/Resources/Structural, many Command/Engine/Utility). These are the scale-rule fixtures (`rescaleFactor` defaults to **1.25** when absent; MODEL-node parts are unaffected by that quirk unless cfg overrides).

Chosen fixtures:

| part name | cfg path | scale keys present |
|---|---|---|
| `ladder1` (Pegasus I ladder) | `GameData/Squad/Parts/Utility/ladderRadial/ladderRadial.cfg` | neither `scale` nor `rescaleFactor` → defaults (rescaleFactor 1.25) |
| `rtg` | `GameData/Squad/Parts/Electrical/RTG/RTG.cfg` | `scale = 1`, no rescaleFactor → 1.25 |
| `miniFuelTank` (Oscar-B) | `GameData/Squad/Parts/FuelTank/fuelTankOscarB/fuelTankOscarB.cfg` | `rescaleFactor = 1` explicit |

(Also of note: `Misc/PotatoRoid/part.cfg` uses `mesh =` with an asteroid procedural module; old RT-10 is gone — replaced by `Engine/Size1_SRBs/solidBoosterRT-10_v2.cfg` which uses MODEL, see below.)

### Multi-MODEL example (2 MODEL nodes) — `GameData/Squad/Parts/Aero/fairings/fairingSize1.cfg`

```
	MODEL
	{
		model = Squad/Parts/Aero/fairings/fairingSize1
		rotation = 0.0,180,0.0
		TextureNormalURL = Squad/Parts/Aero/fairings/FairingBaseNormals
	}
```
```
	MODEL
	{
		model = Squad/Parts/Aero/fairings/AutoTruss
		scale = 1,1,1
		position = 0.0,0.22,0.0
	}
```
(also 2× MODEL: fairingSize2/3, `Aero/cones/rocketNoseCone_size3.cfg`, `protectiveRocketNoseMk7_v2/_v3.cfg`. Note nonstandard `TextureNormalURL` key in a MODEL node — tolerate unknown keys.)

### MODEL `texture = <placeholder>, <url>` replacement — `GameData/Squad/Parts/Engine/Size1_SRBs/solidBoosterRT-10_v2.cfg`

```
	MODEL
	{
		model = Squad/Parts/Engine/Size1_SRBs/SRB10
		texture = SRB_O, Squad/Parts/Engine/Size1_SRBs/SRB_W
	}
```
First token = texture NAME inside the .mu material (sans extension), second = GameData-relative URL of replacement. More instances: `Structural/stackAdapters/*.cfg`, `Command/probeCoreOcto2_v2` (3 textures incl. specular), `Misc/AsteroidDay/HECS2.cfg`.

## 6. ModulePartVariants in part cfgs

- **Squad: 78 cfgs**, **SquadExpansion: 95 cfgs** contain `ModulePartVariants` (≈ 40% of DLC parts).
- Switching mechanisms inside `VARIANT{}`: `TEXTURE{}` (material property URLs: `mainTextureURL`, `_BumpMap`, …), `GAMEOBJECTS{}` (toggle named transforms true/false), plus cosmetic keys (`primaryColor`…). 20 Squad cfgs use GAMEOBJECTS; 6 use GAMEOBJECTS+TEXTURE together (Rockomax tanks, Mk7 nose cones, probeRoverBody_v2).

Verbatim, from `GameData/Squad/Parts/FuelTank/RockomaxTanks/Rockomax32.cfg` (module header at lines 48-49: `name = ModulePartVariants`, `baseVariant = BlackAndWhite`):

```
		VARIANT
		{
			name = Orange
			displayName = #autoLOC_8007123
			themeName = Orange
			primaryColor = #f49841
			secondaryColor = #4c4f47
			GAMEOBJECTS
			{
				Rockomax_32_White = false
				Rockomax_32_Orange = true
				Rockomax_32_ESA = false
			}
			TEXTURE
			{
				mainTextureURL = Squad/Parts/FuelTank/RockomaxTanks/Assets/rockomax_16 [AlbedoM] O
				_BumpMap = Squad/Parts/FuelTank/RockomaxTanks/Assets/rockomax_16 [Normal]O
			}
		}
```

Gotchas visible here: texture URLs contain **spaces and brackets** (`rockomax_16 [AlbedoM] O.dds`) — URL parsing must take the remainder of the line, not split on whitespace; `TEXTURE` keys are shader property names (`mainTextureURL` aliases `_MainTex`).

## 7. PartDatabase.cfg (install root)

4338 lines; node histogram: 1 `PART_DATABASE`, **505 `PART`**, **506 `DRAG_CUBE`** — it is purely the **drag-cube cache**, regenerated by the game. Each PART has `url = <cfgDir>/<cfgFileNoExt>/<partName>` (e.g. `Squad/Parts/Aero/aerodynamicNoseCone/aerodynamicNoseCone/noseCone`) plus DRAG_CUBE numbers. No model paths, no geometry. Useful to us only as a ready-made **partName → cfg file index** (505 = loadable parts incl. DLC minus Prebuilt oddities); not needed if we index cfgs ourselves. Ignore otherwise.

## 8. IVA (one-liners)

- `GameData/Squad/Spaces/` — 54 .mu IVA interior models + 21 cfgs (INTERNAL definitions); part cfgs reference them via `INTERNAL { name = … }` (16 Squad part cfgs). Root `Internals/` dir is empty. Skip initially.
- `GameData/Squad/Props/` — 54 .mu cockpit prop models + 56 cfgs, instanced by Spaces via PROP nodes. Skip initially.
- SquadExpansion adds 6 more Spaces .mu.

## 9. Folder conventions an implementer must know

1. **Classic pattern**: one folder per part, cfg + .mu + textures side by side; legacy parts literally `mesh = model.mu` + `model000.dds` (auto-bound by the loader to the mu's material texture slots — DDS next to the .mu with matching base names OR positional `model000/model001`).
2. **Revamp pattern (1.4+)**: one folder holds SEVERAL cfgs sharing meshes/texture sheets — e.g. `FuelTank/Size1_Tanks/` = 4 cfgs (T100…T800) + 4 .mu + 5 shared `125Tanks_*.dds`; `RockomaxTanks/`, `Aero/cones/`, `Coupling/` keep meshes in an `Assets/` subfolder referenced by MODEL url.
3. **MODEL url semantics**: GameData-relative, **no extension**, case as on disk; `texture =`/`TEXTURE{}` urls likewise. Same-name texture lookup: replacement textures and variant textures are resolved through the global GameDatabase url space — **cross-folder references are real**, e.g. `GameData/Squad/Parts/Misc/AsteroidDay/HECS2.cfg`:
   ```
   MODEL
   {
   	model = Squad/Parts/Misc/AsteroidDay/HECS2
   	texture = hecsDiffuse, Squad/Parts/Command/probeCoreHex_v2/hecsDiffuse
   	texture = hecsNormal, Squad/Parts/Command/probeCoreHex_v2/hecsNormal	
   }
   ```
   (likewise `probeRoverBody_v2` → `probeCoreCube` textures, `probeCoreOcto2_v2` → `probeCoreOcto_v2`). So the converter needs a **whole-GameData texture URL index**, not per-folder lookup.
4. cfg quirks seen in stock: CRLF everywhere, `//` comments (incl. after values), localization `#autoLOC_…` values, duplicate keys (`PhysicsSignificance` twice in ladderRadial.cfg), trailing whitespace/tabs after values, `MODEL ` with trailing space before newline (Mk1-3 pod), filename with space (`liquidEngineLV-1R _v2.cfg`, `M1-3 Pod.dds`, `pilot Seat.mbm`).
5. `Squad/zDeprecated/Parts/**` still contains loadable old parts (64 cfgs) — include in the index or stock craft from old saves may miss parts (stock ships don't need them).

## 10. Canonical unit-test fixtures

### A. `ladderRadial` — minimal legacy part (recommended primary mu fixture)
- cfg: `GameData/Squad/Parts/Utility/ladderRadial/ladderRadial.cfg` — `name = ladder1`, `mesh = model.mu`, **no `scale`, no `rescaleFactor`** → default rescaleFactor 1.25 applies. Surface-attach only (`attachRules = 0,1,0,0,1`, `node_attach`).
- mu: `GameData/Squad/Parts/Utility/ladderRadial/model.mu` — **12,419 bytes** (smallest interesting real part mesh).
- texture: `model000.dds` — 824 bytes (tiny DXT; positional-name auto-bind example).
- Full folder = exactly those 3 files.

### B. `Mk1-3 pod` — multi-texture MODEL-node part
- cfg: `GameData/Squad/Parts/Command/Mk1-3Pod/mk1-3.cfg` — `name = mk1-3pod`, `scale = 1`, `rescaleFactor = 1`, single MODEL node `model = Squad/Parts/Command/Mk1-3Pod/Mk1-3` (note `MODEL ` trailing space), ModuleColorChanger (emissive anim).
- mu: `Mk1-3.mu` — **190,011 bytes**.
- textures in folder: `M1-3 Pod.dds` (1.4 MB, name contains space) + `M1-3 Pod_GLOW.dds` (350 KB emissive). Textures are bound by name from inside the .mu material list, not by cfg.

### C. `FL-T400` — **uses MODEL, not mesh=** (revamped 1.5 tank, shared-folder pattern + variants)
- cfg: `GameData/Squad/Parts/FuelTank/Size1_Tanks/fuelTankT400.cfg` — `name = fuelTank`, `rescaleFactor = 1.0`,
  ```
  MODEL
  {
  	model = Squad/Parts/FuelTank/Size1_Tanks/Size1Tank_03
  }
  ```
  ModulePartVariants with VARIANTs `BlackAndWhite` (base), `White`, `GrayAndOrange` (TEXTURE-switching against the shared sheets).
- Folder listing (`GameData/Squad/Parts/FuelTank/Size1_Tanks/`): `fuelTankT100.cfg, fuelTankT200.cfg, fuelTankT400.cfg, fuelTankT800.cfg, Size1Tank_01.mu, Size1Tank_02.mu, Size1Tank_03.mu (57,434 B), Size1Tank_04.mu, 125Tanks_BW.dds, 125Tanks_D.dds, 125Tanks_N.dds, 125Tanks_O.dds, 125Tanks_W.dds` (each dds 2.8 MB).
- FL-T400 appears 21× in Kerbal X → tank + variant + resource path is exercised end-to-end by the fixture craft.

## Suggested converter test matrix (from this install)

1. mu parse + default scale: `ladder1` (A).
2. MODEL node + multi-texture + glow: `mk1-3pod` (B).
3. MODEL + shared folder + ModulePartVariants TEXTURE switching: `fuelTank` FL-T400 (C).
4. Multi-MODEL composition + per-MODEL position/rotation/scale: `fairingSize1.cfg`.
5. MODEL texture-replacement + cross-folder texture index: `solidBoosterRT-10_v2.cfg`, `HECS2.cfg`.
6. GAMEOBJECTS variant toggling: `RockomaxTanks/Rockomax32.cfg`.
7. Whole-craft integration: `Ships/VAB/Kerbal X.craft` (73 parts, v1.6.0, variants without `selectedVariant` → baseVariant fallback).
8. Encoding robustness: `Ships/VAB/ComSat Lx.craft` (ISO-8859-1).
