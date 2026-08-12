# Engine Wizards

Three guided flows — **Liquid rocket**, **Solid rocket booster**, **RCS thruster** — that walk
you through a short sequence of steps and hand back a **complete, exportable engine part**:
geometry, the whole module graph, a propellant feed that actually resolves, a gimbal, exhaust
effects, dry mass, a collider and the right editor tag.

The wizard is the compressed version of [ENGINE_TUTORIAL.md](../ENGINE_TUTORIAL.md), which
builds the same liquid engine by hand in fourteen steps across four modes. Everything the
wizard authors can be re-opened and edited afterwards in the ordinary module editors — it
creates, it never owns.

**Open it from**: `Add ▸ Engine Wizard…`, the ＋ menu at the top of the Engine navigator, or
either of the Engine navigator's empty states.

---

## What you get

Finishing the wizard is **exactly one undo step**. `⌘Z` removes the entire engine — including
the meshes it generated — and `⇧⌘Z` puts it all back.

On Finish the wizard commits the document, bakes any generated meshes, switches into **Engine
mode** focused on the new combustor, and (optionally) arms the exhaust placement tool. The
status bar reports the new engine's vacuum thrust.

Running the Liquid wizard on an empty project with every default accepted produces a part that
renders, reports **525.4 kN vacuum / 433.9 s Isp**, and shows **Issues — no issues**.

---

## The steps

Every family walks **Start**, then its own middle steps, then **Effects**, **Structure** and
**Review**.

| Family | Steps |
|---|---|
| Liquid rocket | Start · Performance · Feed · Gimbal · Effects · Structure · Review |
| Solid rocket booster | Start · Propellant · Grain & casing · Nozzle · Gimbal · Effects · Structure · Review |
| RCS thruster | Start · Layout · Propellant · Feed · Effects · Structure · Review |

The step rail on the left lets you jump **back** to any step you have already visited. You can
only move forward with **Next**, and Next is disabled while the current step has a blocking
problem — the reasons are listed above the footer. **Review** runs the real
`validateEngines` check on the candidate part *before* anything is committed; **Finish** stays
disabled while any blocking finding exists.

### Start

Names the part (applied only when the part id is still the default — an already-named part
shows its id read-only) and picks where the engine's hardware lives:

- **Generate primitive geometry** — the wizard creates unrotated Box meshes laid along local
  **X**, places them, and adds a forward attach node. This is the only route into Engine mode
  that produces geometry of its own.
- **Use an existing mesh** — pick any placed SubPart template that does not already carry
  engine hardware.
- **Part-level (no geometry)** — RCS only. The stock MMU pattern, where the whole battery of
  nozzles lives on `<PartGameData>` rather than on a SubPart.

### Performance (liquid) / Propellant (SRB, RCS)

Propellant, chamber pressure, efficiencies and nozzle geometry. The liquid step carries a live
thrust/Isp readout and a **Size for a target thrust** helper that solves the exit diameter for
a vacuum thrust you name. The SRB step's pressure field shows the chosen reaction's live burn
and stability limits.

### Feed (liquid, RCS)

Where the chamber draws propellant: a **new tank**, an existing **connector**, or an existing
**container** already on the part. A liquid engine is Bulk-plumbed, so a feed through a
connector needs `BulkFluid` on it — the wizard adds that capability for you. RCS is
Service-plumbed and needs no capability change at all.

### Grain & casing (SRB)

Segment count, grain dimensions and wall material, plus an option to accept extra stacked case
segments through a `SolidMotorCase` connector. The burn preview card is display-only. Changing
the segment count re-divides the casing evenly, so the stack always fits inside it; every
other grain dimension you set is left alone.

### Layout (RCS)

Single / Quad / Six presets, or a hand-edited table of nozzle locations and directions. Every
direction must be unit length. The control map defaults to **Automatic**, which lets KSA derive
it from the nozzle geometry; the Advanced disclosure exposes the twelve flags for manual
authoring.

### Gimbal (liquid, SRB)

Thrust vectoring, in max degrees about Y and Z. A gimbal deflects the whole SubPart, so thrust
must run along that SubPart's local **X** — which generated geometry guarantees.

### Effects, Structure, Review

Plume, exhaust light and sound; optional dry mass (`<CustomMass>`) and an auto-fitted collider
around the generated geometry; then the summary tree, the performance headline and the
findings list.

---

## Presets

Presets set the numbers only — they never touch your propellant choice or your feed.

### Liquid

| Preset | Chamber | Area ratio | Exit Ø | Min throttle | Gimbal | Dry mass |
|---|---|---|---|---|---|---|
| Balanced (default) | 75 bar | 25 | 1.1 m | 40 % | 8° / 8° | 500 kg |
| Sea-level booster | 150 bar | 21 | 2.5 m | 20 % | 5° / 5° | 1500 kg |
| Vacuum stage | 49 bar | 49 | 2.5 m | 10 % | 2° / 2° | 300 kg |
| Deep-throttle lander | 7 bar | 47 | 2.2 m | 1 % | 10° / 10° | 100 kg |

Reaction defaults to Hydrolox at its own default O/F of 5.5.

### Solid rocket booster

| Preset | Reaction | Pressure | Grain | Exit Ø | Grain r / wall / len | Segments | Gimbal | Dry mass |
|---|---|---|---|---|---|---|---|---|
| Small booster | DoubleBase | 45 bar | BoostSustain | 0.15 m | 0.125 m / 3 mm / 0.25 m | 1 | off | 20 kg |
| Medium booster | DoubleBase | 45 bar | BoostSustain | 0.32 m | 0.25 m / 4 mm / 0.5 m | 1 | off | 60 kg |
| Large booster (default) | DoubleBase | 45 bar | BoostSustain | 0.64 m | 0.5 m / 6 mm / 2 m | 1 | off | 300 kg |
| Heavy segmented | APCP | 70 bar | Neutral | 1.2 m | 1 m / 8 mm / 2 m | 2 | 6° / 6° | 2000 kg |
| Super-heavy | APCP | 63 bar | Neutral | 3.5 m | 2 m / 10 mm / 3 m | 3 | 6° / 6° | 9000 kg |

Nozzle efficiencies are 95 % flow / 98 % expansion throughout; grain walls are `Steel.300(s)`.

### RCS thruster

| Preset | Reaction | Pressure | Min pulse | Exit Ø | Area ratio | Layout | Dry mass |
|---|---|---|---|---|---|---|---|
| Thruster block, large (default) | MMH_NTO @ 1.6 | 7 bar | 5.4 ms | 0.8 m | 40 | quad | 40 kg |
| Thruster block, small | MMH_NTO @ 1.6 | 7 bar | 5.4 ms | 0.4 m | 40 | quad | 40 kg |
| Micro (MMU-class) | MMH_NTO @ 1.6 | 21 bar | 1 ms | 0.03 m | 50 | six | 5 kg |

---

## The KSA rules the wizard bakes in

These are game-load requirements, not style choices. Each one is a crash or a silently dead
engine if you get it wrong by hand — the wizard cannot produce a part that breaks them.

- **Thrust runs along local X.** A nozzle's default exhaust direction is `(-1, 0, 0)` and a
  gimbal's authority is built from its Y and Z angles, so an engine whose thrust is off X
  turns one gimbal axis into a useless roll. Generated geometry is therefore unrotated boxes
  laid along X, and the wizard never rotates a placement.
- **Area ratio is always authored.** KSA's own default is NaN, which silently poisons the
  engine.
- **A minimum throttle of 100 % means on/off**, not "full power". The value is clamped into
  1–100 %.
- **A solid motor may never be driven by a thruster controller** — that throws at load — and a
  solid rocket always needs at least one nozzle.
- **A solid motor's default pressure must sit above its reaction's minimum burn pressure and
  at or below its maximum stable pressure**, or the part throws at load. APCP allows
  15–150 bar; DoubleBase allows 15–100 bar.
- **A mixture ratio is required for a mixture reaction and must be absent for a fixed one.**
  The propellant picker keeps the two in step.
- **Bulk plumbing needs `BulkFluid` on every connector in the feed path.** An empty capability
  list means `Electricity | ServiceFluid`, which is why RCS works without one.
- **A feed-wiring entry may never defer to its parent**, and a part-level consumer has no
  parent to defer to — so a part-level RCS block carries its feed directly on the combustor
  and has no wiring entry at all.
- **Minimum pulse time is floored at 1 ms** at load.
- **Stock SRBs are tagged `Booster`, not `Engines`.**

---

## What the wizard does not do

- It only **creates**. Editing an existing engine stays in the module editors.
- It has **no viewport interaction**: everything is typed or derived. For template geometry the
  Review step can arm the exhaust placement tool so you position the plume in 3D right after
  finishing.
- It picks propellants from the catalog; authoring a custom reaction stays in the Propellant
  editor.
- Gas-generator cycles, vernier clusters, MMU-style multi-controller RCS batteries with a
  per-group control map, and multi-part segmented SRB stacks are all hand-authored after the
  fact.

---

## See also

- [engines.md](engines.md) — Engine mode, the module graph and the ported KSA engine math
- [ENGINE_TUTORIAL.md](../ENGINE_TUTORIAL.md) — the same liquid engine, built by hand
- [scope/plumbing-and-feeds.md](../scope/plumbing-and-feeds.md) — the game contract behind the
  feed rules
- `plans/ENGINE_WIZARD_PLAN.md` — the implementation plan and its locked decisions
