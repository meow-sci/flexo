# Lights

Authoring a Part's cast lights — KSA `<Light>` components — as first-class, selectable 3D
entities in the workspace. Design + game-contract evidence:
[plans/LIGHT_MANAGEMENT_PLAN.md](../plans/LIGHT_MANAGEMENT_PLAN.md) (§1 is the source-verified
schema/pose/falloff contract); game-side details in
[scope/gamedata-modules.md](../scope/gamedata-modules.md).

> **Status.** Implemented so far: the normalized model + XML round-trip, the falloff/frame math
> ports, and the markers/layer/selection described here. Gizmo editing + the full inspector,
> the falloff-volume visualization, the live lighting preview, and validation are later phases
> of the plan (§4) — where a seam exists for them it is called out below.

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
**which instance** was hit — the highlight tints that context instance, and it is the frame
Phase 4's gizmo will write back through. Selected lights participate in everything selection
drives: the Assets list (a Lights section with one row per light, `via <template>` for
subpart-owned ones), the transform inspector (owner-frame position/rotation; no size group),
keyboard nudge/rotate, delete/duplicate (a duplicate gets a fresh `_lightN` id and keeps its
owner), and undo.

Picking respects the layer rules: a hidden Lights layer blocks clicks (three.js raycasts
invisible objects, so the guard is explicit), and a locked one rejects picks and prunes the
selection. **A light-only selection does not attach the transform gizmo yet** — that is the
Phase-4 seam; the inspector's numeric fields are the editing path until then.

## Adding lights

- **Add → Light → Spot light / Point light** — a part-level light at the origin, selected and
  revealed immediately.
- **SubPart Data dialog → Lights → + Light** — a light owned by that SubPart template; each
  card there has "Select in 3D" to hand off to the workspace marker.
- The glow panel's **"Add matching light"** (KSA emissive is white-only, so a colored `<Light>`
  is the only way a part reads as a colored lamp in-game).

## Deferred (plan phases 4–7)

Gizmo move/rotate + owner-frame/part-frame inspector fields (§3.9), the exact-formula falloff
volume + range-boundary wireframe (§3.5–3.6), the optional live three.js light preview
(§3.10), and validation (§3.11). Also deferred: clipboard copy/paste of lights, and "catalog
ghost lights" for the lights a placed built-in template already carries in Core's own GameData
(plan §7).
