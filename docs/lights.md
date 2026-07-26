# Lights

Authoring a Part's cast lights — KSA `<Light>` components — as first-class, selectable 3D
entities in the workspace. Design + game-contract evidence:
[plans/LIGHT_MANAGEMENT_PLAN.md](../plans/LIGHT_MANAGEMENT_PLAN.md) (§1 is the source-verified
schema/pose/falloff contract); game-side details in
[scope/gamedata-modules.md](../scope/gamedata-modules.md).

> **Status.** Implemented so far: the normalized model + XML round-trip, the falloff/frame math
> ports, the markers/layer/selection described here, gizmo editing + the full light inspector
> (owner/part-frame fields, aim vector, owner re-homing), and the coverage visualization. The
> live lighting preview and validation are later phases of the plan (§4) — where a seam exists
> for them it is called out below.

## What a light is

A `<Light>` is one entry of a GameData `Components` list (`LightModule.TemplateData`,
`decomp/KSA/LightModule.cs`): `Type` (Spot/Point), a `Transform` (position + aim rotation —
scale is parsed but **ignored**), `Range` (meters — illuminance is exactly 0 at `d ≥ Range`),
`Intensity`, `Color`, the Spot half-angles `InnerAngle`/`OuterAngle` (radians), and
`RayTracing`. A **Spot aims along its rotated local +X** — the same "facing = local +X"
convention as flexo's connector and seat markers.

`<Light>` is legal under **both** GameData sites, and Core authors both (plan §1.2):

- **Part-level** — under `<PartGameData>`: the transform is in the Part's assembly frame
  (Core: the CoreCommandA capsule headlights, CoreIVASpaceA's interior Point light).
- **SubPart-owned** — under a template's `<SubPartGameData>`: the light applies to **every
  placement** of that template and rides each instance's transform (Core: the CoreElectricalA
  spotlight/floodlight meshes).

In-game, lights render only while the part's single light switch (if any) is on and powered —
see the Power & Light Switch section of the Part Data dialog and
`analysis/HOW_LIGHT_PARTS_WORK.md`.

## The normalized model

Like colliders and IVA seats, lights are normalized out of per-template GameData into one flat
document array: `EditingPart.lights: PartLight[]` (`src/ksa/types.ts`). A `PartLight` extends
`Transform` with a deliberate reinterpretation:

- `position`/`rotation` — the emitter point and aim in the **owner frame** (the Part assembly
  frame when `ownerTemplateId` is `null`, else the owning SubPart template's local frame).
- `scale` — **unused**: KSA ignores light scale; the store pins it to (1,1,1) and the
  serializer never emits it. A scale-mode edit on a light is a silent no-op (the seat rule).
- `id` — editor-only (`_light1`, …), **never emitted** (Core authors no `<Light Id>`).
- `ownerTemplateId: string | null` — which of the two XML sites it serializes to. The
  serializer re-groups by owner on export, so the emitted grammar is unchanged; a light on a
  **built-in** template routes through the export-variant remap so Core's shared template is
  never mutated.

## The Lights layer

Every light lives on the built-in **Lights** layer (`LIGHT_LAYER_ID`, one of the
entity-exclusive built-ins — see [layers.md](./layers.md)). Layer visibility hides the
markers, the fade slider dims them, and **locking the layer both blocks 3D picking and prunes
any selected lights** (the same `deselectLayer` contract every selectable kind must join — a
kind left out keeps the gizmo attached to an entity the user just locked).

## Markers in the 3D workspace

`src/three/LightObject.ts` draws one marker per light **instance**:

- a **bulb sphere** at the emitter point, tinted with the light's own color (near-black
  colors are floored toward mid-gray so the marker stays visible; the light's authored color
  is untouched) — the click target;
- for a **Spot**, an **aim cone along local +X** (the connector-arrow convention) — this is
  the direction KSA will cast the beam; a **Point** light has no cone. Retyping a light adds
  or removes the cone in place.

Marker size is the global `$lightSettings.markerSize` view setting (default 0.12 m, matching
seats), not document data; `EditorScene` rebuilds the markers when it changes. Markers are
top-level scene children — never parented under placement groups — because KSA's `Range` is
world meters regardless of owner scale, and a scaled parent would distort the Phase-5 falloff
volume. Positioning goes through `coords.lightWorld`, which — **unlike** `colliderWorld` —
applies the owner's scale to the light's position offset (that is KSA's actual pose math; the
two helpers document the contrast).

**One light per template → N markers.** A SubPart-owned light is drawn once per placement of
its owning template, and every marker follows its placement (including the joint-animation
preview pose, exactly like SubPart-owned colliders). They are all views of ONE document
entity: editing the light affects every instance. A SubPart-owned light whose template has no
placements renders once in the Part frame so it can be found and re-homed rather than
silently vanishing.

## Selection

Lights are the sixth `SelectableKind`. Clicking a marker selects the light (additive
Ctrl/Cmd/Shift-click toggles it within a cross-kind selection); the click also records
**which instance** was hit in the `$lightEditContext` store atom — the highlight tints that
context instance, the gizmo attaches to it, and it is the placement frame both the gizmo's
write-back and the inspector's part-frame fields convert through (one atom, so they can never
disagree). Selected lights participate in everything selection drives: the Assets list (a
Lights section with one row per light, `via <template>` for subpart-owned ones), the dedicated
light inspector (below), keyboard nudge/rotate, delete/duplicate (a duplicate gets a fresh
`_lightN` id and keeps its owner), and undo.

Picking respects the layer rules: a hidden Lights layer blocks clicks (three.js raycasts
invisible objects, so the guard is explicit), and a locked one rejects picks, prunes the
selection, and suppresses the gizmo.

## Gizmo editing and the light inspector

A selected light attaches the standard transform gizmo to its **context instance**. A drag
reads the marker's part-space pose and converts it back into the light's owner-frame numbers
through `coords.lightLocalFromWorld` and the context placement — so dragging instance B's
marker keeps that marker under the cursor while every sibling instance moves in sync (they are
one document entity). Scale mode is inert on lights (KSA ignores light scale; the store pins
it), and while the **animation preview shows a posed frame**, a light owned by an animated
template locks the gizmo exactly like a SubPart-owned collider — otherwise a drag would bake
the preview pose into the document. Multi-select bulk drags lift owner-local light transforms
into part space (`lightWorld`) for the shared pivot math and push them back down through the
same context frames.

The transform inspector shows a **dedicated light panel** (`LightHeader`,
`src/ui/TransformInspector.tsx`) instead of the generic position/rotation groups:

- identity (`Light — Spot/Point`, `part-level` or `via <template> · N instance(s)`, and —
  when N > 1 — which instance edits are going through);
- **Owner** select (`Part level` + every distinct placed template) — re-homing converts the
  transform through the old and new owners' first placements so the world pose doesn't jump
  (an unplaced target keeps the numbers verbatim); **Type** select (Spot/Point);
- **Position (m, owner frame)** and **Position (m, part frame)** — the part-frame fields are
  computed through the context instance and written back through `lightLocalFromWorld`; a
  part-level light shows a single part-frame group (the frames coincide);
- **Aim rotation (°)** (owner frame) and **Aim (part frame, unit vector)** — Spot only. The
  aim vector commits through `coords.lightAimRotation`: the minimal rotation from the current
  aim to the new one composed on top of the current rotation, preserving roll continuity so
  re-aiming never wildly spins the gizmo; a degenerate (≈zero) vector is rejected;
- the `<Light>` scalar editors (Range, Intensity, Color, Spot cone half-angles in degrees,
  Ray tracing) — the same controls as the SubPart Data dialog's Lights section, which stays
  for template-scoped editing.

## Coverage visualization

A light's numbers (`Range 5`, `Intensity 10`, a 45° cone) say nothing about what the light
actually reaches. **Light coverage** draws it, using the game's own attenuation rather than a
look-alike — the two formulas KSA's clustered light pre-pass evaluates for every lit fragment
(`Content/Core/Shaders/Lighting/LightPrePass.comp:281-296`, ported in
`src/ksa/lightFalloff.ts`):

```
E(d)    = Intensity · saturate(1 − (d/Range)⁴) / d²                      illuminance at distance d
spot(θ) = saturate( (cosθ − cos Outer) / (cos Inner − cos Outer) )²      1 inside the inner cone, 0 outside the outer
```

Both have exact iso-surfaces, and that is what the visualization is built on: `E` is **exactly
0 at `d = Range`** (a hard boundary sphere — a light does not "fade out somewhere around" its
range), the spot term is **exactly 1 inside the inner cone** and **exactly 0 on the outer
cone**. Cone angles run through KSA's own sanitizer first (`clampSpotAngles` — swap if inner >
outer, then clamp outer to ≤ 1.5697963 rad ≈ 89.94°), so you see what the game will render, not
what was typed.

Two things get drawn (`src/three/LightObject.ts`), both pure decoration — neither is ever a
click target:

**The falloff volume.** A stack of 16 concentric spheres at radii `((i + 0.5)/16)·Range`,
drawn additively with depth testing on, each fragment shaded by the formulas above evaluated at
its own distance and angle. Because the shading — not the geometry — carries the cone, a spot
needs **no cone mesh**: fragments outside the outer cone are simply black, so the stack reads
as a graded spherical-cap beam, and there is no wide-angle degeneracy to special-case. Each
shell is exact at its own radius. Cost is one instanced draw per light.

**The boundary wireframe.** For a Point light, three great circles of the range sphere. For a
Spot, KSA's own debug-draw language — 12 rays from the apex plus inner/outer rim circles
(`SPOT_BASE_SEGMENTS = 12`, `LightUtils.cs`) — with **one deliberate deviation**: KSA puts its
rims at axial distance `Range` with radius `Range · tan(angle)`, and flexo puts them **on the
range sphere** (center `x = R·cos θ`, radius `R·sin θ`), closed by two cap arcs. Two reasons.
`tan` explodes for wide cones — Core's own `FloodlightA` authors `OuterAngle = 1.57`, where the
game's debug draw would put a **~3.4 km** rim disc on a 3 m light — and the true extinction
surface *is* the sphere `d = Range`, so a spot's boundary is a spherical **cap**, not a flat
disc. FloodlightA therefore renders as what it is: a clean hemisphere.

### Exposure — why there are two modes

Illuminance spans orders of magnitude (Core ships an `Intensity = 10` spotlight and an
`Intensity = 0.05` interior lamp), so the shells map `E` to screen brightness through a
Reinhard curve `E / (E + E₀)`. `E₀` is the knee, and **View ▸ Exposure** picks how it is chosen:

- **Auto** (default) — per light, `E₀ = E(0.2·Range) / 3`. Every light spans the full gradient
  regardless of absolute intensity, so the dim interior lamp is as readable as the spotlight.
  Use it while shaping one light. It makes cross-light brightness comparisons meaningless.
- **Absolute** — every light uses the same `E₀` (default 1, editable). Relative brightness is
  honest: a genuinely dim light looks dim, and at `E₀ = 1` Core's `Intensity = 0.05` interior
  lamp is nearly invisible — which is correct, and is exactly why Auto exists.

**View ▸ Light coverage** chooses who draws it: `Selected` (default — only the selected light's
context instance, so a multi-placement light doesn't stack N overlapping glows), `All`, or
`Off`. It composes with the Lights layer: a hidden or faded layer hides/dims the coverage too.

### Honest limits

- **The shells are exact at their sample radii, and nowhere else.** This is a sampled
  visualization, not a participating-media raymarch: there is no scattering, no light shafts,
  and no accumulation along the view ray other than the 16 shell crossings. Read it as "how far
  and how bright", not as a render of the room.
- Consequently a **narrow beam seen from the side is subtle** — a view ray only crosses the few
  shells whose far side falls inside the cone. The boundary wireframe is the crisp read on
  reach; the volume is the gradient.
- Sixteen discrete shells read as **visible concentric bands**, not a smooth gradient. That is
  the sampling showing through, and it is deliberately not hidden: each band edge is an
  iso-illuminance contour, so the banding doubles as a "how fast is this falling off" scale.
  A point light shows it most (every view ray crosses all 16 shells twice).
- The volume is depth-tested, so part geometry occludes it (which is what makes it read as 3D).
  For an interior light, hide the hull layers or orbit inside.
- The shading is display-only presentation on top of the game's math; the editor's tone mapping
  and the game's grading are unrelated. Compare *shapes and extents*, not pixels.

## Adding lights

- **Add → Light → Spot light / Point light** — a part-level light at the origin, selected and
  revealed immediately.
- **SubPart Data dialog → Lights → + Light** — a light owned by that SubPart template; each
  card there has "Select in 3D" to hand off to the workspace marker.
- The glow panel's **"Add matching light"** (KSA emissive is white-only, so a colored `<Light>`
  is the only way a part reads as a colored lamp in-game).

## Deferred (plan phases 6–7)

The optional live three.js light preview (§3.10 — real `PointLight`/`SpotLight`s that actually
light the part meshes) and validation (§3.11). Also deferred: clipboard copy/paste of lights,
and "catalog ghost lights" for the lights a placed built-in template already carries in Core's
own GameData (plan §7).
