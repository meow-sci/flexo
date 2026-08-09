# Building a working engine in flexo, from empty

A step-by-step build of a gimballed liquid rocket engine — primitive meshes, real
`<Combustor>`/`<DeLavalNozzle>`/`<Rocket>` hardware, a propellant feed that resolves, a
thrust-vectoring gimbal, and a placed exhaust plume — ending in a KSA mod you can load.

Everything here uses stock KSA content only. No external assets required.

---

## Conventions

| Thing       | How this doc writes it                                          |
| ----------- | --------------------------------------------------------------- |
| Mode switch | `1` Build · `2` Animation · `3` Data · `4` Engine · `5` Surface |
| Menu path   | **Add ▸ Primitive Mesh…**                                       |
| Key         | `⌘K` (use `Ctrl` on Windows/Linux wherever `⌘` appears)         |

The Engine mode layout: **left** = the module editor (one module at a time), **right** = the
Engine navigator (scope select, module tree, Performance, Issues, Exhaust).

> **Keyboard shortcuts are suppressed while a text field has focus.** A bare mode digit types
> a character into the field, and even `⌘K` does nothing. Leave the field first (click the
> viewport, or press `Tab`) — or just click the **mode chip** in the status bar, which lists
> all five modes and always works. This doc says "press `4`"; the chip is the equivalent.

---

## Step 1 — New project

1. **File ▸ New Project**.

You get an empty part with no placements. The viewport shows only the grid.

## Step 2 — Name the part

1. Press `3` (Data mode).
2. In the navigator, select the **Part** row (the top one).
3. Open the **Identity** section.
4. **Part Id** → `flexo_tutorial_engine`
5. **Display Name** → `Tutorial Engine`

The Part Id is the mod entry id. Without it the export has nothing to name its files after.

### The axis you need to know

KSA stacks parts along **X**: a connector faces its own local **+X**, and a stock engine bell
fires along **−X** (so thrust pushes the part toward +X). +X is "forward / up the stack".

flexo's **Cylinder** primitive is a `THREE.CylinderGeometry`, whose axis is **Y**. So every
cylinder in this tutorial gets **Rotation Z = 90°** to lay its axis down onto X. Do not skip
that — without it the engine fires out of the part's side.

## Step 3 — Make the engine bell mesh

1. Press `1` (Build mode).
2. **Add ▸ Primitive Mesh…**
3. Click **Cylinder** in the shape row.
4. Set **Radius (m)** `0.6`, **Height (m)** `1.2`, **Segments** `24`.
5. **Name** → `Bell`
6. Click **Create mesh**.

The mesh is created _and placed_ at the origin in one action, and is selected. Its instance id
appears in the Outliner — something like `flexo_bell_a1b2c3_1`. **Write it down; the gimbal
step needs it.**

7. In the left inspector, under **Rotation (°)**, set **Z** = `90`.

The bell now spans X `−0.6 … +0.6`.

> The bell is the SubPart the engine hardware will live on, and the SubPart the gimbal will
> rotate. It must be its own placement, separate from the body.

## Step 4 — Make the body mesh

1. **Add ▸ Primitive Mesh…**
2. Click **Cylinder**. Set **Radius (m)** `0.6`, **Height (m)** `2.5`, **Segments** `24`.
3. **Name** → `Body`
4. Click **Create mesh**.
5. Under **Rotation (°)**, set **Z** = `90`.
6. Under **Position (m)**, set **X** = `1.85`.

The body now spans X `0.6 … 3.1` — flush against the bell's forward face, with the bell
hanging off the aft end.

## Step 5 — Add an attach node

1. **Add ▸ Connector**. It lands at the origin and is selected.
2. Under **Position (m)**, set **X** = `3.1` (the forward face of the body).

A connector faces its own local **+X**, so at the forward end it already points the right way —
no rotation needed.

> **Capabilities** are left empty on purpose — empty means KSA's default
> `Electricity | ServiceFluid`. This engine will draw from its own on-board tank, so it needs
> nothing more. If you later want it to pull propellant from the stage above, tick
> **BulkFluid** here (a Bulk-plumbed combustor needs that capability at _both_ ends).

## Step 6 — Add a propellant tank

The tank is the feed container the engine will draw from.

1. Press `3` (Data mode).
2. Select the **Part** row.
3. Click **＋** on the **Tanks (feed containers)** section header. The section starts collapsed
   (it is empty); the **＋** adds a tank _and_ expands it, so the new card is right there.
   Clicking the header itself to expand, then **+ Tank**, does the same thing.
4. **Feed id** → `fuel_main` ← this is the name the feed wiring will reference.
5. **Length (m)** → `2.5`, **Outer Radius (m)** → `0.6`.
6. Leave **Shape** `Cylindrical`, **Wall Material Id** `Aluminum.2014(s)`, **Role affinity**
   `Engine (default)`.

> The feed id must be non-blank. A blank id is not addressable and the feed will not resolve.

## Step 7 — Define the engine

1. Press `4` (Engine mode).
2. In the Engine navigator header, click **＋** (`Define new engine`).
3. Choose **Liquid rocket** — _combustor + De Laval nozzle + rocket + controller_.
4. In the target list, select the **Bell** template row.
5. Click **Define liquid rocket**.

In one undo step this creates:

| Module                     | Id                                               | Where                |
| -------------------------- | ------------------------------------------------ | -------------------- |
| `<Combustor>`              | `ThrustChamber`                                  | on the Bell template |
| `<DeLavalNozzle>`          | `Nozzle`                                         | on the Bell template |
| `<Rocket>`                 | `Engine` (core `ThrustChamber`, nozzle `Nozzle`) | on the Bell template |
| `<RocketEngineController>` | `Engine` (drives rocket `Engine`)                | part-level           |

…and tags the part `Engines`. The tree opens with the combustor focused.

## Step 8 — Tune the combustor

The combustor is already focused. It ships with usable defaults; change what you want.

| Field                  | Default                     | Suggested                                         |
| ---------------------- | --------------------------- | ------------------------------------------------- |
| Plumbing               | `Bulk`                      | leave `Bulk`                                      |
| Feeds from             | `Parent part (wired below)` | **leave as-is** — Step 10 wires it                |
| Propellant (reaction)  | `Hydrolox`                  | leave, or pick `Kerolox` / `Methalox`             |
| Mixture ratio (O/F)    | `5.5`                       | leave (it is Hydrolox's own default)              |
| Chamber pressure (bar) | `50`                        | `75`                                              |
| Thermal efficiency (%) | `100`                       | leave                                             |
| Minimum throttle (%)   | `100`                       | `40` — **100 % means on/off only, no throttling** |

## Step 9 — Tune the nozzle

1. In the module tree, click **Nozzles ▸ Nozzle**.

| Field                           | Default    | Suggested                               |
| ------------------------------- | ---------- | --------------------------------------- |
| Exit diameter (m)               | `1`        | `1.1` (matches the 0.6 m-radius bell)   |
| Area ratio (exit / throat)      | `25`       | `25` vacuum-ish, `12` for sea level     |
| Flow / Expansion efficiency (%) | `100`      | leave                                   |
| Exhaust direction               | `−1, 0, 0` | **leave** — this is the working default |

> The exhaust direction must stay **unit length**. KSA multiplies thrust by this vector
> _unnormalized_, so a length of 2 silently doubles your thrust. If you edit it, use the
> **Normalize** button that appears next to the field.

## Step 10 — Wire the propellant feed

The combustor says "feeds from my parent part", so the part must answer with a
`<ConsumerFeedWiring>` entry. Right now it has none — the tree shows a warning.

1. In the module tree, open the **Feed wiring** group. It shows an amber
   **unwired: ThrustChamber — wire it →** row.
2. Click that row. It creates the wiring entry _and_ opens it in the left editor.
3. Under **Feeds from**, click **+ Feed**.
4. The new feed defaults to kind **Connector** — change it to **Container (tank / grain)**.
   (A wiring entry may not defer to Parent, so Connector is the default it can offer.)
5. Set the container select to **fuel_main (part)**.

**Check it took:** the Feed wiring row in the tree now reads **`ThrustChamber ← fuel_main`**.
While the entry is empty it reads **`ThrustChamber ← nothing`**.

> **Do not stop at step 2.** A wiring entry with **no feed points** is dropped from the export
> entirely, leaving the consumer unwired in the shipped XML. Three things tell you: the Issues
> panel holds at `0 block · 1 warn` (_"…wires no feed points — flexo omits it from the export"_),
> the tree row says `← nothing`, and the Feeds-from box shows a red note. All three clear the
> moment you add the feed point.
>
> The group header's **⚡ Auto-wire** does the same thing in bulk for every unwired consumer —
> also with empty feed lists, so every entry it makes still needs a feed point.

## Step 11 — Add the gimbal

1. In the module tree, click **＋** on the **Gimbals** group header.
   - With one candidate placement the button reads _"Add a gimbal on `flexo_bell_…_1`"_ and
     adds it immediately.
   - With several, it opens a menu: **All N placements** first, then each instance.
   - If it is greyed out in a menu, the item tells you why (no engine open / no placement /
     every placement already has one).
2. The gimbal editor opens with **Max angle Y** and **Max angle Z** at `5°`.
3. Set both to `8`.
4. Leave **Constrain to circle** on (clamps combined Y/Z deflection to a circle, not a square).

> A gimbal is keyed to a **placement**, and it vectors _every nozzle on that SubPart_. A 0°/0°
> gimbal is a silent no-op — that is why flexo opens new ones at 5° rather than KSA's 0.
>
> To move a gimbal to a different placement, use the `[Instance: … ▾]` chip at the top of the
> editor — that chip is the picker.

## Step 12 — Place the exhaust in 3D

1. Arm the placement tool, either way:
   - the **Exhaust** section at the bottom of the Engine navigator → **Place exhaust in 3D**
     (or press `X`), or
   - the **⌖ Place this nozzle's exhaust in 3D** button at the bottom of the nozzle editor,
     which targets _this_ nozzle specifically and works from Data mode too.
2. In the viewport, drag the handle to the mouth of the bell — around `−0.6` on X.
3. Press `T` to switch the gizmo to **Rotate**, then re-aim the direction so it points aft.
   Roll does nothing; the plume is axially symmetric in-game.
4. Press `Esc` when done.

Notes:

- `,` and `.` cycle between nozzle handles when a part has several.
- Clicking any handle in the viewport switches the active nozzle.
- The gizmo drag is one undo step.

Then give it a visible plume — still on the nozzle editor:

5. **Exhaust plume** → `EngineAMed`. The select defaults to `(none)`; the full list is
   `EngineALarge`, `EngineAMed`, `EngineACompact`, `EngineAVernier`, `EngineATurbine`, `RCS`,
   `MmuRcsVac`.
6. Leave **Plume trail** at `(none)` — since rev 4996 KSA uses trails on solid motors only.
7. Leave **Exhaust light** on; turn on **Engine sound** if you want it.

> If you ever need the plume somewhere other than where thrust is applied, turn on
> **Override FX placement (plume ≠ thrust)** and edit the cyan FX handle separately.

## Step 13 — Check your work

In the Engine navigator:

- **Performance** — should read a real **Thrust (vacuum)**, **Thrust (sea level)**, **Isp**,
  **Mass flow** and **Throat diameter**. With the numbers above (75 bar, exit 1.1 m, AR 25) you
  get roughly **525 kN vacuum**.
  If it says _"Add a combustor and a nozzle to see live thrust and Isp"_, the rocket is not
  bound to both.
- **Issues** — the header states the count verbatim: **`Issues — no issues`**, or
  `Issues — N block · M warn`. Red **blockers** are things KSA throws on; amber **warnings**
  load fine and then silently produce no thrust.

> **Performance is not a feed check.** It reads chamber and nozzle geometry only, and happily
> shows full thrust for an engine with no propellant path at all. `Issues` is the one that
> knows — get it to `no issues` before you export.

Common warnings and their fix:

| Warning                                                       | Fix                                                 |
| ------------------------------------------------------------- | --------------------------------------------------- |
| `consumer … has no ConsumerFeedWiring wiring for it`          | Step 10 — click **wire it →**                       |
| `The ConsumerFeedWiring entry … wires no feed points`         | Step 10 — the entry exists but is empty; add a feed |
| `the ConsumerFeedWiring entry … feeds from unknown container` | The tank's **Feed id** is blank or misspelled       |
| `nozzle … is referenced by no Rocket`                         | Open the **Rocket** module, add the nozzle          |
| `rocket core … has no controller driving its Rocket`          | Open the **Controller**, add the rocket             |
| `non-unit ExhaustDirection`                                   | Click **Normalize** on the nozzle's direction field |

## Step 14 — Export

1. Press `⌘E` (**File ▸ Export to KSA…**).
2. Read the **pre-flight** list at the top. It repeats blockers from Issues.
3. Pick your KSA **mods folder** (or use **Download mod zip** if the browser has no folder
   access).
4. Click **Export to mods folder**.

flexo writes `<PartId>Part.xml`, `<PartId>GameData.xml`, `<PartId>Assets.xml`, plus `Meshes/`
and `Textures/`. Existing XML is never overwritten and `mod.toml` accumulates.

---

## What you built

```
Part  flexo_tutorial_engine
├─ Connector  _connector1            +X attach node
├─ Tank       fuel_main              2.5 m × 0.6 m
├─ Placement  flexo_body_…_1         body cylinder
├─ Placement  flexo_bell_…_1         bell cylinder   ← engine + gimbal live here
│   ├─ <Combustor>      ThrustChamber   Hydrolox, MR 5.5, 75 bar, 40 % min throttle
│   ├─ <DeLavalNozzle>  Nozzle          exit 1.1 m, AR 25, fires −X, plume EngineAMed
│   └─ <Rocket>         Engine          core ThrustChamber → nozzle Nozzle
├─ <RocketEngineController>  Engine     drives rocket Engine
├─ <ConsumerFeedWiring>     ThrustChamber → container fuel_main
└─ <Gimbal>                 on flexo_bell_…_1, 8° / 8°, constrained to circle
```

## Variations

- **RCS thruster** — Step 7, choose **RCS thruster** instead. It authors a
  `<RocketThrusterController>` (pulsed) and sets the combustor to **Service** plumbing, which
  rides KSA's default `Electricity | ServiceFluid` and so reaches propellant without editing
  connector capabilities. RCS is the one kind that can also be defined **part-level**, for the
  stock MMU pattern where a battery of nozzles lives on `<PartGameData>`.
- **Solid motor** — Step 7, choose **Solid motor**. You get a real `<SolidMotor>` +
  `<SolidGrainSegment>` + `<SolidMotorNozzle>` with a burn curve KSA simulates. The grain
  segment _is_ the tank, so skip Step 6. A solid motor needs a `Solid`-category reaction
  (`APCP` or `DoubleBase`) and a default pressure inside that reaction's stable range — both
  are hard blockers if wrong. Note that a thruster controller may never drive a solid motor.
- **SRB preset (legacy)** — a fixed-thrust liquid fake with a sealed tank. No burn curve, and
  it can shut down. Prefer **Solid motor**.
- **Engine cluster** — place the bell several times before Step 7. One `<Rocket>` drives all
  placements, and the Gimbals **＋** will offer **All N placements** so the whole cluster
  vectors together.

## Gotchas worth knowing

- **A SubPart's engine numbers are shared by every placement of that template.** Place the bell
  four times and one nozzle drives four real thrusters. The nozzle editor says so when it
  applies. To aim thrusters independently, author a nozzle per thruster at **part level**.
- **Connectors cannot animate with joints.** That is a KSA limitation, not a flexo gap — a
  deployed-pose author is the only partial workaround.
- **Minimum throttle 1.0 = on/off.** It is not "idle at 100 %".
- **The gimbal rotates the whole SubPart placement**, not just the bell mesh — anything else on
  that placement swings with it.
