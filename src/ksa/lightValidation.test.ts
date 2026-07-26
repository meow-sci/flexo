import { describe, it, expect } from 'vitest'
import { validateLights } from './lightValidation'
import { MAX_OUTER_ANGLE_RAD } from './lightFalloff'
import {
  DEFAULT_LAYER_ID,
  createEmptyPart,
  createPartLight,
  createPowerConsumer,
  identityTransform,
  type EditingPart,
  type PartLight,
} from './types'

/**
 * The canonical Core spotlight — `CoreElectricalA_Subpart_SpotlightA` (Range 5, Intensity
 * 10, white, 22.5°/45° half-cones) — which is exactly what `createPartLight` seeds, so a
 * default light IS the clean fixture.
 */
function light(over: Partial<PartLight> = {}): PartLight {
  return { ...createPartLight(null, '_light1'), ...over }
}

function placed(
  templateId: string,
  scale = { x: 1, y: 1, z: 1 },
): EditingPart['placements'][number] {
  return {
    ...identityTransform(),
    instanceId: `inst_${templateId}`,
    subPartTemplateId: templateId,
    scale,
    layerId: DEFAULT_LAYER_ID,
  }
}

/**
 * A part with one placed SubPart and a light switch. The switch matters: a part with
 * lights and NO `<PowerConsumer LightSwitch>` always trips `light-always-on`, which is
 * its own test below — every other case wants a part that is otherwise quiet.
 */
function switchedPart(): EditingPart {
  const part = createEmptyPart()
  part.placements.push(placed('Spotlight'))
  part.gameData.powerConsumer = createPowerConsumer()
  return part
}

const codes = (part: EditingPart) => validateLights(part).map((i) => i.code)

describe('validateLights', () => {
  it('says nothing at all about a part with no lights', () => {
    const part = switchedPart()
    expect(validateLights(part)).toEqual([])
    expect(validateLights(createEmptyPart())).toEqual([])
  })

  it('is silent for the Core CoreElectricalA spotlight (R=5, I=10, 22.5°/45°)', () => {
    const part = switchedPart()
    part.lights.push(light({ ownerTemplateId: 'Spotlight' }))
    expect(validateLights(part)).toEqual([])
  })

  it('is silent for a healthy part-level Point light', () => {
    const part = switchedPart()
    // Core's CoreIVASpaceA interior lamp: dim, warm, ray-traced, angles irrelevant.
    part.lights.push(
      light({
        type: 'Point',
        rangeM: 1.5,
        intensity: 0.05,
        color: { r: 1, g: 0.9, b: 0.7 },
        rayTracing: true,
      }),
    )
    expect(validateLights(part)).toEqual([])
  })

  it('warns that a Range ≤ 0 light is culled CPU-side, not by the shader', () => {
    const part = switchedPart()
    part.lights.push(light({ rangeM: 0 }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-range-nonpositive'])
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].lightId).toBe('_light1')
    expect(issues[0].message).toMatch(/ClusteredLightSystem\.cs:669,760/)
    // The corrected claim: the old "TileFrustum culls it" story must not come back.
    expect(issues[0].message).not.toMatch(/TileFrustum/)
  })

  it('warns about a negative Range too', () => {
    const part = switchedPart()
    part.lights.push(light({ rangeM: -3 }))
    expect(codes(part)).toEqual(['light-range-nonpositive'])
  })

  it('warns that an Intensity ≤ 0 light is culled CPU-side', () => {
    const part = switchedPart()
    part.lights.push(light({ intensity: 0 }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-intensity-nonpositive'])
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].message).toMatch(/ClusteredLightSystem\.cs:760/)
  })

  it('stays quiet at a tiny but positive range and intensity', () => {
    const part = switchedPart()
    part.lights.push(light({ rangeM: 1e-6, intensity: 1e-6 }))
    expect(validateLights(part)).toEqual([])
  })

  it('warns when a Spot has its cone angles the wrong way round (the game swaps them)', () => {
    const part = switchedPart()
    part.lights.push(light({ innerAngleRad: 0.8, outerAngleRad: 0.4 }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-angles-swapped'])
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].message).toMatch(/Light\.cs:56-61/)
  })

  it('never nags about swapped angles on a Point light (KSA ignores them)', () => {
    const part = switchedPart()
    part.lights.push(light({ type: 'Point', innerAngleRad: 0.8, outerAngleRad: 0.4 }))
    expect(validateLights(part)).toEqual([])
  })

  it('allows equal inner and outer angles (a hard-edged cone, not a swap)', () => {
    const part = switchedPart()
    part.lights.push(light({ innerAngleRad: 0.4, outerAngleRad: 0.4 }))
    expect(validateLights(part)).toEqual([])
  })

  it('reports the Core FLOODLIGHT (outer 1.57) as exactly one INFO, not a warning', () => {
    const part = switchedPart()
    // CoreElectricalA_Subpart_FloodlightA verbatim: a deliberate hemisphere that leans on
    // KSA's own clamp — it must never read as an authoring mistake.
    part.lights.push(
      light({ ownerTemplateId: 'Spotlight', rangeM: 3, innerAngleRad: 0.23, outerAngleRad: 1.57 }),
    )
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-outer-overclamp'])
    expect(issues[0].severity).toBe('info')
    expect(issues[0].message).toMatch(/89\.94/)
  })

  it('takes the overclamp threshold as KSA MAX_OUTER_ANGLE exactly', () => {
    const part = switchedPart()
    part.lights.push(light({ outerAngleRad: MAX_OUTER_ANGLE_RAD }))
    expect(validateLights(part)).toEqual([])

    part.lights[0].outerAngleRad = MAX_OUTER_ANGLE_RAD + 1e-9
    expect(codes(part)).toEqual(['light-outer-overclamp'])
  })

  it('warns that a light on an unplaced template is never instantiated', () => {
    const part = switchedPart()
    part.lights.push(light({ ownerTemplateId: 'Gone' }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-owner-unplaced'])
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].lightId).toBe('_light1')
  })

  it('never reports an unplaced owner for a PART-level light (it has no owner)', () => {
    const part = createEmptyPart()
    part.gameData.powerConsumer = createPowerConsumer()
    part.lights.push(light())
    expect(validateLights(part)).toEqual([])
  })

  it('warns when an owner placement has a non-uniform scale (the in-game aim skews)', () => {
    const part = switchedPart()
    part.placements[0].scale = { x: 2, y: 1, z: 1 }
    part.lights.push(light({ ownerTemplateId: 'Spotlight' }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-owner-nonuniform-scale'])
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].message).toMatch(/inst_Spotlight/)
  })

  it('accepts a UNIFORM non-unit owner scale (quaternion compose is exact there)', () => {
    const part = switchedPart()
    part.placements[0].scale = { x: 3, y: 3, z: 3 }
    part.lights.push(light({ ownerTemplateId: 'Spotlight' }))
    expect(validateLights(part)).toEqual([])
  })

  it('warns about a MIRRORED owner — flexo cannot draw the flipped in-game beam', () => {
    const part = switchedPart()
    // Uniform, so the non-uniform rule cannot see it: (−1,−1,−1) is precisely the case
    // where the quaternion compose and KSA's normalized improper map disagree by 180°.
    part.placements[0].scale = { x: -1, y: -1, z: -1 }
    part.lights.push(light({ ownerTemplateId: 'Spotlight' }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-owner-mirrored'])
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].message).toMatch(/180/)
  })

  it('reports BOTH skew and mirror for a single-axis flip', () => {
    const part = switchedPart()
    part.placements[0].scale = { x: 1, y: 1, z: -1 }
    expect(codes(part)).toEqual([])
    part.lights.push(light({ ownerTemplateId: 'Spotlight' }))
    expect(codes(part)).toEqual(['light-owner-nonuniform-scale', 'light-owner-mirrored'])
  })

  it('finds a bad owner placement even when a sibling placement is fine', () => {
    const part = switchedPart()
    part.placements.push({ ...placed('Spotlight', { x: -1, y: -1, z: -1 }), instanceId: 'inst_2' })
    part.lights.push(light({ ownerTemplateId: 'Spotlight' }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-owner-mirrored'])
    expect(issues[0].message).toMatch(/inst_2/)
  })

  it('notes that lights with no light switch are permanently on, ONCE per part', () => {
    const part = createEmptyPart()
    part.placements.push(placed('Spotlight'))
    part.lights.push(light({ id: '_light1' }))
    part.lights.push(light({ id: '_light2' }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-always-on'])
    expect(issues[0].severity).toBe('info')
    expect(issues[0].lightId).toBeNull()
    expect(issues[0].message).toMatch(/HOW_LIGHT_PARTS_WORK/)
  })

  it('still notes always-on when the part has a NON-switch power consumer', () => {
    // A plain always-on draw (avionics) is never selected as Part.LightSwitch.
    const part = createEmptyPart()
    part.lights.push(light())
    part.gameData.powerConsumer = { consumedWatts: 12, lightSwitch: false, lightIsActive: false }
    expect(codes(part)).toEqual(['light-always-on'])
  })

  it('does not raise always-on for a part with no lights', () => {
    const part = createEmptyPart()
    part.placements.push(placed('Spotlight'))
    expect(validateLights(part)).toEqual([])
  })

  it('notes a black light as an invisible one', () => {
    const part = switchedPart()
    part.lights.push(light({ color: { r: 0, g: 0, b: 0 } }))
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual(['light-color-black'])
    expect(issues[0].severity).toBe('info')
  })

  it('takes black as "every channel below 0.01", not exact zero', () => {
    const part = switchedPart()
    part.lights.push(light({ color: { r: 0.005, g: 0.001, b: 0 } }))
    expect(codes(part)).toEqual(['light-color-black'])

    part.lights[0].color = { r: 0.005, g: 0.001, b: 0.02 }
    expect(validateLights(part)).toEqual([])
  })

  it('reports every problem of a thoroughly broken light, and names it in each', () => {
    const part = createEmptyPart()
    part.lights.push(
      light({
        id: '_light7',
        ownerTemplateId: 'Gone',
        rangeM: 0,
        intensity: -1,
        innerAngleRad: 1.2,
        outerAngleRad: 0.3,
        color: { r: 0, g: 0, b: 0 },
      }),
    )
    const issues = validateLights(part)
    expect(issues.map((i) => i.code)).toEqual([
      'light-range-nonpositive',
      'light-intensity-nonpositive',
      'light-angles-swapped',
      'light-color-black',
      'light-owner-unplaced',
      'light-always-on',
    ])
    for (const issue of issues) {
      if (issue.code === 'light-always-on') continue
      expect(issue.lightId).toBe('_light7')
      expect(issue.message).toContain('_light7')
    }
  })

  it('never grades anything as blocking (a <Light> cannot stop KSA loading a mod)', () => {
    const part = createEmptyPart()
    part.lights.push(light({ ownerTemplateId: 'Gone', rangeM: 0, intensity: 0 }))
    for (const issue of validateLights(part)) {
      expect(['warn', 'info']).toContain(issue.severity)
    }
  })
})
