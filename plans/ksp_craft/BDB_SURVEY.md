> Companion reference for [KSP_CRAFT_PLAN.md](../KSP_CRAFT_PLAN.md). Extracted from the Bluedog-Design-Bureau checkout (corpus census + fixtures) from local checkouts (.tmp-repos/, .tmp-ksp/) on 2026-07-26; verify against those trees if in doubt.

# Bluedog Design Bureau (BDB) survey — grounding for a .craft/.mu → GLB converter

Repo: `/Users/asherwin/repos/meow-sci/flexo/.tmp-repos/Bluedog-Design-Bureau`
GameData root: `Gamedata/` (sic). Craft: `Craft Files/` (320 .craft: 190 top-level, 119 in `Advanced (NEEDS SAF AND CD)/`, 11 in `Launchpads (NEEDS MODULAR LAUNCH PADS)/`).
Stock cross-ref: `/Users/asherwin/repos/meow-sci/flexo/.tmp-ksp/ksp/GameData`.
Known counts: 1818 .mu, 2292 .cfg, 1717 .dds, 98 .png, 25 .mbm, 8 .dll.

---

## 1. Gamedata inventory

Top-level entries of `Gamedata/`:

| dir | size | role |
|---|---|---|
| `Bluedog_DB` | **2.4 GB** | the mod itself |
| `Waterfall` | 27 MB | bundled plume-FX mod |
| `SystemHeat` | 2.9 MB | bundled thermal mod |
| `CommunityResourcePack` | 304 KB | bundled resource defs (data-only) |
| `B9PartSwitch` | 252 KB | bundled switcher |
| `ModuleManager.4.2.3.dll` | 140 KB | bundled MM |
| `DMagicScienceAnimate` | 48 KB | bundled science-anim plugin |
| `SimpleAdjustableFairings` | 44 KB | bundled fairing plugin |
| `DeployableEngines` | 16 KB | bundled engine-deploy plugin |

The 8 DLLs (all bundled — yes, B9PartSwitch, ModuleManager and DeployableEngines ship in-repo):

1. `Gamedata/ModuleManager.4.2.3.dll`
2. `Gamedata/B9PartSwitch/Plugins/B9PartSwitch.dll`
3. `Gamedata/Bluedog_DB/Plugins/BDB.dll` (mod's own plugin: ModuleBdbJettison, ModuleBdbBoiloff, …)
4. `Gamedata/Waterfall/Plugins/Waterfall.dll`
5. `Gamedata/SystemHeat/Plugin/SystemHeat.dll`
6. `Gamedata/SimpleAdjustableFairings/Plugins/SimpleAdjustableFairings.dll`
7. `Gamedata/DeployableEngines/Plugins/DeployableEngines.dll`
8. `Gamedata/DMagicScienceAnimate/DMModuleScienceAnimateGeneric.dll`

`Bluedog_DB/` subdirs: `Parts` (the bulk), `Compatibility` (MM patches for ~30 external mods), `OldParts` (12 MB **deprecated-but-still-loaded** parts; one `+PART` clone lives here), `Spaces` (IVAs), `Props`, `FX`, `Patches`, `Flags`, `Suits`, `Sounds`, `Icons`, `Agencies`, `Contracts`, `Resources`, `Versioning`, `Plugins`.

## 2. Fixture selection (Apollo/Saturn/LEM/Lunar candidates, by part count)

```
70 Saturn V.craft            53 Saturn IB Skylab 4        53 Saturn I Pegasus
51 Saturn V-D                51 Saturn C-2                45 Saturn I Blk2 SA-6 AS101
38 Saturn I Blk2 (SA-5)      37 Saturn MLV-S-IB-11_7A     33 Saturn IB
32 Saturn C-4                30 Saturn I Blk1 (C-1)       28 Saturn II INT-18
28 Apollo 17 CSM             27 Saturn M43 (ETS)          26 Saturn A-1
23 Saturn H03 (ETS)          23 J-Class with LRV          22 Saturn INT-21
22 Saturn II INT-17          20 Apollo Block IV           20 Apollo Block III+
19 Apollo Block V            19 Apollo 11 CSM             17 Saturn V-B
17 Clementine                17 Apollo Block III          16 LRV
15 Saturn M02 (ETS)          15 Saturn INT-20             13 Saturn IC (ETS)
12 Apollo 11 MLEM            10 Lunar Orbiter
```

**Recommended primary fixtures** (all paths under `…/Bluedog-Design-Bureau/Craft Files/`):

- **(a) CSM:** `Apollo 11 CSM.craft` — 19 parts, 15 unique, 100 % BDB parts, exercises radial+stack attach, symmetry, multi-MODEL parts, B9PS mesh/paint switches.
- **(b) LM-bearing:** `Apollo 11 MLEM.craft` — 12 parts, 9 unique; it IS the Lunar Module (Ascent cockpit/engine, Descent tanks/engine/legs, MESA, docking cone). Better than `J-Class with LRV.craft` (23 parts, rover-focused) and far better than a 70-part Saturn V for iteration; the Saturn V can be a later stress fixture.
- **(c) smoke test (3 smallest overall):** `Transit 4.craft` — **2 parts** (`bluedog.Transit4A`, `bluedog.RTG.SNAP3`); `Beacon Explorer.craft` — 6 parts; `OSO.craft` — 6 parts. All three pure-BDB.

All fixture craft (a)+(b)+(c) resolve **entirely inside BDB** — zero stock parts, zero MISSING, zero external-mod parts.

## 3. Part resolution tables

All cfg paths are `Gamedata/`-relative. Every referenced `.mu` exists on disk. No fixture part uses a `MODEL { texture = … }` replacement (tex-repl = 0 everywhere). None is an MM `+PART` clone — every name resolves to a literal `PART { name = … }` in its own cfg file.

### Apollo 11 CSM.craft (15 unique parts, craft order)

| craft part name (dots) | defining cfg | MODEL model= URL(s) | .mu ✓ | rescale | tex-repl | inline B9PS (subtypes) |
|---|---|---|---|---|---|---|
| bluedog.Apollo.CrewPod | Bluedog_DB/Parts/Apollo/bluedog_Apollo_CrewPod.cfg | Bluedog_DB/Parts/Apollo/bluedog_Apollo_CrewPod | ✓ | 1 | 0 | 4 (6) |
| bluedog.Apollo.Heatshield | …/bluedog_Apollo_Heatshield.cfg | …/bluedog_Apollo_Heatshield | ✓ | 1 | 0 | 1 (1) |
| bluedog.Apollo.MainChute | …/bluedog_Apollo_MainChute.cfg | …/bluedog_Apollo_MainChute | ✓ | 1 | 0 | 0 |
| bluedog.Apollo.DrogueChute | …/bluedog_Apollo_DrogueChute.cfg | …/bluedog_Apollo_DrogueChute | ✓ | 1 | 0 | 0 |
| bluedog.Apollo.ParachuteCover | …/bluedog_Apollo_ParachuteCover.cfg | …/bluedog_Apollo_ParachuteCover | ✓ | 1.0 | 0 | 2 (2) |
| bluedog.Apollo.ProbeDockingPort | …/bluedog_Apollo_ProbeDockingPort.cfg | …/bluedog_Apollo_ProbeDockingPort | ✓ | 1.0 | 0 | 0 |
| bluedog.Apollo.Decoupler | …/bluedog_Apollo_Decoupler.cfg | …/bluedog_Apollo_Decoupler | ✓ | 1.0 | 0 | 2 (2) |
| bluedog.Apollo.Block2.SM | …/bluedog_Apollo_Block2_SM.cfg | …/bluedog_Apollo_Block2_SM | ✓ | 1 | 0 | 5 (12) |
| bluedog.Apollo.EngineMount | …/bluedog_Apollo_EngineMount.cfg | …/bluedog_Apollo_EngineMount | ✓ | 1.0 | 0 | 2 (6) |
| bluedog.Apollo.DockingSpotlight | …/bluedog_Apollo_DockingSpotlight.cfg | …/bluedog_Apollo_DockingSpotlight | ✓ | 1 | 0 | 1 (1) |
| bluedog.Apollo.EVAFloodlight | …/bluedog_Apollo_EVAFloodlight.cfg | …/bluedog_Apollo_EVAFloodlight | ✓ | 1 | 0 | 1 (1) |
| bluedog.Apollo.ScimitarAntenna | …/bluedog_Apollo_ScimitarAntenna.cfg | …/bluedog_Apollo_ScimitarAntenna | ✓ | 1 | 0 | 1 (3) |
| bluedog.Apollo.Block2.SPS | …/bluedog_Apollo_Block2_SPS.cfg | …/bluedog_Apollo_Block2_SPS | ✓ | 1 | 0 | 0 |
| bluedog.Apollo.Block2.highGain | …/bluedog_Apollo_Block2_highGain.cfg | …/bluedog_Apollo_Block2_highGain | ✓ | 1 | 0 | 0 |
| bluedog.Apollo.RCS.4X | …/bluedog_Apollo_RCS_4X.cfg | **4 MODELs:** …/bluedog_Apollo_RCS_Quad; …/bluedog_Apollo_RCS_45; …/bluedog_Apollo_RCS_RadialQuad; …/bluedog_Apollo_RCS_FX_4X | ✓✓✓✓ | 1.0 | 0 | 2 (4) |

### Apollo 11 MLEM.craft (9 unique parts)

| craft part name | defining cfg | MODEL model= URL(s) | .mu ✓ | rescale | tex-repl | inline B9PS (subtypes) |
|---|---|---|---|---|---|---|
| bluedog.LM.Ascent.Cockpit | Bluedog_DB/Parts/Apollo/bluedog_LM_Ascent_Cockpit.cfg | **2 MODELs:** …/bluedog_LM_Ascent_Cockpit; …/bluedog_LM_RCS | ✓✓ | 1.0 | 0 | 2 (3) |
| bluedog.LM.Ascent.Engine | …/bluedog_LM_Ascent_Engine.cfg | …/bluedog_LM_Ascent_Engine | ✓ | 1.0 | 0 | 1 (2) |
| bluedog.Apollo.ConeDockingPort | …/bluedog_Apollo_ConeDockingPort.cfg | …/bluedog_Apollo_ConeDockingPort | ✓ | 1.0 | 0 | 1 (3) |
| bluedog.LM.Descent.Separator | …/bluedog_LM_Descent_Separator.cfg | …/bluedog_LM_Descent_Separator | ✓ | 1 | 0 | 0 |
| bluedog.LM.Descent.Tanks | …/bluedog_LM_Descent_Tanks.cfg | …/bluedog_LM_Descent_Tanks | ✓ | 1.0 | 0 | 3 (7) |
| bluedog.LM.Descent.Engine | …/bluedog_LM_Descent_Engine.cfg | …/bluedog_LM_Descent_Engine | ✓ | 1.0 | 0 | 2 (4) |
| bluedog.LM.Descent.Leg | …/bluedog_LM_Descent_Leg.cfg | …/bluedog_LM_Descent_Leg | ✓ | 1.0 | 0 | 2 (6) |
| bluedog.LM.MESA | …/bluedog_LM_MESA.cfg | …/bluedog_LM_MESA | ✓ | 1.0 | 0 | 1 (1) |
| bluedog.LM.Goo | …/bluedog_LM_Goo.cfg | …/bluedog_LM_Goo | ✓ | 1.0 | 0 | 0 |

**Stock parts needed by fixtures: NONE.** Across all 320 craft, non-BDB parts do appear: stock `Tube2`, `EnginePlate2/3` (SquadExpansion/MakingHistory), `fuelLine`, `strutConnector`, `RCSLinearSmall` (Squad), plus external-mod parts `conformaldecals-flag/-text` (364 uses) and `AM.MLP.*` (Modular Launch Pads) — those live in the two clearly-labeled subdirectories and a handful of top-level craft. Verified stock cfg examples: `SquadExpansion/MakingHistory/Parts/Structural/Tube2.cfg`, `Squad/Parts/CompoundParts/FuelLine/fuelLine.cfg`.

## 4. Craft file anatomy

`version = 1.12.3` in **all 190** top-level craft. Files are **CRLF** (ASCII, Windows line endings).

### (a) Full header of `Apollo 11 CSM.craft` (everything before first PART)

```
ship = Apollo 11 CSM
version = 1.12.3
description = 
type = VAB
size = 26.5119476,38.4102554,22.921917
steamPublishedFileId = 0
persistentId = 2529274909
rot = 0,0,0,0
missionFlag = Squad/Flags/default
vesselType = Debris
OverrideDefault = False,False,False,False
OverrideActionControl = 0,0,0,0
OverrideAxisControl = 0,0,0,0
OverrideGroupNames = ,,,
```

### (b) One complete PART block (EVAFloodlight, trimmed of nothing)

```
PART
{
	part = bluedog.Apollo.EVAFloodlight_4292855286
	partName = Part
	persistentId = 3358965404
	pos = 1.19461381,14.2790051,-0.350949675
	attPos = 0,0,0
	attPos0 = 1.19461381,0.10413456,-0.350949675
	rot = -3.59325417E-11,0.831469655,5.37768545E-11,0.555570185
	attRot = 0,0,0,1
	attRot0 = -3.59325417E-11,0.831469655,5.37768545E-11,0.555570185
	mir = 1,1,1
	symMethod = Radial
	autostrutMode = Off
	rigidAttachment = False
	istg = 1
	resPri = 0
	dstg = 2
	sidx = -1
	sqor = -1
	sepI = -1
	attm = 1
	sameVesselCollision = False
	modCost = 0
	modMass = 0
	modSize = 0,0,0
	srfN = srfAttach,bluedog.Apollo.Decoupler_4292898372,pCylinder159_COLLIDER3,0|0|-0.0120000001,0|0|1,0|0|-0.0120000001
	EVENTS
	{
	}
	ACTIONS
	{
		ToggleSameVesselInteraction
		{
			actionGroup = None
		}
		SetSameVesselInteraction
		{
			actionGroup = None
		}
		RemoveSameVesselInteraction
		{
			actionGroup = None
		}
	}
	PARTDATA
	{
	}
	MODULE
	{
		name = ModuleAnimateGeneric
		isEnabled = True
		aniState = LOCKED
		animSwitch = True
		animTime = 0
		animSpeed = -10
		deployPercent = 100
		animationIsDisabled = False
		stagingEnabled = True
		EVENTS
		{
		}
		ACTIONS
		{
			ToggleAction
			{
				actionGroup = Light
			}
		}
		AXISGROUPS
		{
			…
		}
		UPGRADESAPPLIED
		{
		}
	}
	MODULE
	{
		name = ModuleB9PartSwitch
		isEnabled = True
		stagingEnabled = True
		moduleID = textureSwitchPaint
		currentSubtype = Default
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
	MODULE
	{
		name = ModuleB9PartInfo
		isEnabled = False
		stagingEnabled = True
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

(The `AXISGROUPS` interior elided here only for the report; on disk it is a `deployPercent { axisGroup = None … }` block.)

### (c) B9PartSwitch craft snapshot — how the chosen subtype is stored

The in-craft module stores **`moduleID` + `currentSubtype = <subtype NAME string>`** (not an index):

```
MODULE
{
	name = ModuleB9PartSwitch
	moduleID = textureSwitchPaint
	currentSubtype = Default
	…
}
```

Subtype names can *look* numeric — the RCS quad craft snapshot has `moduleID = realnameRCSSwitch / currentSubtype = 4`, and the part cfg literally declares `SUBTYPE { name = 4 … }` (also `4/45`, `4R`). Match as strings. (B9PS also supports `subtypeIndex`, not observed in these craft.)

### Coordinates / symmetry

- `pos`/`rot` are **vessel-absolute** (VAB space): root part sits at `pos = 0,15,0`; the floodlight above shows `pos.y = 14.279` while `attPos0.y = 0.104` (parent-relative attach offset). Converters can place each PART directly from `pos` + `rot` (quaternion x,y,z,w) and ignore the attach bookkeeping.
- `mir = 1,1,1` for **all 4081** PART instances across every craft — mirrored *geometry* never occurs. `symMethod` histogram: 3781 `Radial`, 307 `Mirror` (Mirror affects editor placement only; `mir` stays 1,1,1).
- `attN` format (per-node): `attN = <nodeId>,<partRef>_<pos>_<axis>_<pos0>_<axis0>` with `|`-separated vector components and `Null` for open nodes, e.g.
  `attN = bottom,bluedog.Apollo.Heatshield_4292957908_0|-0.595269978|0_0|-1|0_0|-0.595269978|0_0|-1|0` — note the part reference itself contains `_<uid>`, so split carefully.
- `srfN` can reference a **collider name from the .mu** (`pCylinder159_COLLIDER3` above).

## 5. B9PartSwitch usage

### Representative SUBTYPE — transform + node toggling (bluedog_Apollo_Block2_SM.cfg)

```
	MODULE
	{
		name = ModuleB9PartSwitch
		moduleID = meshSwitchSIMbay
		uiGroupName = SIMBay
		uiGroupDisplayName = SIM Bay
		switcherDescription = SIM Bay Configuration
		switcherDescriptionPlural = SIM Bay Configurations
		affectDragCubes = False
		affectFARVoxels = False
		SUBTYPE
		{
			name = Historical
			transform = SIMbayHistorical
			node = mappingCam
			node = panoCam
			node = subSatDisp
			node = IRradiometer
			node = SARrecorder
			node = UVspec
			node = GRS
			node = massSpec
			node = xrayAlpha
		}
		SUBTYPE
		{
			name = Empty
			transform = simBayBare
		}
		SUBTYPE
		{
			name = Universal Storage
			transform = SimBayUS2
			node = US2_node1
			node = US2_node2
			node = US2_node3
			node = US2_node4
		}
	}
```

Semantics the converter must reproduce: each SUBTYPE lists model **transforms to enable**; any transform named by *some* subtype of the module but not by the current one is disabled. `node =` toggles attach-node availability (geometry-irrelevant).

### Representative SUBTYPE — TEXTURE switching (Bluedog_DB/Parts/Centaur/Paint/White/paint.cfg)

```
@PART[bluedog_CentaurIII_FuelTank]:FOR[Bluedog_DB]
{
	@MODULE[ModuleB9PartSwitch]:HAS[#moduleID[textureSwitchPaint]]
	{
		SUBTYPE
		{
			name = White
			primaryColor = White
			secondaryColor = White
			…
			TEXTURE
			{
				texture = Bluedog_DB/Parts/Centaur/Paint/White/bluedog_CentaurIII_Tank_White
				transform = Centaur_II_Mesh
				transform = Centaur_III_Mesh
			}
			TEXTURE
			{
				texture = Bluedog_DB/Parts/Centaur/Paint/White/bluedog_CentaurIII_Tank_White_NRM
				isNormalMap = true
				transform = Centaur_II_Mesh
				transform = Centaur_III_Mesh
			}
		}
	}
}
```

TEXTURE keys seen: `texture =` (GameData-relative path, no extension), `isNormalMap = true`, repeatable `transform =` scoping. No `currentTextureName` key exists anywhere in Gamedata.

### Companion module — permanently hidden transforms

`bluedog_Apollo_CrewPod.cfg` (and others) rely on **`ModuleB9DisableTransform`** to hide alternate meshes baked into the .mu:

```
	MODULE
	{
		name = ModuleB9DisableTransform
		transform = Painted
	}
```

(CrewPod hides `Painted`, `colorswitch_skylab`, `colorswitch_bp`.) A converter that ignores this renders overlapping duplicate meshes. Also note stock `MODULE { name = ModuleJettison }`-style shroud hiding wasn't surveyed part-by-part, but BDB has its own `ModuleBdbJettison` on the SM (engine-shroud logic).

### Global stats (all Gamedata cfgs)

- Files containing `ModuleB9PartSwitch`: **825** (of 2292 cfgs)
- `SUBTYPE` blocks: **~3318**
- SUBTYPE-level `transform =` keys (excluding NODE/TEXTURE/MODEL contexts): **~3004**
- `node =` keys in subtypes: **~450**
- `TEXTURE` blocks under Bluedog_DB: **~1035** (720 `texture =` lines inside TEXTURE blocks Gamedata-wide; the remainder of the raw 1474 TEXTURE-line count is Waterfall's unrelated TEXTURE nodes)
- B9PS `MODEL` feature inside SUBTYPE: **0 occurrences** — BDB never adds models via subtypes. Mesh variance is 100 % transform-toggling.

## 6. ModuleManager patches inside BDB

- cfg files containing `@PART`: **445**; containing `+PART`: **4**
- Feature histogram (occurrences across all Gamedata cfgs):

```
:NEEDS[   2644      :FOR[    578      :AFTER[  559      :BEFORE[ 162
:FINAL       4      :HAS[   1631      #$      1463      @MODULE 1100
!MODULE    787      %MODULE  980      PART[*    54      [Bluedog* 1
```

- The 4 `+PART` files: `Compatibility/ProceduralFairings/bdb_pf_side.cfg`, `…/bdb_pf.cfg` (`:NEEDS[ProceduralFairings]` — inert), `Compatibility/SpaceDust/SpaceDust.cfg` (`:NEEDS[SpaceDust]` — inert), `OldParts/Atlas/bluedog_Atlas_Decoupler1875m.cfg` (clones an old Atlas decoupler; not used by fixtures).

### CRITICAL fixture-impact answers

1. **No fixture part is a `+PART` clone.** All 24 unique fixture names are literal `PART{}` definitions in their own cfg files (§3).
2. **One selected switcher module IS added by a separate MM patch:** `moduleID = fuelSwitch` (selected as `LF/O` on Block2 SM, LM Ascent Cockpit, LM Descent Tanks) does not exist in those part cfgs. It is mass-generated by `Bluedog_DB/Compatibility/B9PartSwitch/B9PartSwitchTanks.cfg` via wildcard `@PART[bluedog*,Bluedog*]:HAS[…]:NEEDS[B9PartSwitch]:FOR[Bluedog_DB_1]`. B9PartSwitch is bundled ⇒ patch is ACTIVE in-game. **However it is resource-only (tank contents)** — no transform/TEXTURE — so a geometry converter can safely ignore unresolvable `fuelSwitch` selections.
3. Every other selected `moduleID` was sample-verified inline (8/8): EngineMount `meshSwitch`, ScimitarAntenna `meshSwitch`, LM Tanks `deflectorSwitch`+`roverSwitch`, LM Leg `legSwitch`, LM Ascent Engine `variantSwitch`, LM Descent Engine `engineSwitch`, LM Cockpit `configSwitch` — plus CSM's `configSwitch`/`meshSwitchSIMbay`/`meshSwitchNodes`/`ReentryCoM`/`Probecore`/`realnameRCSSwitch`/paint modules.
4. **Paint subtypes are patch-added but unused by fixtures.** `Bluedog_DB/Parts/Apollo/Paint/{Apollo7,ASTP,BP,Silver,Skylab,White}/paint.cfg` append TEXTURE subtypes to `@PART[bluedog_Apollo_CrewPod*]`, Heatshield, Decoupler, EngineMount, `RCS*`, spotlights, `bluedog_LM_*` etc. (`:FOR[Bluedog_DB]`, no external NEEDS ⇒ active). Both fixture craft always select `currentSubtype = Default`, which is defined **inline**, so fixtures render correctly with zero MM evaluation.
5. Other active patches touching fixture parts only add non-visual modules: `Compatibility/WaterfallFX/Apollo.cfg`+`ApolloRCS.cfg` (`:NEEDS[Waterfall]`, bundled ⇒ active; replaces EFFECTS/adds ModuleWaterfallFX — engine plumes, no MODEL/TEXTURE lines), `Compatibility/SystemHeat/SH_Apollo.cfg` (bundled ⇒ active, thermal modules). Inert-by-NEEDS patches that name fixture parts: TweakScale (638 NEEDS hits), RealAntennas, RealChute, USI-LS, TAC-LS, EngineIgnitor, SCANsat, KIS, RemoteTech, ConnectedLivingSpace, NeptuneCamera, CTT, RealPlume (`zRealPlume`), TexturesUnlimited (`TU/paint.cfg`), Snacks, VABOrganizer etc. — none of these mods are present.
6. MM syntax also appears **inside base part cfgs on individual keys**, e.g. `bluedog_Apollo_Block2_SM.cfg` line 244: `parentID:NEEDS[!RealFuels] = fuelSwitch` — a plain cfg parser must tolerate (or strip) `:NEEDS[...]`-suffixed key names inside PART blocks.

## 7. Texture formats

- **DDS fourCC** (sample of 282 of 1717, every 6th file): `DXT5` ×231 (82 %), `DXT1` ×51 (18 %), **DX10: 0, uncompressed: 0**. So BC3+BC1 decode covers all BDB DDS.
- **MBM**: all 25 inside `Bluedog_DB` — `FX/FX_New` (6), `Parts/ProbeExpansion/Mariner` (5), `…/Viking` (4), `Parts/Saturn` (1 — the 16 MB `bluedog_Saturn_S1D.mbm`!), `Parts/Solids/UpperSolids` (2), `Props/FallenKerbonaut` (3), `Props/science` (4). Header of `FX/FX_New/zSoft.mbm`:
  ```
  00000000: 034b 5350 0001 0000 0001 0000 0000 0000  .KSP............
  00000010: 1800 0000
  ```
  = magic `\x03KSP`, u32 width 256, u32 height 256, u32 type 0, u32 bpp 24, then raw pixels — the classic KSP MBM layout.
- **PNG (98)**: decals/UI/props, not part skins — `Compatibility/ConformalDecals` (19), `Props/Monitor` (12, IVA), `FX/FX_New` (10), `SystemHeat/UI` (7), `Suits/Icons` (6), flags/posters/photography, 2 in `Spaces/Apollo` (IVA). Part exteriors are DDS-only.
- **5 largest textures**: `Parts/Saturn/bluedog_Saturn_S1D.mbm` 16.8 MB; then four 11.2 MB DDS: `Parts/AtlasV/bluedog_AtlasV_CCB_NRM.dds`, `…CCB.dds`, `Parts/AtlasV/Paint/White/bluedog_AtlasV_CCB_whiteBlack.dds`, `…CCB_white.dds`.
- **Suffix conventions** (basename endings across dds+png): `_NRM` ×481 (+`_nrm` 5, `_NRM_baked` 2) for normal maps; `_Emit`/`_EMIT`/`_emit` ×84 + `_Emissive`/`_glow` for emissives; `_SPEC`/`_Spec`/`_spec` ×41; `_AO`/`_ao` ×4. No height-map convention observed.

## 8. Scale usage

- **`rescaleFactor =` histogram** (all Gamedata cfgs): `1` ×1127, `1.0` ×344/`1.00` ×2 — but **non-unity values exist and must be honored**: `0.7` ×28, `1.1` ×6, `0.883` ×6, `1.25` ×5, `0.8` ×2, and singletons `1.66666667`, `1.4`, `1.2`, `0.95`, `0.9375`, `0.917`, `0.75`, `0.625`. One value carries an inline comment: `rescaleFactor = 0.75 //They looked too big in game. …` ⇒ strip `//` comments after values.
  **KSP quirk:** when the key is absent, the engine default is **1.25**, and MODEL-node `scale` multiplies with it — BDB writes `= 1` explicitly on nearly every part for exactly this reason; stock Squad parts frequently omit it (⇒ 1.25).
- **Legacy `mesh =` in PART cfgs: effectively zero.** The only 4 files with a `mesh =` key are TexturesUnlimited/Shaddy shader configs (`Compatibility/Shaddy/{Parachutes,Solar}.cfg`, `Compatibility/TU/ShinyApollo.cfg`, `Parts/Skylab/TexturesUnlimited/Skylab_TU.cfg`) where `mesh` is a KSPShader key, not part geometry. Every BDB part uses `MODEL {}`.
- **Multiple MODEL nodes:** 144 cfgs under `Bluedog_DB/Parts` have ≥2 `MODEL` blocks (1892 `model =` keys Gamedata-wide). Fixture examples: `bluedog_Apollo_RCS_4X` (4 models), `bluedog_LM_Ascent_Cockpit` (2).
- **MODEL-node `scale`:** usually `1`/`1.0`; vector form appears (`1.2,1.2,1.2` ×~16, `1.5,1.5,1.5` ×6, `0.8, 0.8, 0.8` ×4 — note spaces after commas, `0.75,0.75,0.75` ×4). PART-level `scale =` (nodes-only semantic) is almost always `1`.
- **`MODEL { texture = … }` replacement:** ~10-11 occurrences total, none on fixture parts; all in TU/Shaddy compat or IVA spaces. Two verbatim examples (two-comma-value form `placeholder , newURL`; note **spaces around the comma**):
  ```
  MODEL
  {
  	model = Squad/Props/Monitor/MonitorDockingMode
  	texture = Emissives , Squad/Props/Monitor/Emissives
  	texture = Emissives_glow , Bluedog_DB/Props/Monitor/Emissives_glow
  	texture = Monitor , Squad/Props/Monitor/Monitor
  }
  ```
  ```
  texture = _MetallicGlossMap, Bluedog_DB/Compatibility/TU/bluedog_Apollo_CM_TU
  texture = _AOMap, Bluedog_DB/Compatibility/TU/bluedog_Apollo_CM_TU
  ```
  (the TU form abuses the slot name as a shader-property name — first token is normally the *source texture basename* to replace).

## 9. Implementer gotchas (the list that will save you)

1. **Underscore→dot rename:** cfg `name = bluedog_Apollo_CrewPod` (underscores); craft `part = bluedog.Apollo.CrewPod_4292980418` (dots + `_<uid>`). KSP's PartLoader replaces `_` with `.` in part names at compile time. Resolution rule: strip trailing `_<digits>`, then compare craft name against cfg name with `_`→`.` applied (or normalize both). Stock parts without underscores match as-is.
2. **Encodings:** craft files are CRLF; many part cfgs are CRLF **and some start with a UTF-8 BOM** (e.g. `bluedog_Apollo_MainChute.cfg`, `bluedog_LM_Descent_Leg.cfg`) — `^PART` regexes fail on line 1 unless BOM-stripped.
3. **cfg dialect:** `//` comments (full-line and trailing, even after numeric values); MM `:NEEDS[...]` suffixes on *keys inside base part cfgs* (`parentID:NEEDS[!RealFuels] = fuelSwitch`); commented-out `@PART` lines exist; block open brace may be on its own line; multi-target `@PART[a,b,c]` and wildcard `@PART[bluedog_Apollo_CrewPod*]` selectors in patch files.
4. **Attach nodes from model transforms:** parts define `NODE { transform = mainChute_NODE … }` blocks — node positions come from .mu transforms, not `node_stack_*` literals (both forms exist; MainChute's old `node_stack_bottom` is commented out).
5. **B9PS mesh logic is mandatory:** enable current subtype's `transform` list, hide transforms owned by sibling subtypes, and always apply `ModuleB9DisableTransform`. Without this the CrewPod/SM/LM render overlapping variant meshes. TEXTURE swaps only matter if a craft selects a non-Default paint (fixtures don't).
6. **Subtype identity is the name string** (`currentSubtype = 4` is a name, not an index).
7. **No mirrored geometry anywhere** (`mir` always 1,1,1) — skip mirror handling for BDB.
8. **`rescaleFactor` default is 1.25 when absent**; non-unity values occur in BDB (0.625–1.667). MODEL `scale` can be scalar or 3-vector with stray spaces.
9. **Duplicate names:** none among PARTs (the sole repeat, `bluedog_SurveyorOrbiterUpgrade` in `Parts/ProbeExpansion/Surveyor/Upgrades.cfg`, is a PART + its PARTUPGRADE sharing a name — filter by node type).
10. **Deprecated parts still load:** `Bluedog_DB/OldParts/` (12 MB) is inside GameData; old craft may reference it.
11. **Craft subdirs need external mods** (`Advanced (NEEDS SAF AND CD)` = SimpleAdjustableFairings — bundled — plus ConformalDecals — absent; `Launchpads…` = Modular Launch Pads — absent). Top-level craft are safe; only some use the 5 stock parts listed in §3.
12. **Localization:** no `#autoLOC`/localized part references in craft `part =` keys; `title =` display names are irrelevant to resolution.
13. `srfN` may name a **collider from the .mu** (`pCylinder159_COLLIDER3`) — harmless for placement (use `pos`/`rot`), but don't choke parsing it.
14. Waterfall/SystemHeat/B9PartSwitch/CRP/DeployableEngines/SAF/DMagic are **bundled**, so `:NEEDS` on them are ACTIVE; the long tail of Compatibility patches (TweakScale ×638, RealAntennas, RealPlume, TU, LS mods…) is inert in a stock+BDB install.
