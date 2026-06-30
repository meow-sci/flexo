# KSA Light Parts — Deep Technical Analysis

**Purpose:** A complete, source-verified reference for how "light" parts work in KSA (Kitten Space Agency): from the emissive mesh/texture, through the `<Light>` SubPart data and the `<PowerConsumer>` Part data, through the Asset/GameData `Id` + `InstanceOf` reference model, to the in-game spot/point light direction and the right-click ImGui **Light Switch** checkbox. The driving question this document answers:

> **Can a single Part expose more than one _independent_ light switch (so different lights toggle separately)?**
> **Short answer: No — not with data alone.** A Part has exactly **one** light-switch slot in the game's data model. You can make the game _draw_ extra checkboxes, but only one of them is wired to anything; the rest are dead toggles that still silently drain power. Independent switches require **separate Parts**. Full reasoning in §7.

**Sources (authoritative):**

- Decompiled C#: the decomp `KSA/` tree. The real `[XmlType]`/`[XmlElement]` schema lives here, not in the asset XML. Citations below are `File.cs:line` **relative to the `decomp/` root** (so `KSA/PowerConsumer.cs:70`).
- Game data XML / shaders: citations are **relative to the `Content/Core/` root** (so `CoreElectricalAGameData.xml:37`, `Shaders/Mesh/MeshIndirect.frag:236`).

Every default and code path in this document was read directly from the decomp and shipped data. The canonical worked example throughout is `CoreElectricalA_Prefab_LightSmallA` (a small spotlight) and its `CoreElectricalA_Subpart_SpotlightA` light subpart.

---

## 0. Executive summary (read this first)

1. **A light part is two separate XML records sharing one `Id`.** The _art_ (`<Part>` / `<SubPart>` → `<PartModel>`/`<Mesh>`/`<Material>`) lives in `*Assets.xml`; the _gameplay data_ (`<PartGameData>` / `<SubPartGameData>` → `<PowerConsumer>`, `<Light>`) lives in `*GameData.xml`. They are matched **by identical `Id`** at load time (§1).

2. **There are two distinct light effects, both gated by the same one switch:**
   - **Emissive glow** — a single-channel emissive texture on the mesh that "lights up" (the visible bulb/lens). Rendered by the part mesh shader; toggled by a state bit (§5.2, §5.3).
   - **Cast light** — a real `Spot` or `Point` light placed into the scene by `LightModule`, defined by `<Light>` on a **SubPart** (§5.1).

3. **`<Light>` belongs on a SubPart; `<PowerConsumer LightSwitch="true">` belongs on the Part.** The light's _aim_ comes from the SubPart instance's orientation (so rotating the mesh in the editor rotates the beam). The _switch_ is a part-level power consumer (§2).

4. **The switch is a single slot.** `Part.LightSwitch` is one nullable field (`KSA/Part.cs:407`). `Part.ResetModuleProperties` picks the **first** `PowerConsumer` whose `LightSwitch=true` and `break`s (`KSA/Part.cs:913-922`). Every `LightModule` and every emissive mesh in the whole part subtree reads that one field via `FullPart.LightSwitch` (§4, §5).

5. **Multiple `<PowerConsumer LightSwitch="true">` in one Part is the "nonsensical but works" case.** The part window iterates _all_ power consumers and draws a checkbox per consumer (`KSA/Part.cs:1595-1602`), so you get **several "Light Switch" checkboxes** — but only the first one actually gates lights/emissives. The extras toggle their own power-draw state and nothing else (§7).

6. **No switch at all = lights permanently on.** If a Part has `<Light>` subparts but no `<PowerConsumer LightSwitch>`, `FullPart.LightSwitch` is null, every gate is skipped, and the lights and emissive are always on with no checkbox (§8.1).

7. **A vehicle-wide "Lights" master toggle exists** (`Vehicle.ToggleLights`, `KSA/Vehicle.cs:900-913`) and flips the one `LightSwitch` of every part at once.

---

## 1. The object model: Asset vs GameData, `Id` vs `InstanceOf`

KSA splits every part into **four** top-level XML records. Two describe the _art_, two describe the _gameplay_:

| Record              | File            | Role                                                                                            | Example `Id`                         |
| ------------------- | --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| `<Part>`            | `*Assets.xml`   | Art assembly: lists its `<SubPart>` instances + `<Connector>` transforms                        | `CoreElectricalA_Prefab_LightSmallA` |
| `<SubPart>`         | `*Assets.xml`   | Art leaf: `<PartModel>` → `<Mesh>`/`<Material>` (+ `_VM` view-mesh for editor picking)          | `CoreElectricalA_Subpart_SpotlightA` |
| `<PartGameData>`    | `*GameData.xml` | Gameplay for a Part: `<PowerConsumer>`, `<EditorTag>`, `<Connector>` flags, `<Collider>`, anim… | `CoreElectricalA_Prefab_LightSmallA` |
| `<SubPartGameData>` | `*GameData.xml` | Gameplay for a SubPart: `<Light>`, mass, tanks…                                                 | `CoreElectricalA_Subpart_SpotlightA` |

### 1.1 The two matching mechanisms (this is the part that confuses people)

There are **two completely different** ways `Id`s are used, and the convention of reusing the same string for both is what makes it look ambiguous:

- **GameData ↔ Asset: matched by identical `Id` (a merge).** `<PartGameData Id="X">` is merged into `<Part Id="X">`; `<SubPartGameData Id="Y">` into `<SubPart Id="Y">`. The classes are literally the same type — `PartGameDataReference : PartTemplate` (`KSA/PartGameDataReference.cs:5`) — and on load it finds the already-registered part with the same `Id` and calls `ApplyGameData` onto it (`KSA/PartGameDataReference.cs:15-18`, merge body `KSA/PartTemplate.cs:211-296`). So a `PartGameData` and a `Part` with the same `Id` are **one object** after load.

- **Part → SubPart: referenced by `InstanceOf` (an instantiation).** Inside `<Part>`, each child is `<SubPart Id="<instance-name>" InstanceOf="<subpart-template-id>">`. Here `Id` is a _fresh per-instance name_ and `InstanceOf` is the _reference_ to the SubPart template. Deserialized into `PartTemplate.SubPartInstances` (`[XmlElement("SubPart")] List<PartInstance>`, `KSA/PartTemplate.cs:17-18`).

Worked example — `CoreElectricalA_Prefab_LightSmallA` (`CoreElectricalAAssets.xml:551-576`):

```xml
<Part Id="CoreElectricalA_Prefab_LightSmallA">
    <SubPart Id="CoreElectricalA_Subpart_SpotlightA1"  InstanceOf="CoreElectricalA_Subpart_SpotlightA" />
    <SubPart Id="CoreElectricalA_Subpart_LightMountA1" InstanceOf="CoreElectricalA_Subpart_LightMountA"><Transform>…</Transform></SubPart>
    <SubPart Id="CoreElectricalA_Subpart_SpotlightAHinge1" InstanceOf="CoreElectricalA_Subpart_SpotlightAHinge"><Transform>…</Transform></SubPart>
    <SubPart Id="CoreElectricalA_Subpart_SpotlightAHinge2" InstanceOf="CoreElectricalA_Subpart_SpotlightAHinge"><Transform>…</Transform></SubPart>
</Part>
```

- `CoreElectricalA_Subpart_SpotlightA1` is an **instance name** (the `1` suffix is just developer convention; any unique string works).
- `InstanceOf="CoreElectricalA_Subpart_SpotlightA"` points at the **template**, which has both an art record (`CoreElectricalAAssets.xml:152-160`) and a gameplay record carrying the `<Light>` (`CoreElectricalAGameData.xml:104-116`).

**Consequence for lights:** the `<Light>` is defined **once** on the SubPart _template_ (`SubPartGameData`), so **every instance** of that subpart in any part automatically gets a `LightModule`. `LightSmallB` instantiates `CoreElectricalA_Subpart_SpotlightA` **twice** (`CoreElectricalAAssets.xml:586-611`) → two independent spotlights from one template, aimed by their two different instance transforms.

> **User's observation, confirmed:** the base game's instance `Id`s are _not_ generally equal to the `InstanceOf` they reference (they append a digit). The strings that _are_ identical are the GameData↔Asset pair (`PartGameData` vs `Part`, `SubPartGameData` vs `SubPart`). That equality is **required** (it's the merge key); the instance-name vs `InstanceOf` equality is **not** required and is generally false.

---

## 2. Where the light data lives in XML

### 2.1 `<Light>` — on a `SubPartGameData` (the cast light)

`CoreElectricalAGameData.xml:104-116`:

```xml
<SubPartGameData Id="CoreElectricalA_Subpart_SpotlightA">
    <Light>
        <Type>Spot</Type>
        <Transform><Position X="0.38" Y="0.21" Z="0"/></Transform>
        <Range Value="5"/>
        <Intensity Value="10"/>
        <Color R="1" G="1" B="1"/>
        <InnerAngle Value="0.392599"/>   <!-- = π/8 -->
        <OuterAngle Value="0.785398"/>   <!-- = π/4 -->
    </Light>
</SubPartGameData>
```

Schema = `LightModule.TemplateData`, `[XmlType(TypeName = "Light")]` (`KSA/LightModule.cs:11-53`):

| Element              | Type                    | Default         | Notes                                                                                 |
| -------------------- | ----------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `<Type>`             | `Spot` \| `Point`       | `Spot` (enum 0) | `LightType` enum, `KSA/LightModule.cs:14-18`                                          |
| `<Transform>`        | position+rotation+scale | identity        | Position offset + **aim** of a Spot (§5.1)                                            |
| `<Range Value>`      | float (m)               | `1`             | falloff distance                                                                      |
| `<Intensity Value>`  | float                   | `1`             | brightness                                                                            |
| `<Color R G B>`      | rgb                     | `Gray`          | light tint                                                                            |
| `<InnerAngle Value>` | float (**radians**)     | `π/8 ≈ 0.3927`  | Spot full-bright cone half-angle                                                      |
| `<OuterAngle Value>` | float (**radians**)     | `π/4 ≈ 0.7854`  | Spot outer cone half-angle                                                            |
| `<RayTracing>`       | bool                    | `false`         | routes to the RT light list when IVA ray tracing is on (`KSA/LightModule.cs:102,118`) |

`InnerAngle`/`OuterAngle` are **ignored for `Point`** lights (a Point is omnidirectional — `KSA/LightModule.cs:99-110` passes only position/range/color/intensity).

### 2.2 `<PowerConsumer>` — on a `PartGameData` (the switch + power draw)

`CoreElectricalAGameData.xml:35-56`:

```xml
<PartGameData Id="CoreElectricalA_Prefab_LightSmallA">
    <EditorTag Value="Lights"/>
    <PowerConsumer LightSwitch="true">
        <Consumed W="60" />
    </PowerConsumer>
    <Connector Id="_connector8"><Flags>ToSurface</Flags></Connector>
    <KeyframeAnimationModule …/>
    <Collider …/>
</PartGameData>
```

Schema = `PowerConsumerTemplate : SerializedId, IDataReference` (`KSA/PowerConsumerTemplate.cs`):

| Member          | XML                   | Type                     | Default | Meaning                                                                                               |
| --------------- | --------------------- | ------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `Consumed`      | `<Consumed W="…">`    | `PowerReference` (watts) | `0`     | continuous draw while active                                                                          |
| `LightSwitch`   | `LightSwitch=` attr   | bool                     | `false` | **makes this consumer the part's light switch** and changes the ImGui widget into a checkbox (§5, §6) |
| `LightIsActive` | `LightIsActive=` attr | bool                     | `false` | switch's **initial** on/off state; only read when `LightSwitch` is true                               |

To turn a light on by default: `<PowerConsumer LightSwitch="true" LightIsActive="true">`.

`[XmlElement("PowerConsumer")] List<PowerConsumerTemplate> PowerConsumers` (`KSA/PartTemplate.cs:67-68`) — so a `PartGameData` may legally contain **multiple** `<PowerConsumer>` elements. That legality is exactly the trap discussed in §7.

The most minimal possible light controller is shipped as `LightPart` (`CoreElectricalAGameData.xml:221-225`): a `PartGameData` with nothing but `<PowerConsumer LightSwitch="true"><Consumed W="40"/></PowerConsumer>`.

---

## 3. Runtime assembly: how XML becomes a live part tree

### 3.1 PartTemplate aggregation

After GameData is merged onto its Asset twin, each part is one `PartTemplate` holding:

- `SubPartInstances` — the `<SubPart … InstanceOf>` list (`KSA/PartTemplate.cs:17-18`).
- `PowerConsumers` — the `<PowerConsumer>` list (`KSA/PartTemplate.cs:67-68`, filled by `PowerConsumers.AddRange(gameData.PowerConsumers)` at `KSA/PartTemplate.cs:285`).
- `Components` — module template data including each `<Light>` and each `<PartModel>` (`KSA/PartTemplate.cs:91`, filled at `:295`).

### 3.2 The Part tree: root Part + child SubPart Parts

A placed part becomes a **tree of `Part` objects**. The `Part` constructor (`KSA/Part.cs:788-802`):

```csharp
foreach (PartInstance subPartInstance in Template.SubPartInstances)
    AddSubPart(new Part(subPartInstance, this) { … });   // each <SubPart> → a CHILD Part, parent = this
…
ModuleList.CreateModules(this, inTemplate, inInstance, parent);  // build this part's modules
SubtreeModules.AddFrom(Modules);                                  // include own modules in the subtree view
ResetModuleProperties();                                          // pick the light switch (§4)
```

So **each `<SubPart>` instance is realized as its own child `Part`** whose `PartParent` is the root. The key helper:

```csharp
public Part FullPart => PartParent ?? this;   // KSA/Part.cs:659  → a subpart resolves UP to the root part
```

`AddSubPart` also folds child modules into the parent's `SubtreeModules` (`KSA/Part.cs:886-896`), so `SubtreeModules` is the union of the root and all its subparts' modules.

### 3.3 Module creation dispatch

`ModuleList.CreateModules` (`KSA/ModuleList.cs:56-85`) calls each module's `CreateComponents`. The two relevant ones:

- `PowerConsumer.CreateComponents` (`KSA/PowerConsumer.cs:35-50`) — one `PowerConsumer` runtime module **per** `template.PowerConsumers` entry, copying `LightSwitch`/`LightIsActive`. (Note the runtime module's `Id` is set to the _part template_ `Id`, not a per-consumer id — `KSA/PowerConsumer.cs:41`.)
- `LightModule.CreateComponents` (`KSA/LightModule.cs:67-84`) — one `LightModule` **per** `<Light>` `TemplateData` in `template.Components`. Because this runs on each child SubPart Part, every spotlight subpart instance gets its own `LightModule` whose `Parent` is that subpart Part.

---

## 4. The single light-switch slot

`Part` has exactly one switch reference:

```csharp
public PowerConsumer? LightSwitch;    // KSA/Part.cs:407
```

It is chosen in `ResetModuleProperties` (`KSA/Part.cs:908-927`), which runs on construction and whenever subparts change:

```csharp
Span<PowerConsumer> span = Modules.Get<PowerConsumer>();   // this part's OWN power consumers
for (int i = 0; i < span.Length; i++) {
    PowerConsumer powerConsumer = span[i];
    if (powerConsumer.LightSwitch) {
        LightSwitch = powerConsumer;
        break;                         // <-- FIRST one wins; the rest are never considered
    }
}
```

This is the crux of the whole question: **`Part.LightSwitch` is a single field, set to the first `LightSwitch=true` consumer, then `break`.** There is no list of switches, and nothing anywhere maps a _specific_ light to a _specific_ consumer. Every consumer of light state in the renderer reads `FullPart.LightSwitch` — i.e. the root part's one chosen consumer.

---

## 5. The render path — how the switch produces (or kills) light

### 5.1 Cast light: `LightModule.UpdateRenderData`

`KSA/LightModule.cs:86-129`. Each frame, for each `LightModule`:

```csharp
// GATE 1: the switch's UI state
if (Parent.FullPart.LightSwitch != null && !Parent.FullPart.LightSwitch.LightIsActive)
    return;                                                   // KSA/LightModule.cs:88-91
double4x4 matrix = Parent.MatrixAsmb2Ego(in matrixVehicleAsmb2Ego);
// GATE 2: the switch's simulated power state (battery actually powering it)
if (Parent.FullPart.LightSwitch != null &&
    !Parent.Tree.PowerConsumers.GetAllStatesByIdx(Parent.FullPart.LightSwitch.StatesIdx).State.Active)
    return;                                                   // KSA/LightModule.cs:93-96
```

Both gates read **`Parent.FullPart.LightSwitch`** — the root part's single chosen consumer (§4). Note `Parent` is the subpart Part the light lives on; `FullPart` climbs to the root. **So every light in the part is gated by the same one switch.** If it passes both gates, it builds the light:

**Spot direction math** (`KSA/LightModule.cs:112-126`):

```csharp
doubleQuat rot = Template.Transform.RotationValue;
double3 dir = double3.UnitX.Transform(rot);                 // base aim = local +X, rotated by the <Light> Transform rotation
dir = normalize( dir × upper-3x3 of matrix );              // then reoriented by the SubPart instance's world rotation
Light light = Light.CreateSpotLight(
    Template.Transform.PositionValue.Transform(matrix),    // origin = <Light> Position offset, in world space
    dir, Template.Range, Template.OuterAngle, Template.InnerAngle,
    Template.ColorRgb, Template.Intensity, CastsShadows | SoftShadows);
```

Two facts that explain "it emits light in the direction the mesh is pointed":

- **Base aim is local `+X`** (`double3.UnitX`), turned by the `<Light>`'s own `<Transform><Rotation>` and then by the **SubPart instance's world matrix**. Rotate/flip a spotlight subpart instance in the editor and the beam follows.
- **Origin** is the `<Light>` `<Position>` offset, transformed by that same instance matrix.

`Point` lights (`KSA/LightModule.cs:99-110`) use only position/range/color/intensity (no direction, no angles).

### 5.2 Emissive glow: `PartModelModule.UpdateRenderData`

The visible "bulb glow" is **not** the cast light — it's an emissive texture on the mesh, gated by the same switch. `KSA/PartModelModule.cs:95-105` (and identically `KSA/PartModelDynamicModule.cs:94-104`):

```csharp
if (Parent.FullPart.LightSwitch != null) {
    if (!Parent.FullPart.LightSwitch.LightIsActive)
        num |= 0x40;                                  // bit 6: "no emissive"
    else if (!Parent.Tree.PowerConsumers.GetAllStatesByIdx(
                 Parent.FullPart.LightSwitch.StatesIdx).State.Active)
        num |= 0x40;
}
…
PartModel.PerInstanceData { ModelMatrix=…, StateBitFlag=num, EmissiveColor=… };
```

`num` (`StateBitFlag`) is sent per instance to the GPU. Bit `0x40` means "switch is off / unpowered → suppress emissive." Same `FullPart.LightSwitch` again.

(Bit `0x80` / `EmissiveColor` is a _different_ feature — the battery status light, `KSA/PartModelModule.cs:106-137`; unrelated to light parts.)

### 5.3 The shader: where the bit becomes pixels

`Shaders/Mesh/MeshIndirect.frag` (the part mesh fragment shader):

```glsl
layout (location = 4) in flat uint inStateFlags;           // = StateBitFlag from §5.2  (line 29)
…
bool emissive = true;
if ((inStateFlags & (1u << 6u)) != 0u)  // 0x40 → "No emissive"   (lines 236-237)
    emissive = false;
…
if (emissive && drawData.emissiveTextureIndex >= 0) {                      // line 195
    float sampledEmissive = texture(emissiveTex, inUv).x;                  // single-channel mask
    if (sampledEmissive != 0.0) {
        vec3 e = gammaToLinear(vec3(sampledEmissive) * EMISSIVE_MULTIPLIER);
        lightColor += e;                                                   // the glow (lines 207-208)
    }
}
```

So the **glow** is a single-channel emissive texture, multiplied by `EMISSIVE_MULTIPLIER`, added to the lit color — but only when bit 6 is clear, i.e. when `FullPart.LightSwitch` says the light is on and powered.

### 5.4 The whole chain, one diagram

```
 <PowerConsumer LightSwitch="true">           (PartGameData, part level)
        │  PowerConsumer.CreateComponents
        ▼
 PowerConsumer module on root Part
        │  ResetModuleProperties: first LightSwitch=true wins → break
        ▼
 Part.LightSwitch  (ONE slot)  ◄── read as FullPart.LightSwitch by every subpart
        │                                   │
        │ (LightIsActive && state.Active)   │ (LightIsActive && state.Active)
        ▼                                   ▼
 LightModule.UpdateRenderData         PartModelModule → StateBitFlag bit 0x40
 → Spot/Point cast light              → MeshIndirect.frag → emissive glow
   (aimed by SubPart instance)          (emissive texture × EMISSIVE_MULTIPLIER)
```

---

## 6. The in-game UI — the right-click "Light Switch" checkbox

### 6.1 Per-consumer widget

`PowerConsumer.DrawStateInfo` (`KSA/PowerConsumer.cs:95-109`):

```csharp
if (LightSwitch)
    ImGuiHelper.DrawCheckbox("Light Switch"u8, ref LightIsActive, isChanged: false);  // a checkbox bound to THIS consumer's LightIsActive
else
    ImGuiHelper.DrawTextWidget("Power Consumption Active:"u8, state.Active ? "Yes" : "No");
ImGuiHelper.DrawTextWidget("Consuming:"u8, …state.Consumed…);
```

So a `LightSwitch=true` consumer renders a **checkbox** wired to its own `LightIsActive`; a normal consumer renders a read-only status line.

### 6.2 The part window draws one widget per consumer in the subtree

The part info window iterates **all** power consumers across the part + subparts (`KSA/Part.cs:1595-1602`):

```csharp
Span<PowerConsumer> span16 = SubtreeModules.Get<PowerConsumer>();   // root + every subpart
for (int i = 0; i < span16.Length; i++)
    span16[i].DrawStateInfo(in states6[span16[i].StatesIdx]);       // one widget EACH
```

This is why N power consumers with `LightSwitch=true` produce **N "Light Switch" checkboxes** — even though only one of them is `Part.LightSwitch` (§7).

### 6.3 Per-frame and save behavior

- `PowerConsumer.UpdateModules` (`KSA/PowerConsumer.cs:59-93`): for each consumer, if `LightSwitch` then `state.Active = LightIsActive`; if active and the battery can supply it, it drains `Consumed` watts; if power runs out, `state.Active` is forced false (so the light dies when the battery does).
- Save/load round-trips each consumer's `Active` (`KSA/PowerConsumer.cs:111-138`).

### 6.4 Vehicle-wide master toggle

`Vehicle.ToggleLights` (`KSA/Vehicle.cs:900-913`) flips a vehicle `LightsOn` flag and writes it into **`part.LightSwitch.LightIsActive` for every part** — i.e. only each part's _one_ chosen switch. (Extra dead consumers from §7 are not touched by the master toggle.)

---

## 7. The central question: multiple _independent_ switches in one Part

### 7.1 What the data model allows vs. what actually wires up

| Capability                                                      | Possible? | Why                                                                   |
| --------------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| Multiple `<Light>` (cast lights) in one Part                    | ✅ Yes    | One `LightModule` per `<Light>`-bearing subpart instance (§3.3).      |
| Multiple emissive meshes in one Part                            | ✅ Yes    | Each subpart mesh emits independently.                                |
| Multiple "Light Switch" **checkboxes** drawn in the part window | ✅ Yes    | The UI loops _all_ consumers (§6.2).                                  |
| Those checkboxes **controlling different lights independently** | ❌ **No** | All lights/emissives read the single `FullPart.LightSwitch` (§4, §5). |

### 7.2 Exactly what happens if you emit several `<PowerConsumer LightSwitch="true">`

Say a Part has three of them, `pc0, pc1, pc2`:

1. `ResetModuleProperties` sets `Part.LightSwitch = pc0` and `break`s (`KSA/Part.cs:913-922`). `pc1`/`pc2` are never assigned to any light.
2. The part window draws **three** "Light Switch" checkboxes (`KSA/Part.cs:1595-1602`).
3. **Every** `LightModule` and emissive in the part reads `FullPart.LightSwitch == pc0` (§5). So:
   - Toggling **checkbox 0** turns _all_ the part's lights/emissives on/off. ✔ does something.
   - Toggling **checkbox 1 or 2** flips `pc1`/`pc2`'s own `LightIsActive` → their own `state.Active` → they **draw `Consumed` watts from the battery** (`KSA/PowerConsumer.cs:70-87`) but gate **no light at all** — dead toggles that still cost power.
4. The vehicle master "Lights" toggle only touches `pc0` (it writes `part.LightSwitch.LightIsActive`, `KSA/Vehicle.cs:909`). `pc1`/`pc2` are left wherever the user last set them — so they can sit there silently draining the battery.

This matches the reported "nonsensical XML that kind of works": the light visibly toggles (via the first checkbox), but there are confusing duplicate checkboxes, and the extras are power-leaks.

### 7.3 Why it cannot be fixed with XML

For independent switching you would need a per-light → per-switch association in the data. **None exists:**

- `LightModule.TemplateData` (`<Light>`) has no field naming a consumer (`KSA/LightModule.cs:11-53`).
- The render gate is hard-coded to `FullPart.LightSwitch`, the single root-part slot (`KSA/LightModule.cs:88,93`; `KSA/PartModelModule.cs:95`).
- `Part.LightSwitch` is one field chosen by first-wins-then-break (`KSA/Part.cs:407,913-922`).

There is no XML you can author that makes checkbox B gate a different subset of lights than checkbox A. It would require a game-code change (e.g. a switch `Id` on `<Light>` plus per-switch grouping in the render gate). Per the project's no-game-code / data-only constraint, that is out of scope.

### 7.4 The supported way to get independent switches: separate Parts

This is precisely how the base game does it. Each light fixture (`LightSmallA`, `LightSmallB`, `LightSmallC`, `LightPart`) is its **own Part** with its **own single** `<PowerConsumer LightSwitch="true">`. Place several on a vehicle → several Parts → several independent switches, each its own right-click window checkbox, plus the master "Lights" toggle hitting all of them. **Independence is a per-Part property, not a per-light property.**

So: if a flexo design needs N separately-switchable light groups, it must export N Parts (one switch each), **not** one Part containing N switchable subparts.

---

## 8. Corollaries and edge cases

### 8.1 No `<PowerConsumer LightSwitch>` ⇒ lights always on, no checkbox

If a Part has `<Light>` subparts but no light-switch consumer, `Part.LightSwitch` stays null. Every gate is `if (FullPart.LightSwitch != null && …)` (`KSA/LightModule.cs:88,93`; `KSA/PartModelModule.cs:95`), so with a null switch the gate never fires: the cast lights and emissive render **unconditionally**, and no checkbox appears (the UI only draws a checkbox for consumers, and there are none). Use this intentionally for always-on indicator/emissive lights.

### 8.2 `LightSwitch=false` consumer

A `<PowerConsumer>` without `LightSwitch` is a plain always-on power draw (e.g. avionics). It shows the read-only "Power Consumption Active: Yes/No" line, never a checkbox (`KSA/PowerConsumer.cs:104-105`), and is never selected as `Part.LightSwitch` (`KSA/Part.cs:917`).

### 8.3 IVA / AttachedInternal inheritance (narrow special case)

`LightModule.CreateComponents` has one extra branch (`KSA/LightModule.cs:77-80`): when a light belongs to an _attached internal_ (IVA interior) whose parent's attached-internal points back at this part, it copies the parent's `LightSwitch` down (`part.FullPart.LightSwitch = parent.LightSwitch`). This only matters for IVA internals and does not create additional switches — it _shares_ the existing one. Not relevant to ordinary exterior light parts.

### 8.4 Spot vs Point quick reference

- `Spot`: aimed (local +X, §5.1), uses `InnerAngle`/`OuterAngle`, casts a cone. All shipped `CoreElectricalA` lights are Spot.
- `Point`: omnidirectional, ignores the angles, uses position/range/color/intensity only (`KSA/LightModule.cs:99-110`).

---

## 9. Implications for flexo

### 9.1 Current flexo data model (accurate as of this writing)

- `PartGameData.powerConsumers: PowerConsumer[]` (`src/ksa/types.ts:553`) → serialized as N `<PowerConsumer>` under `<PartGameData>` (`src/ksa/partXmlSerializer.ts:147-156`). **A list — so flexo can emit several switches.**
- `SubPart.lights: Light[]` (`src/ksa/types.ts:587`) → serialized as `<Light>` under `<SubPartGameData>` via `buildLightElement` (`src/ksa/partXmlSerializer.ts:298-330`). **Correctly placed on subparts.**
- `PowerConsumer.lightSwitch` / `lightIsActive` map to the bool attrs (`src/ksa/partXmlSerializer.ts:152-153`); `consumedWatts` → `<Consumed W>`.

So flexo already models lights in the right place (subparts) and switches in the right place (part). The "not quite right" behavior comes from **how many** switch consumers a multi-light part ends up emitting.

### 9.2 What flexo _should_ generate for a single multi-light Part

Emit **exactly one** `<PowerConsumer LightSwitch="true">` per Part, regardless of how many `<Light>` subparts the part has. Set its `<Consumed W>` to the intended total draw (e.g. sum the per-fixture wattages). All the `<Light>` subparts will be gated by that one switch — which is exactly the base-game `LightSmallA`/`LightSmallB` pattern (one consumer, multiple spotlight subpart instances).

Emitting more than one `LightSwitch=true` consumer is actively wrong: it produces duplicate dead checkboxes (§6.2) and silent extra power drain (§7.2).

### 9.3 If a design needs independent switches

Split it into multiple **exported Parts** (§7.4), each with its own single `<PowerConsumer LightSwitch="true">` and its own light subpart(s). There is no single-Part XML that yields independent switches.

### 9.4 Suggested flexo guardrails (optional follow-ups)

- Treat "is a light switch" as a **per-Part boolean** in the UI rather than letting the user add an arbitrary number of `LightSwitch` consumers; export at most one `LightSwitch=true` consumer.
- If the data still allows multiple, **warn** when a part has >1 `LightSwitch=true` consumer (it will render duplicate dead checkboxes in-game).
- Surface the §8.1 rule in the UI: a part with `<Light>` subparts but no light-switch consumer = always-on lights with no in-game toggle.

---

## 10. File / line reference index

### Decompiled C# (relative to `decomp/`)

| File:line                              | What                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `KSA/PowerConsumerTemplate.cs:7-14`    | `<PowerConsumer>` schema: `Consumed`, `LightSwitch`, `LightIsActive` (defaults false)       |
| `KSA/PowerConsumer.cs:20-28`           | runtime fields incl. `LightSwitch`, `LightIsActive`                                         |
| `KSA/PowerConsumer.cs:35-50`           | `CreateComponents` — one module per `<PowerConsumer>`                                       |
| `KSA/PowerConsumer.cs:59-93`           | `UpdateModules` — `state.Active = LightIsActive`; power drain; dies on empty battery        |
| `KSA/PowerConsumer.cs:95-109`          | `DrawStateInfo` — the **Light Switch** checkbox vs. status line                             |
| `KSA/LightModule.cs:11-53`             | `<Light>` schema (`TemplateData`) + defaults + `LightType` enum                             |
| `KSA/LightModule.cs:67-84`             | `CreateComponents` — one `LightModule` per `<Light>`; IVA inheritance branch                |
| `KSA/LightModule.cs:86-129`            | `UpdateRenderData` — **dual gate on `FullPart.LightSwitch`**, Spot/Point creation, aim math |
| `KSA/Part.cs:407`                      | `public PowerConsumer? LightSwitch;` — the single slot                                      |
| `KSA/Part.cs:659`                      | `FullPart => PartParent ?? this`                                                            |
| `KSA/Part.cs:788-802`                  | Part ctor — builds subpart child Parts, modules, `ResetModuleProperties`                    |
| `KSA/Part.cs:886-896`                  | `AddSubPart` — folds child modules into `SubtreeModules`                                    |
| `KSA/Part.cs:908-927`                  | `ResetModuleProperties` — **first `LightSwitch=true` wins, `break`**                        |
| `KSA/Part.cs:1595-1602`                | part window draws `DrawStateInfo` per consumer (multiple checkboxes)                        |
| `KSA/PartModelModule.cs:95-105`        | emissive gate → `StateBitFlag` bit `0x40`                                                   |
| `KSA/PartModelDynamicModule.cs:94-104` | same gate for dynamic models                                                                |
| `KSA/Vehicle.cs:900-913`               | `ToggleLights` master switch (per-part single `LightSwitch`)                                |
| `KSA/ModuleList.cs:56-85`              | module-creation dispatch (PowerConsumer `:73`, LightModule `:78`)                           |
| `KSA/PartTemplate.cs:17-18`            | `[XmlElement("SubPart")] SubPartInstances`                                                  |
| `KSA/PartTemplate.cs:67-68`            | `[XmlElement("PowerConsumer")] PowerConsumers` (a list)                                     |
| `KSA/PartTemplate.cs:91,285,295`       | `Components` list; GameData merge of consumers/components                                   |
| `KSA/PartGameDataReference.cs:5-19`    | GameData↔Asset merge by `Id`                                                                |

### Game data XML / shaders (relative to `Content/Core/`)

| File:line                                | What                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `CoreElectricalAGameData.xml:35-56`      | `LightSmallA` PartGameData — single `<PowerConsumer LightSwitch="true">` |
| `CoreElectricalAGameData.xml:104-116`    | `Subpart_SpotlightA` `<Light>` (Spot, the canonical example)             |
| `CoreElectricalAGameData.xml:118-130`    | `Subpart_FloodlightA` `<Light>` (wider cone)                             |
| `CoreElectricalAGameData.xml:221-225`    | `LightPart` — minimal switch-only PartGameData                           |
| `CoreElectricalAAssets.xml:551-576`      | `<Part>` LightSmallA art assembly — `Id`/`InstanceOf` instances          |
| `CoreElectricalAAssets.xml:586-617`      | `<Part>` LightSmallB — instantiates `Subpart_SpotlightA` **twice**       |
| `CoreElectricalAAssets.xml:152-160`      | `<SubPart>` SpotlightA art (`<PartModel>`/`<Mesh>`/`<Material>` + `_VM`) |
| `Shaders/Mesh/MeshIndirect.frag:29`      | `inStateFlags` varying (carries `StateBitFlag`)                          |
| `Shaders/Mesh/MeshIndirect.frag:236-237` | bit `1u<<6` = "No emissive"                                              |
| `Shaders/Mesh/MeshIndirect.frag:195-211` | emissive sample × `EMISSIVE_MULTIPLIER` (the glow)                       |

### flexo (relative to repo root)

| File:line                              | What                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `src/ksa/types.ts:270-298`             | `PowerConsumer` / `Light` interfaces                  |
| `src/ksa/types.ts:553,587`             | `powerConsumers: PowerConsumer[]` / `lights: Light[]` |
| `src/ksa/partXmlSerializer.ts:147-156` | `<PowerConsumer>` emission                            |
| `src/ksa/partXmlSerializer.ts:298-330` | `<Light>` emission (`buildLightElement`)              |
