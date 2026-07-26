# KSA Emissive Textures — why a glow can only be WHITE, and what the "LUT" actually is

**Purpose:** a complete, source-verified account of how KSA consumes an `<Emissive>` texture, why
no mod can make one emit coloured light, and what the "greyscale map keyed to a 1-px gradient LUT"
technique (as described by KSA's asset author) really is in the shipped engine. Written to settle
the question:

> **How do I make a flexo-authored glow emit GREEN light instead of white?**
> **Short answer: you can't — not from the emissive map.** KSA's part shader adds
> `white × mask × 1.25` and there is no colour input anywhere on that path. The LUT technique is
> real, but it is wired to the **temperature/heat** channel on a **different pipeline variant**
> that has emissive compiled out. Colour has to come from a `<Light>`, from the hard-coded
> battery status light, or from the diffuse (which only survives where the surface is lit).

**Sources (authoritative).** Decompiled C#: citations are `File.cs:line` relative to the decomp
root (so `KSA/PartModelRenderer.cs:111`). Shaders / game XML: relative to `Content/Core/` (so
`Shaders/Mesh/MeshIndirect.frag:276`). Baseline build **2026.7.9.5018**.

---

## 0. Executive summary

1. **`<Emissive>` is a single-channel mask, and the emitted colour is a literal `vec3(mask)`.**
   `MeshIndirect.frag:276-287` samples `.x` and adds `gammaToLinear(vec3(sampledEmissive) *
EMISSIVE_MULTIPLIER)`. No tint, no LUT, no per-material colour (§1).
2. **It is ADDED after all lighting.** In shadow it is the only term, so a glow always reads pure
   white there — exactly the reported symptom (§1.3).
3. **The one coloured branch is not data-authorable.** `addEmissiveColor` (state bit 7) uses a
   per-instance packed RGB that only `PartModelModule` sets, and only for
   `Battery.HasStatusLight` — the green→yellow→red charge indicator. It also **ignores the mask
   value**, so it has no falloff (§2).
4. **The dev's LUT = the temperature system.** `MeshIndirect.frag:295-298` keys a greyscale map
   (the `<ThinFilm>` texture's **G** channel) into `temperatureLut`, a 1×N gradient sampled at
   `vec2(key, 0.5)`. That is precisely "a 1px gradient that determines what the greyscale map is
   keyed to", and the reference image (black → dark red → red → orange → white) is a blackbody
   ramp, i.e. `Textures/TemperatureLut.png` (§3).
5. **Emissive and the LUT are mutually exclusive at the pipeline level.** `<PartModel>` compiles
   `ENABLE_EMISSIVE`; `<PartModelDynamic>` compiles `ENABLE_TEMPERATURE` instead. An `<Emissive>`
   on a `<PartModelDynamic>` SubPart is **never sampled** (§4). The shipped Core data obeys this
   perfectly — every category that ships an `<Emissive>` has zero `<PartModelDynamic>`, and vice
   versa (§4.2).
6. **The LUT cannot be replaced by a mod.** It is a single global texture bound at set 0 /
   binding 9, resolved by id from `ModLibrary`, whose registry is `TryAdd` — **first registration
   wins**, and Core loads first (§3.2).
7. **What actually produces colour in-game:** a `<Light>` with `<Color>` (§5.1), the battery
   status light (§5.2), or the diffuse under the white add (§5.3). flexo authors #1 and #3.

---

## 1. The `<Emissive>` path, line by line

### 1.1 The schema — five texture slots, zero scalars

`KSA/PbrMaterialReference.cs:8-22`:

```csharp
[XmlElement("Diffuse")]      public TextureReference? DiffuseReference;
[XmlElement("Normal")]       public TexturePowerReference? NormalReference;
[XmlElement("AoRoughMetal")] public TextureReference? PBRMap;
[XmlElement("Emissive")]     public TextureReference? EmissiveMap;
[XmlElement("ThinFilm")]     public TextureReference? ThinFilmMap;
```

`TextureReference` carries only `Path` + a `Category` attribute (`KSA/TextureReference.cs:41`).
**There is no emissive colour, intensity, or LUT field to author.**

### 1.2 The shader

`Shaders/Mesh/MeshIndirect.frag:273-291`:

```glsl
#ifdef ENABLE_EMISSIVE
if (emissive && drawData.emissiveTextureIndex >= 0)
{
    float sampledEmissive = texture(..., inUv).x;      // 276 — single channel, .x only
    if (sampledEmissive.x != 0.0)                      // 277 — any non-zero emits
    {
        if (addEmissiveColor) {                        // 279 — see §2
            vec3 unpacked = unpackRGB(inEmissiveColor);
            unpacked = gammaToLinear(unpacked * EMISSIVE_MULTIPLIER);
            lightColor += unpacked;                    // 282 — mask VALUE is discarded here
        }
        else
        {
            vec3 emissive = gammaToLinear(vec3(sampledEmissive) * EMISSIVE_MULTIPLIER);
            lightColor += emissive;                    // 287 — white, proportional to the mask
        }
    }
}
#endif
```

- `EMISSIVE_MULTIPLIER = 1.25` — `Shaders/Common/Lighting.glsl:9`.
- `gammaToLinear(x) = pow(x, 2.2)` — `Shaders/Common/Shared.glsl:203-206`.
- `vec3(sampledEmissive)` is the whole story: **a greyscale mask broadcast to RGB.** A mask of
  1.0 adds `pow(1.25, 2.2) ≈ 1.63` linear white.
- The gate `emissive` is state bit 6, cleared when a `PowerConsumer` light switch is off or
  unpowered (`KSA/PartModelModule.cs:98-107`). See `analysis/HOW_LIGHT_PARTS_WORK.md`.
- `ThumbnailMesh.frag:76-83` repeats the same white-only block for the part-picker thumbnail, and
  `MeshIndirectRaytraced.frag:263-279` for the ray-traced variant. Every path agrees.

### 1.3 Why it reads white in shadow

The emissive is added to `lightColor` **after** direct sun, shadows, planetshine, clustered
lights and ambient IBL. Where the surface is unlit, every other term is ~0, so the fragment is
`pow(mask × 1.25, 2.2)` in all three channels — achromatic by construction. Baking a colour into
the diffuse (flexo's approach) tints the _lit_ result but cannot survive here: the additive white
is independent of albedo.

Practical consequence for authoring: **the mask value is the only knob that keeps a glow from
blowing out to white.** A mask of 0.3 adds ≈0.16 linear, which a saturated diffuse still reads
through; a mask of 1.0 adds ≈1.63 and swamps everything.

### 1.4 Glass never glows

`PartModelGlass` compiles `ENABLE_EMISSIVE` (`KSA/PartModelGlass.cs:209`) so the vertex/fragment
interfaces match, but `MeshGlassIndirect.frag:44` declares `inEmissiveColor` _"unused but must
match vertex output"_ and the shader never samples `emissiveTextureIndex`. An `<Emissive>` on a
`<PartModelGlass>` material is dead weight.

---

## 2. The one coloured branch: the battery status light

`addEmissiveColor` is state bit 7. The only writer is `KSA/PartModelModule.cs:110-140`:

```csharp
if (Parent.FullPart.Modules.TryGetTypeList(out Module<Battery>.List typeList)) {
    Battery battery = typeList[0];
    if (battery.HasStatusLight) {
        num |= 0x80;                                     // bit 7 → addEmissiveColor
        float f = battery.FilledFraction(...);
        if (f > 0.5f)        preset = float4.Rgb(lerp(1,0,(f-0.5f)/0.5f), 1f, 0f);  // green
        else if (f > 0.25f)  preset = float4.Rgb(1f, lerp(0,1,(f-0.25f)/0.25f), 0f); // amber
        else                 preset = f > 0 ? Color.Red : Color.Black;
    }
}
… EmissiveColor = PackByte3(asByte.R, asByte.G, asByte.B)
```

`HasStatusLight` **is** authorable — `KSA/BatteryTemplate.cs:11` is a plain public field, so
`<Battery HasStatusLight="true" MaximumCapacity="…"/>` works from a mod. That makes this the only
data-only route to a coloured emissive today, with three hard caveats:

- the colour is **charge-driven**, not chosen (full = pure green `Rgb(0,1,0)`, empty = black);
- it applies to **every emissive texel of the whole Part**, not one SubPart;
- line 282 adds the flat colour wherever `mask != 0` — the mask's _value_ is discarded, so there
  is **no falloff**. This is exactly the "conventional emissive map" weakness the asset author
  contrasted the LUT against.

---

## 3. The LUT the asset author described

### 3.1 It is the temperature channel

`Shaders/Mesh/MeshIndirect.frag:293-300`:

```glsl
#ifdef ENABLE_TEMPERATURE
if (inTemperature > 0) {
    float heatFactor = sampledHeatTFI.g;                        // greyscale map
    heatFactor *= inTemperature * 1.75f;
    vec3 heatColor = texture(temperatureLut, vec2(heatFactor, 0.5)).rgb;   // 1-px gradient LUT
    lightColor += vec3(pow(heatColor, vec3(2))) * 2.25f;
}
#endif
```

`sampledHeatTFI` is the `<ThinFilm>` texture (`*_TFI`), packed per the shader's own comment at
`MeshIndirect.frag:135-138`:

| Channel   | Meaning                                                 |
| --------- | ------------------------------------------------------- |
| X / R     | thin-film (re-entry iridescence) thickness              |
| **Y / G** | **heat gradient — the greyscale map that keys the LUT** |
| Z / B     | frost gradient                                          |

The `vec2(key, 0.5)` sample is the giveaway: a **1-pixel-tall gradient**, indexed left→right by
the greyscale value. Same idiom as the thin-film LUT
(`Shaders/Common/SharedFrag.glsl:53`).

### 3.2 The LUT is a global asset a mod cannot replace

- Declared once: `DefaultAssets.xml:327` — `<Texture Id="TemperatureLut" Path="Textures/TemperatureLut.png" />`
  (its sibling at 326 is `ThinFilmInterferenceLut`).
- Resolved by id and bound globally: `KSA/GlobalShaderBindings.cs:215` (`ModLibrary.Get<TextureReference>("TemperatureLut")`)
  → set 0, binding 9 (`:257`, matching `MeshIndirect.frag:48`).
- `ModLibrary` registration is `_collection.TryAdd(item.Hash, item)` — `KSA/SerializedCollection.cs:20-35`.
  **First registration wins**, and Core loads before mods, so re-declaring `TemperatureLut` in a
  mod is silently ignored.

So the LUT is one blackbody ramp shared by the whole game. There is no per-material LUT slot.

### 3.3 …and it is gated on real thermal state

`inTemperature` is the instance's `FxTemperature.EmissivityFraction`
(`KSA/PartModelDynamicModule.cs:113-118`). `FxTemperature` is not authorable: it is auto-created
for a Part **only if one of its SubParts has a `PartModelDynamicModule`**
(`KSA/FxTemperature.cs:23-49`), and its value is driven by rocket-plume heat and cryogenic tank
contents. A lamp cannot drive it.

---

## 4. The pipeline split — emissive XOR temperature

### 4.1 Two shader variants of one source file

`KSA/PartModelRenderer.ColorData` compiles `MeshIndirect.vert/frag` twice:

| Pipeline                                 | Macros                                                                                | Built at                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| `Pipeline` (static `<PartModel>`)        | `ENABLE_EMISSIVE`, `ENABLE_THIN_FILM` (+`ENABLE_WETNESS`/`ENABLE_FROST` per settings) | `PartModelRenderer.cs:111-112` |
| `PipelineDynamic` (`<PartModelDynamic>`) | `ENABLE_TEMPERATURE`, `ENABLE_THIN_FILM` (+ same settings)                            | `PartModelRenderer.cs:200-201` |

and draws them back to back — `PartModelRenderer.cs:343-345`:

```csharp
PartModel.Shared.WriteCommandsColor(inCommandBuffer, viewport, frameIndex);
inCommandBuffer.BindPipeline(VkPipelineBindPoint.Graphics, PipelineDynamic);
PartModelDynamic.Shared.WriteCommandsColor(inCommandBuffer, viewport, frameIndex);
```

`ENABLE_EMISSIVE` is absent from the dynamic variant, so `MeshIndirect.frag:324-326` takes the
`#else` branch (`emissive = false`) and the whole block at 273-291 is preprocessed out.

> **Rule: an `<Emissive>` on a `<PartModelDynamic>` SubPart renders nothing, and a heat/frost
> gradient on a `<PartModel>` SubPart renders nothing.** You pick one per SubPart.

The pre-pass mirrors the split (`PartModelRenderer.cs:545`/`595`), and the ray-traced path enables
emissive only (`KSA.Rendering.Raytracing/RaytracingRenderer.cs:229,657`).

### 4.2 The shipped data obeys it exactly

`<Emissive>` and `<PartModelDynamic>` counts per Core asset file (build 5018):

| File                          | `<Emissive>` | `<PartModelDynamic>` | `<PartModel>` |
| ----------------------------- | ------------ | -------------------- | ------------- |
| CoreCommandAAssets.xml        | 1            | 0                    | 12            |
| CoreElectricalAAssets.xml     | 1            | 0                    | 26            |
| CoreIVAPropAAssets.xml        | 1            | 0                    | 69            |
| CorePassageAAssets.xml        | 1            | 0                    | 15            |
| PartAssets.xml                | 1            | 0                    | 1             |
| **CoreFuelTankAAssets.xml**   | **0**        | **34**               | 0             |
| **CorePropulsionAAssets.xml** | **0**        | **46**               | 0             |
| **CorePropulsionCAssets.xml** | **0**        | **12**               | 0             |
| (all others)                  | 0            | 0                    | —             |

The dynamic categories are precisely the ones that get hot or frosty (tanks, engines), and they
ship `*_TFI*` atlases instead of `*_Emissive` ones.

---

## 5. What CAN be coloured, and how

### 5.1 `<Light>` — the real answer for a coloured lamp

`KSA/LightModule.cs:11-42` — `<Light>` under `<SubPartGameData>`:

```xml
<Light>
  <Type>Point</Type>            <!-- or Spot -->
  <Transform><Position .../></Transform>
  <Range Value="5"/>
  <Intensity Value="10"/>
  <Color R="0" G="1" B="0"/>    <!-- ColorRgbReference, default Gray -->
  <InnerAngle Value="0.3927"/>  <!-- Spot only -->
  <OuterAngle Value="0.7854"/>
</Light>
```

This becomes a real clustered punctual light (`LightModule.cs:101`/`117`), which is folded into
every nearby fragment through `SampleLightPrePass` — including the emitting part's own surface.
So the physically-correct read of a green LED — a **white-hot core** (the emissive mask) with
**green spill** on the surrounding geometry — is exactly what KSA gives you when you pair a small
emissive mask with a coloured `<Light>`. This is how Core's own light parts work.

flexo authors this today (`src/ksa/types.ts` `Light`, `partXmlSerializer.ts:483-509`,
`LightsSection` in `src/ui/GameDataSections.tsx`).

### 5.2 Battery status light

See §2. Green at full charge, whole-part, no falloff.

### 5.3 Colour in the diffuse

The glow colour lives in the base colour at the glowing texels, and the white emissive is added on
top. Readable wherever the surface receives _any_ light; washes to white as the mask rises. This
is what flexo bakes — see `src/ktx/glowComposite.ts` and §6.

---

## 6. How flexo models all of this

`src/ktx/glowComposite.ts` turns a **glow bitmap** (`rgb` = colour, `a` = the greyscale key) plus
`{ coverage, strength, ramp }` into the exact pair KSA consumes:

```
key        = glow.a / 255                                   // the greyscale map
colour     = ramp ? sampleGlowRamp(ramp, key) : glow.rgb    // the LUT, evaluated on the CPU
diffuse[i] = lerp(base[i], colour, key * coverage)          // → <Diffuse>  (sRGB)
mask[i]    = key * strength                                 // → <Emissive> (linear, KSA reads R)
```

Two deliberate consequences:

- **`coverage` and `strength` are independent.** They used to be one slider, which made
  "saturated colour + gentle white core" — the only setting that reads coloured in-game —
  impossible to author.
- **The ramp is baked, not shipped.** KSA has no per-material LUT (§3.2), so flexo evaluates the
  ramp at export and the game only ever sees the greyscale mask it supports. The authoring
  ergonomics match the asset author's description (greyscale map + 1-px gradient, smooth colour
  falloff); the runtime behaviour is whatever KSA can actually render.

`src/three/normalMapPatch.ts` previews the emissive with the identical curve
(`pow(mask × 1.25, 2.2)`, added, white), so the editor never promises colour the game won't
deliver.

---

## 7. Open question for the KSA team

The asset author's "tied into a shader so you'll need to look into that too" is the whole blocker.
Concretely, what would unlock coloured mod emissives is one of:

1. a per-material `<EmissiveLut>` slot on `PbrMaterialReference` sampled at
   `vec2(sampledEmissive, 0.5)` — the exact technique already implemented for temperature; or
2. an authorable emissive tint feeding the existing `addEmissiveColor` branch (which would also
   need the mask value re-applied at `MeshIndirect.frag:282` to keep the falloff); or
3. `ENABLE_EMISSIVE` added to the dynamic pipeline so a SubPart can have both.

Until one of those lands, §5.1 (`<Light>` + a modest white mask) is the supported way to make a
KSA part look like it emits coloured light.

---

## 8. Citation index

| Reference                                | What it establishes                                                 |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `Shaders/Mesh/MeshIndirect.frag:276-287` | emissive sampled `.x`, added as `vec3(mask) × 1.25`, gamma 2.2      |
| `Shaders/Mesh/MeshIndirect.frag:279-282` | the `addEmissiveColor` branch discards the mask value               |
| `Shaders/Mesh/MeshIndirect.frag:293-300` | the temperature LUT: greyscale G channel → 1-px gradient            |
| `Shaders/Mesh/MeshIndirect.frag:135-138` | `<ThinFilm>`/TFI packing (R=thin film, G=heat, B=frost)             |
| `Shaders/Mesh/MeshIndirect.frag:46-49`   | `temperatureLut` at set 0 / binding 9, `ENABLE_TEMPERATURE` only    |
| `Shaders/Common/Lighting.glsl:9`         | `EMISSIVE_MULTIPLIER = 1.25`                                        |
| `Shaders/Common/Shared.glsl:203-206`     | `gammaToLinear(x) = pow(x, 2.2)`                                    |
| `Shaders/Mesh/MeshGlassIndirect.frag:44` | glass carries the emissive varying but never samples it             |
| `DefaultAssets.xml:326-327`              | `ThinFilmInterferenceLut`, `TemperatureLut` texture ids             |
| `KSA/PbrMaterialReference.cs:8-22`       | the five material slots; no colour/LUT field                        |
| `KSA/PartModelRenderer.cs:111-112`       | `<PartModel>` = `ENABLE_EMISSIVE` + `ENABLE_THIN_FILM`              |
| `KSA/PartModelRenderer.cs:200-201`       | `<PartModelDynamic>` = `ENABLE_TEMPERATURE` + `ENABLE_THIN_FILM`    |
| `KSA/PartModelRenderer.cs:343-345`       | both pipelines bound + drawn in the colour pass                     |
| `KSA/PartModelModule.cs:98-107`          | state bit 6 = "no emissive" (the light switch)                      |
| `KSA/PartModelModule.cs:110-140`         | battery status light → bit 7 + packed `EmissiveColor`               |
| `KSA/BatteryTemplate.cs:11`              | `HasStatusLight` is XML-authorable                                  |
| `KSA/GlobalShaderBindings.cs:215,257`    | `TemperatureLut` resolved by id, bound globally                     |
| `KSA/SerializedCollection.cs:20-35`      | `TryAdd` ⇒ first registration wins (Core is first)                  |
| `KSA/FxTemperature.cs:23-49`             | auto-created only for Parts with a `PartModelDynamicModule` SubPart |
| `KSA/PartModelDynamicModule.cs:113-118`  | `inTemperature` = `FxTemperature.EmissivityFraction`                |
| `KSA/LightModule.cs:11-42`               | `<Light>` schema incl. `<Color>`                                    |
