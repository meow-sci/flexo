# Flexo Calculators — Plan

A floating **Calculators** window, opened from the burger menu, that helps players estimate
realistic values (mostly **mass**) when authoring parts. It floats above *everything*
(including the Part Data popup and other dialogs) so a player can compute a number in the
calculator and type/paste it straight into a game-data field.

This is a **review document**: the calculator catalog below is a menu of ideas grouped by how
trustworthy each one is. Decide which to keep / cut / add, then we implement the chosen subset.

---

## 1. Goals & principles

- **Mass first.** The request is mass estimation. Everything else (performance, power) is a bonus
  and clearly labeled optional/stretch.
- **Exact where we can be.** Some quantities are computed by the game from a known formula
  (cylindrical & spherical tank structure mass, primitive solid/hollow geometry mass, propellant
  mass from volume × density). For these, flexo can be **pixel-accurate to the game** because we've
  recovered the exact C# formulas from the decomp.
- **Honest where we can't.** Engine mass, battery mass, solar-panel mass, crew-module contents are
  **not** computed procedurally by the game — they're author-specified. For these we give
  engineering heuristics from real spaceflight data, visibly badged as **estimates** with the
  assumptions shown.
- **Frictionless transfer.** Every result has a one-click **Copy** (and where unit-appropriate, a
  "copy in mm / kg / Wh" matching the field it'll go into) so it can be dropped into the Part Data
  popup without retyping. The window stays open and on top while you do it.
- **Reuse the design system.** Built from `src/ui/kit` (Select, PreciseNumberInput, Button,
  Tooltip), Tailwind tokens, draggable like `FloatingInspector`, position persisted via nanostores.

---

## 2. Source-of-truth: formulas & data recovered from the game

All confirmed against the decompiled C# at `ksa-game-assemblies/current/decomp` and game content at
`Content/Core/Substances.xml` / `assets/Combustion.xml`.

### 2.1 Mass primitives (`MassGeometry.cs`) — `mass = density × volume`

| Shape | Volume formula | Used by |
|---|---|---|
| Solid sphere | `(4π/3)·r³`  (game constant `4.1887903`) | nose weights, RCS balls |
| Hollow sphere | `(4π/3)·(R³ − Rᵢ³)`, `Rᵢ = R − t` | spherical tank shell |
| Solid cylinder | `π·r²·h` | slugs, solid rod |
| Hollow open cylinder | `π·(R² − Rᵢ²)·h`, `Rᵢ = R − t` | tank barrel, tube |
| Solid cone | `(π/3)·r²·h` | nose cone (solid) |
| Solid truncated cone | big cone − small cone | adapters/transitions |
| Solid cuboid | `Lx·Ly·Lz` | plates, boxes |
| Hollow cuboid | outer − inner (inner shrinks by `2t` each axis) | boxes/shrouds |
| Solid semi-ellipsoid | `(2π/3)·ry·rz·h` | tank dome (internal) |
| Hollow open semi-ellipsoid | outer − inner semi-ellipsoid | tank dome (shell) |

Density precedence (`AsmbVolumetricMassTemplate.GetMassFromVolume`): **Material id → density lookup**,
else **explicit Density**, else **fixed Mass**.

### 2.2 Cylindrical tank (`TankGeometry.ComputeCylindricalTank`)

Inputs: `length L`, `outerRadius R`, `wallThickness t`, `domeHeightFraction f` (default **1/√2 ≈
0.70710678**). Domes are **semi-ellipsoids** of height `domeHeight = R·f` (NOTE: dome height scales
with **radius**, not length — confirmed in decomp).

```
domeHeight d = R · f
barrelLen   b = L − 2d            (clamped: L ≥ 2d, etc.)
Ri = R − t        (inner radius)
di = d − t        (inner dome height)

structureVolume = hollowOpenCylinder(b, R, t)
                + 2 × hollowOpenSemiEllipsoid(d, R, R, t)
storageVolume   = solidCylinder(b, Ri)
                + 2 × solidSemiEllipsoid(di, Ri, Ri)

dryMass         = materialDensity × structureVolume
propellantMass  = propellantDensity × storageVolume     (if a propellant is chosen)
wetMass         = dryMass + propellantMass
```

This matches the game's tank exactly (same clamps, same constants). **High confidence / "accurate".**

### 2.3 Spherical tank (`TankGeometry.ComputeSphericalTank`)

```
structureVolume = hollowSphere(R, t)        = (4π/3)·(R³ − (R−t)³)
storageVolume   = solidSphere(R − t)        = (4π/3)·(R−t)³
dryMass         = materialDensity × structureVolume
propellantMass  = propellantDensity × storageVolume
```

**High confidence / "accurate".**

### 2.4 Materials (solids) — `Content/Core/Substances.xml`

The game ships **exactly one** structural solid:

| Material id | Density |
|---|---|
| `Aluminum.2014(s)` | **2800 kg/m³** (2.8 g/cm³) |

> Implication: to match in-game mass, tank walls are aluminum. The calculator will **default to
> Aluminum 2014** and additionally offer a few **reference "what-if" densities** (stainless steel
> ~7900, titanium Ti-6Al-4V ~4430, CFRP ~1600, Al-Li ~2700) clearly badged *"not an in-game
> material — estimate only."* This lets players sanity-check designs without implying those
> materials exist in the sim. **(Decision point — keep what-if list or aluminum-only? See §7.)**

### 2.5 Propellants (liquids) — densities for fill/wet-mass

| Substance | Density (kg/m³) |
|---|---|
| H2 (LH₂, liquid) | 70.85 |
| O2 (LOX, liquid) | 1141 |
| Kerosene (RP-1) | 805.41 |
| N2O4 (NTO) | 1442.46 |
| N2H4 (Hydrazine) | 1021 |
| CH6N2 (MMH) | 875.7 |
| C2H8N2 (UDMH) | 791 |
| Nepetalactone (catnip 😼) | 1066.3 |
| Actinidine (catnip) | 944 |

### 2.6 Combustion mixtures — `assets/Combustion.xml` (for fuel/oxidizer split)

Each `CombustionProcess` lists reactants with `MassShare`, e.g. `Hydrolox_5.5` = H2(l):1 + O2(l):5.5.
Given a total propellant mass we can split it into per-reactant masses and per-reactant **volumes**
(via §2.5 densities) — useful for "how big must my LH₂ vs LOX tanks be for a 5.5:1 mixture."

---

## 3. Calculator catalog (the menu)

Grouped by trust tier. Each entry: inputs → outputs, and the basis.

### Tier A — Exact (matches the game's own math)

**A1. Cylindrical Tank Mass** ⭐ (flagship)
- Inputs: Length (m), Outer radius (m), Wall thickness (mm), Dome height fraction (default 1/√2),
  Material (default Aluminum 2014), optional Propellant.
- Outputs: **Dry/structure mass (kg)**, **internal storage volume (L / m³)**, **propellant mass
  (kg)** & **wet mass (kg)** if a propellant is selected, plus barrel length & inner radius for
  reference.
- Basis: §2.2. Mirrors the live tank you'd author in Manage Tanks — effectively a mass preview.

**A2. Spherical Tank Mass** ⭐
- Inputs: Outer radius (m), Wall thickness (mm), Material, optional Propellant.
- Outputs: dry mass, internal volume, propellant mass, wet mass.
- Basis: §2.3.

**A3. Primitive Geometry Mass** (the "anything-else structural" calculator)
- Inputs: Shape (solid/hollow: sphere, cylinder, cone, truncated cone, cuboid, semi-ellipsoid),
  the shape's dimensions, wall thickness (hollow shapes), and Material **or** explicit density.
- Outputs: Volume, **mass (kg)**, and **mass-specific PMI (Ixx/Iyy/Izz)** — the same numbers the
  game would compute for an `InertMass`, so this doubles as a `CustomMass` helper.
- Basis: §2.1. Covers nose cones, adapters, plates, decoupler rings, shrouds, struts, ballast.

**A4. Propellant Fill / Mixture Split**
- Inputs: a volume (typed, or "use last tank result"), Propellant *or* Combustion mixture.
- Outputs: propellant mass for that volume; if a mixture is chosen, **per-reactant mass and the
  tank volume each reactant needs** (e.g. LH₂ vs LOX) for the given mixture ratio.
- Basis: §2.5 / §2.6.

### Tier B — Grounded estimate (real physics, but the game stores the result rather than deriving it)

**B1. Engine Mass Estimator** 🏷️ *estimate*
- The game does **not** derive engine mass — it's author-specified. This gives a defensible number.
- Inputs: pick a sizing basis —
  - by **thrust** (kN) + an engine class preset (vacuum / sea-level / RCS / upper-stage) that sets a
    realistic **thrust-to-weight ratio**, or
  - by **nozzle exit diameter** + chamber pressure as a rough scaler.
- Outputs: estimated mass with a **low–high range** and the T/W assumption shown. Includes a small
  table of real reference engines (e.g. Merlin ~T/W 180, RL10 ~T/W 65, Raptor ~T/W 140, a generic
  pressure-fed RCS) so the player can pick a comparable.
- Basis: real engine T/W statistics. **Clearly badged estimate.**

**B2. Battery Mass Estimator** 🏷️ *estimate*
- Inputs: capacity (Wh — matches flexo's Battery field; game stores Joules, 1 Wh = 3600 J),
  chemistry preset (Li-ion ~150–250 Wh/kg, LiFePO₄, aerospace pack w/ overhead).
- Outputs: estimated pack mass + range.
- Basis: real specific-energy figures.

**B3. Solar Panel Mass / Area Estimator** 🏷️ *estimate*
- Inputs: power produced (W) (+ optional distance-from-sun / efficiency assumption).
- Outputs: estimated panel **area** and **mass** (using real W/kg ~ 40–150 and W/m² figures).
- Basis: real PV array stats.

**B4. Crew / Service Module Mass** 🏷️ *partly exact*
- Inputs: as a hollow cylinder (reuses A3 shell math, exact) **+** crew count and an outfitting
  allowance per crew (seats, ECLSS, avionics) as an estimate.
- Outputs: structure mass (exact) + outfitting estimate + total, itemized.
- Basis: A1/A3 shell exact; contents heuristic.

### Tier C — Optional / stretch (performance, not mass — include only if wanted)

**C1. Engine Performance (Isp / thrust)** — from `DeLavalNozzle` (AreaRatio, exit diameter) +
`CombustionProcess` (chamber T, γ, molar mass, pressure) using ideal de-Laval relations (c*, Cf,
Isp, thrust). Useful but the game's nozzle solver may differ in detail — **must be validated against
the decomp's solver before we badge it "accurate."** Recommend deferring unless you want it.

**C2. Delta-V (Tsiolkovsky)** — wet/dry mass + Isp → Δv. Trivial and handy once A1/A2 give masses.
Low effort, high utility.

> **My recommendation for v1:** ship **A1, A2, A3, A4** (all exact, all genuinely useful) plus
> **B1** (the most-requested "how much does my engine weigh"). Add **B2/B3** if quick. Hold C1;
> consider C2 as a cheap freebie.

---

## 4. UX / window design

- **Open:** new burger-menu item **"Calculators"** in `src/ui/SettingsButton.tsx` (`onAction` →
  `setCalculatorsOpen(true)`).
- **Window:** draggable floating card modeled on `FloatingInspector.tsx` — grip header with title +
  close (X), `Select` to switch calculator, then the active calculator's inputs and a results block.
  Width ~320–360px. Position **persisted** via a `persistentJSON` store; open/close via an `atom`.
- **Inputs:** `PreciseNumberInput` for numerics (with unit suffixes m / mm / kg / W / Wh), `Select`
  for material / propellant / shape / engine-class. Live recompute on change (no "Calculate"
  button needed for the cheap math).
- **Results:** labeled rows with value + unit + **Copy** button. Estimate calculators show a
  range and an "assumptions" disclosure. Tier badges (✓ exact / ~ estimate) visible per calculator.
- **Persisted last-used:** remember selected calculator + last inputs (nice-to-have) so reopening is
  instant.
- **Phone:** desktop-only floating window initially (consistent with `FloatingInspector`, which is
  desktop-gated). A phone fallback (open as a modal) can come later.

### 4.1 The "float above everything, including dialogs" requirement — the one real technical risk

Current stacking: floating panels `z-30`, **modal overlays `z-50`** (`kit/Modal.tsx`), toasts
`z-[100]`. To sit above the Part Data popup the window needs **> z-50** (propose `z-[70]`), rendered
in a **portal at document root** (a `z-[70]` sibling *under* a `z-50` modal in the DOM can still be
painted below it depending on stacking context — a top-level portal avoids that).

**The subtle bug:** flexo's modals are `isDismissable`. React-Aria treats a pointer-press **outside
the dialog** as "dismiss," and our calculator is outside it — so clicking the calculator could
**close the Part Data popup underneath**, defeating the whole point. Mitigation options (decide at
implementation):
1. Tell the modal to ignore presses inside the calculator. React-Aria exposes
   `shouldCloseOnInteractOutside` (we'd thread it through the kit `Modal`/`ModalOverlay`). Return
   `false` when the press target is within the calculator's DOM subtree. **Preferred.**
2. Or render the calculator inside React-Aria's top-layer/portal container so it's recognized as
   part of the overlay tree and excluded from outside-press.
3. Mark the calculator root with a `data-` attribute and have the kit modal's outside-press check
   skip it globally.

This needs a small, careful change to the shared `kit/Modal.tsx` and a verification pass (open Part
Data, open Calculators on top, drag it, type in it, copy a value — confirm Part Data stays open).
**Flagging because it touches shared modal code.**

---

## 5. Architecture / files

**Pure calc core (no React, fully unit-tested):**
- `src/calc/massGeometry.ts` — the §2.1 primitives (solid/hollow sphere, cylinder, cone, trunc cone,
  cuboid, semi-ellipsoid) returning `{ volume, massSpecificPmi }`, ported 1:1 from `MassGeometry.cs`
  with the same constants (`4.1887903`, `2π/3`, clamps). Reusable by Manage Tanks for a live preview.
- `src/calc/tankGeometry.ts` — §2.2/§2.3 cylindrical & spherical tank, returning `{ structure,
  storage }` volumes. **Could share with the tank editor** so the editor can show live mass too.
- `src/calc/substances.ts` — the §2.4–2.6 tables (materials, propellants, combustion mixtures) as
  typed constants sourced from the game XML, plus reference what-if materials/engine T/W presets.
- `src/calc/estimates.ts` — B-tier heuristics (engine T/W, battery Wh/kg, solar W/kg) with the
  reference datasets and range math.
- `src/calc/*.test.ts` — golden tests: assert tank/primitive masses match hand-computed game values
  (e.g. the default 2 m × 0.5 m, 2 mm Al tank from `createTank()`), so we can't silently drift.

**State:**
- `src/state/uiStore.ts` — add `$calculatorsOpen` (`atom`), `$calculatorsFloatPos`
  (`persistentJSON`), optional `$calculatorsLastUsed`.

**UI:**
- `src/ui/CalculatorsWindow.tsx` — the draggable portal window + calculator `Select` + results.
- `src/ui/calculators/` — one small component per calculator (`CylindricalTankCalc.tsx`,
  `SphericalTankCalc.tsx`, `PrimitiveMassCalc.tsx`, `PropellantCalc.tsx`, `EngineMassCalc.tsx`, …)
  each consuming the pure core. Keeps the window thin and calculators independently addable.
- `src/ui/SettingsButton.tsx` — add the menu item.
- `src/app.tsx` — mount `<CalculatorsWindow />` at root (portal target).
- `src/ui/kit/Modal.tsx` — thread `shouldCloseOnInteractOutside` (per §4.1).

---

## 6. Implementation phases

1. **Core math + tests** — `massGeometry.ts`, `tankGeometry.ts`, `substances.ts`; golden tests vs
   known game tanks. *(No UI; de-risks accuracy first.)*
2. **Window shell** — stores, burger item, draggable portal `CalculatorsWindow` with a placeholder,
   solve the z-70 / outside-press problem in `kit/Modal.tsx`, verify it floats over Part Data.
3. **Tier-A calculators** — A1, A2, A3, A4 wired to the core, with Copy buttons.
4. **Tier-B estimators** — B1 (+ B2/B3 if approved), with estimate badges & assumptions UI.
5. **Polish** — last-used persistence, tooltips, optional C2 Δv, optional phone modal fallback.
6. **(Optional) Reuse** — surface live tank mass inside Manage Tanks using the shared core.

---

## 7. Decisions I need from you

1. **Catalog scope:** confirm the v1 set. My pick: **A1, A2, A3, A4, B1** (+ B2/B3 if cheap, + C2 Δv
   as a freebie). Cut/keep B4 (crew module)? Hold C1 (engine performance) for later?
2. **What-if materials:** offer reference densities (steel/Ti/CFRP) for tanks with an "estimate"
   badge, or **aluminum-only** to stay strictly in-game? (§2.4)
3. **Engine mass basis:** prefer thrust-based (T/W presets) as the primary, with nozzle-size as a
   secondary? Any specific reference engines you want in the comparison table?
4. **Copy targets:** is plain clipboard copy enough, or do you want a tighter "send to the focused
   Part Data field" integration (more wiring, but slicker)?
5. **Phone:** desktop-only for v1 acceptable?
6. **Shared modal change:** OK to modify `src/ui/kit/Modal.tsx` to support the float-above-dialogs
   behavior (§4.1)? It's the cleanest path but touches shared UI.
