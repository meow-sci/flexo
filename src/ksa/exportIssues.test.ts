import { describe, it, expect } from 'vitest';
import {
  collectExportIssues,
  collectProjectExportIssues,
  countBySeverity,
  type ExportIssue,
} from './exportIssues';
import {
  DEFAULT_LAYER_ID,
  createCombustor,
  createCustomReaction,
  createEmptyPart,
  createPartLight,
  createSolidMotor,
  identityTransform,
  type CustomMesh,
  type CustomReaction,
  type EditingPart,
} from './types';
import { partExportNs, type NamedExportPart } from './modExport';
import type { CatalogSubPart } from './catalog';
import type { ReactionData } from './reactionCatalog';

/**
 * The unified pre-flight model (P10.01). The four validators have their own exhaustive
 * suites — what is checked here is the MAPPING: severity and message carried verbatim, the
 * basic trio folded in with v1's copy, jump targets present exactly where a source names a
 * scope, and the unplaced-custom-mesh note.
 */

const NO_REACTIONS: ReadonlyMap<string, ReactionData> = new Map();
const NO_CATALOG: ReadonlyMap<string, CatalogSubPart> = new Map();

function placed(templateId: string, instanceId = `inst_${templateId}`) {
  return {
    ...identityTransform(),
    instanceId,
    subPartTemplateId: templateId,
    layerId: DEFAULT_LAYER_ID,
  };
}

function mesh(subPartId: string, name = subPartId): CustomMesh {
  return {
    id: `mesh_${subPartId}`,
    name,
    subPartId,
    primitive: { kind: 'box', params: { width: 1, height: 1, depth: 1 } },
    faceTextures: {},
  };
}

const issuesOf = (part: EditingPart): ExportIssue[] =>
  collectExportIssues(part, NO_REACTIONS, NO_CATALOG);
const codes = (part: EditingPart) => issuesOf(part).map((i) => i.code);
const find = (part: EditingPart, code: string) => issuesOf(part).find((i) => i.code === code);

/** A part that trips nothing: an id and one placement. */
function cleanPart(): EditingPart {
  const part = createEmptyPart();
  part.partId = 'rover_1';
  part.placements.push(placed('CoreFuelTankA_Subpart_TankA'));
  return part;
}

describe('collectExportIssues — the basic trio', () => {
  it('reports an empty part on both counts, with v1 copy verbatim', () => {
    const part = createEmptyPart();
    part.partId = '';
    const found = issuesOf(part);
    expect(found.map((i) => i.message)).toEqual(['Part Id is empty.', 'No SubParts placed.']);
    expect(found.map((i) => i.severity)).toEqual(['warn', 'warn']);
    expect(found.every((i) => i.area === 'part')).toBe(true);
  });

  it('says nothing about the basic trio for a part with an id and a placement', () => {
    // The clean part still trips the collider validator's `collider-none` warning — the
    // trio is what this case is about.
    expect(issuesOf(cleanPart()).filter((i) => i.area === 'part')).toEqual([]);
  });

  it('blocks on duplicate instance ids (KSA refuses the Part)', () => {
    const part = cleanPart();
    part.placements.push(placed('CoreFuelTankA_Subpart_TankA', 'inst_CoreFuelTankA_Subpart_TankA'));
    const dupe = find(part, 'duplicate-instance-ids')!;
    expect(dupe.severity).toBe('block');
    expect(dupe.message).toBe('Duplicate instance ids: inst_CoreFuelTankA_Subpart_TankA');
    expect(dupe.jumpTarget).toEqual({ mode: 'build' });
  });

  it('points an empty Part Id at Data mode’s Identity section', () => {
    const part = cleanPart();
    part.partId = '   ';
    expect(find(part, 'part-id-empty')!.jumpTarget).toEqual({
      mode: 'data',
      focus: { scope: { kind: 'part' }, sectionId: 'identity' },
    });
  });
});

describe('collectExportIssues — validator mapping', () => {
  it('carries a collider block through with its message and area', () => {
    const part = cleanPart();
    part.colliders.push({
      ...identityTransform(),
      id: '_collider1',
      shape: 'Box',
      ownerTemplateId: null,
      layerId: DEFAULT_LAYER_ID,
      scale: { x: 0, y: 1, z: 1 },
    });
    const found = find(part, 'collider-degenerate')!;
    expect(found.severity).toBe('block');
    expect(found.area).toBe('collider');
    expect(found.message).toContain('degenerate');
    // No entity id in the validator output ⇒ no jump (a jump would land nowhere useful).
    expect(found.jumpTarget).toBeUndefined();
  });

  it('maps a light warning to a Build-mode jump that selects the light', () => {
    const part = cleanPart();
    const light = createPartLight(null, '_light1');
    light.rangeM = 0; // culled CPU-side — `light-range-nonpositive`
    part.lights.push(light);
    const found = find(part, 'light-range-nonpositive')!;
    expect(found.severity).toBe('warn');
    expect(found.area).toBe('light');
    expect(found.jumpTarget).toEqual({
      mode: 'build',
      focus: { entity: { kind: 'light', id: '_light1' } },
    });
  });

  it('keeps a light `info` at info severity and omits the jump for the part-wide rule', () => {
    const part = cleanPart();
    part.lights.push(createPartLight(null, '_light1'));
    const alwaysOn = find(part, 'light-always-on')!;
    expect(alwaysOn.severity).toBe('info');
    expect(alwaysOn.jumpTarget).toBeUndefined();
  });

  it('targets an engine issue at the module that owns it', () => {
    const part = cleanPart();
    const combustor = createCombustor('comb1');
    combustor.reactionId = ''; // no reaction selected — the design's own example blocker
    part.gameData.combustors.push(combustor);
    const found = issuesOf(part).find((i) => i.area === 'engine');
    expect(found).toBeDefined();
    expect(found!.jumpTarget).toEqual({
      mode: 'engine',
      focus: { engineScope: { kind: 'part' }, group: 'combustor' },
    });
  });
});

describe('collectExportIssues — unplaced custom meshes (D10)', () => {
  it('notes exactly one info issue naming only the unplaced meshes', () => {
    const part = cleanPart();
    part.customMeshes.push(mesh('flexo_hull', 'Hull'), mesh('flexo_fin', 'Fin'));
    part.placements.push(placed('flexo_hull'));
    const found = issuesOf(part).filter((i) => i.area === 'asset');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('info');
    expect(found[0].message).toBe('1 custom mesh has no placements and will not ship: Fin');
    expect(found[0].jumpTarget).toEqual({ mode: 'surface' });
  });

  it('says nothing when every custom mesh is placed', () => {
    const part = cleanPart();
    part.customMeshes.push(mesh('flexo_hull', 'Hull'));
    part.placements.push(placed('flexo_hull'));
    expect(codes(part)).not.toContain('custom-mesh-unplaced');
  });

  it('pluralises and lists every unplaced mesh', () => {
    const part = cleanPart();
    part.customMeshes.push(mesh('flexo_hull', 'Hull'), mesh('flexo_fin', 'Fin'));
    expect(find(part, 'custom-mesh-unplaced')!.message).toBe(
      '2 custom meshes have no placements and will not ship: Hull, Fin',
    );
  });
});

// ── the cross-part preflight (MULTI_PART_PLAN P3.02) ─────────────────────────
//
// KSA's mod library registers `<Part>` ids, `<SubPart>` ids and `<FixedReaction>` ids
// GLOBALLY, first-wins — a collision does not error at load, it silently ships the wrong
// asset. These blockers are the only thing standing between that and the user.

/** Core's own catalog, empty here: each part is graded against ITS OWN customs only. */
const NO_CORE_REACTIONS: readonly ReactionData[] = [];

/** `toNamedExportParts`-shaped entry — the `ns` is minted exactly as the state layer mints it. */
function named(name: string, part: EditingPart): NamedExportPart {
  return { entryId: `pt_${name}`, name, ns: partExportNs(part.partId), part };
}

const projectIssues = (...parts: NamedExportPart[]) =>
  collectProjectExportIssues(parts, NO_CORE_REACTIONS, NO_CATALOG);
const projectCodes = (...parts: NamedExportPart[]) => projectIssues(...parts).map((i) => i.code);
const projectFind = (parts: NamedExportPart[], code: string) =>
  projectIssues(...parts).find((i) => i.code === code);

describe('collectProjectExportIssues — cross-part blockers', () => {
  it('blocks an export that includes no parts at all (D4)', () => {
    // Nothing to stamp it with, so it carries neither part field.
    expect(collectProjectExportIssues([], NO_CORE_REACTIONS, NO_CATALOG)).toEqual([
      {
        severity: 'block',
        area: 'part',
        code: 'no-parts-included',
        message: 'No parts are included in the export.',
      },
    ]);
  });

  it('blocks two parts that ship the same Part Id, naming both', () => {
    const parts = [named('Hull', cleanPart()), named('Tank', cleanPart())]; // both 'rover_1'
    const dupe = projectFind(parts, 'duplicate-part-id')!;
    expect(dupe.severity).toBe('block');
    expect(dupe.area).toBe('part');
    expect(dupe.message).toBe("Parts 'Hull' and 'Tank' both use the Part Id 'rover_1'.");
    // Said ONCE, and never also as a namespace collision (identical ids share an `ns`).
    expect(projectCodes(...parts).filter((c) => c === 'duplicate-part-id')).toHaveLength(1);
    expect(projectCodes(...parts)).not.toContain('part-id-collision');
  });

  it('blocks Part Ids that DIFFER but sanitize to one export namespace', () => {
    const a = cleanPart();
    a.partId = 'my-part';
    const b = cleanPart();
    b.partId = 'my part';
    // The collision is real, not staged: `ns` IS partExportNs(partId) by construction.
    expect(partExportNs(a.partId)).toBe(partExportNs(b.partId));
    const parts = [named('Left', a), named('Right', b)];
    const found = projectFind(parts, 'part-id-collision')!;
    expect(found.severity).toBe('block');
    expect(found.message).toBe(
      "Part Ids 'my-part' and 'my part' collide after sanitization ('mypart').",
    );
    // Different ids, so this is NOT the duplicate-Part-Id case.
    expect(projectCodes(...parts)).not.toContain('duplicate-part-id');
  });

  it('accepts two parts whose ids sanitize apart', () => {
    const a = cleanPart();
    a.partId = 'rover_a';
    const b = cleanPart();
    b.partId = 'rover_b';
    const codes = projectCodes(named('A', a), named('B', b));
    expect(codes).not.toContain('part-id-collision');
    expect(codes).not.toContain('duplicate-part-id');
  });

  it('blocks a custom-mesh SubPart id claimed by two parts (I4)', () => {
    const withMesh = (partId: string) => {
      const part = cleanPart();
      part.partId = partId;
      part.customMeshes.push(mesh('flexo_hull', 'Hull'));
      part.placements.push(placed('flexo_hull'));
      return part;
    };
    const parts = [named('Nose', withMesh('rover_a')), named('Tail', withMesh('rover_b'))];
    const found = projectFind(parts, 'duplicate-custom-mesh-id')!;
    expect(found.severity).toBe('block');
    expect(found.area).toBe('asset');
    expect(found.message).toBe(
      "Custom mesh id 'flexo_hull' is used by both 'Nose' and 'Tail'. " +
        'Ids must be unique across the whole project.',
    );
  });

  it('does not fire the mesh-id blocker within ONE part', () => {
    // The blocker is about two PARTS claiming an id; one part repeating itself is not that.
    const part = cleanPart();
    part.customMeshes.push(mesh('flexo_hull', 'Hull'), mesh('flexo_hull', 'Hull'));
    expect(projectCodes(named('Solo', part))).not.toContain('duplicate-custom-mesh-id');
  });
});

/** A user-authored propellant, optionally overridden to model a diverging second definition. */
function propellant(over: Partial<CustomReaction> = {}): CustomReaction {
  return { ...createCustomReaction('MyProp', 'My Propellant'), ...over };
}

/** A part carrying `reaction` and one solid motor burning it at 50 bar. */
function partBurning(reaction: CustomReaction, partId: string, motorId: string): EditingPart {
  const part = cleanPart();
  part.partId = partId;
  part.customReactions.push(reaction);
  const motor = createSolidMotor(motorId);
  motor.reactionId = reaction.id;
  motor.defaultPressurePa = 50e5; // 50 bar
  part.gameData.solidMotors.push(motor);
  return part;
}

/** A `Category="Solid"` reaction KSA will load, stable from 15 bar up to `maxBar`. */
function solidPropellant(maxBar: number): CustomReaction {
  return propellant({
    category: 'Solid',
    burnRate: { coefficientMPerS: 0.0045, exponent: 0.35 },
    minimumBurnPressurePa: 15e5,
    maxStablePressurePa: maxBar * 1e5,
    exhaustCondensedFraction: 0.33,
  });
}

describe('collectProjectExportIssues — one <FixedReaction Id>, two chemistries', () => {
  it('does NOT block when both parts declare the SAME propellant (that is the P3.05 dedupe)', () => {
    // Sharing an id is deliberate — duplicate-part and import-as-parts never re-mint reaction
    // ids, so two parts burning one propellant emit it once.
    const a = partBurning(propellant(), 'rover_a', 'MotorA');
    const b = partBurning(propellant(), 'rover_b', 'MotorB');
    expect(projectCodes(named('A', a), named('B', b))).not.toContain('reaction-id-conflict');
  });

  it('blocks when the two declarations disagree', () => {
    const a = partBurning(propellant(), 'rover_a', 'MotorA');
    const b = partBurning(
      propellant({
        lut: [{ lnPressure: Math.log(1e6), temperatureK: 2000, gamma: 1.1, molarMassGPerMol: 20 }],
      }),
      'rover_b',
      'MotorB',
    );
    const found = projectFind([named('A', a), named('B', b)], 'reaction-id-conflict')!;
    expect(found.severity).toBe('block');
    expect(found.area).toBe('engine');
    expect(found.message).toBe(
      "Propellant 'MyProp' is defined differently in 'A' and 'B'. " +
        'One mod can ship only one definition per reaction id.',
    );
  });

  it('compares payloads structurally, not by key order', () => {
    const first = propellant();
    // The same data written in a different key order — plain JSON.stringify would disagree.
    const reordered: CustomReaction = {
      exhaustCondensedFraction: first.exhaustCondensedFraction,
      maxStablePressurePa: first.maxStablePressurePa,
      minimumBurnPressurePa: first.minimumBurnPressurePa,
      burnRate: first.burnRate,
      lut: first.lut.map((r) => ({
        molarMassGPerMol: r.molarMassGPerMol,
        gamma: r.gamma,
        temperatureK: r.temperatureK,
        lnPressure: r.lnPressure,
      })),
      reactants: first.reactants.map((r) => ({ massShare: r.massShare, phaseId: r.phaseId })),
      category: first.category,
      name: first.name,
      id: first.id,
    };
    const a = partBurning(first, 'rover_a', 'MotorA');
    const b = partBurning(reordered, 'rover_b', 'MotorB');
    expect(projectCodes(named('A', a), named('B', b))).not.toContain('reaction-id-conflict');
  });

  // `engineValidation.reactionFacts` prefers the INJECTED index, so handing every part the
  // same index would validate part B's motors against part A's chemistry.
  it('grades each part’s engines against ITS OWN payload, never the other part’s', () => {
    const wide = partBurning(solidPropellant(150), 'rover_a', 'MotorA'); // 50 bar is fine
    const narrow = partBurning(solidPropellant(20), 'rover_b', 'MotorB'); // 50 bar is not
    const issues = projectIssues(named('Wide', wide), named('Narrow', narrow));
    const outOfRange = issues.filter((i) => i.code === 'solid-motor-pressure-out-of-range');
    expect(outOfRange.map((i) => i.partName)).toEqual(['Narrow']);
    expect(outOfRange[0].message).toContain('MotorB');
    expect(outOfRange[0].message).toContain('20.0 bar');
    // The divergence itself is still a blocker — one mod ships one definition per id.
    expect(issues.map((i) => i.code)).toContain('reaction-id-conflict');
  });
});

describe('collectProjectExportIssues — part stamping', () => {
  it('stamps per-part issues with their part, and cross-part blockers with neither field', () => {
    const a = createEmptyPart();
    a.partId = '';
    const b = createEmptyPart();
    b.partId = ''; // same (empty) id ⇒ also a cross-part duplicate
    const issues = projectIssues(named('Nose', a), named('Tank', b));

    const perPart = issues.filter((i) => i.code === 'part-id-empty');
    expect(perPart.map((i) => i.partName)).toEqual(['Nose', 'Tank']);
    expect(perPart.map((i) => i.partEntryId)).toEqual(['pt_Nose', 'pt_Tank']);
    // Message and severity are carried verbatim from the single-part pass.
    expect(perPart.map((i) => i.message)).toEqual(['Part Id is empty.', 'Part Id is empty.']);

    // A blocker that names two parts in its prose belongs to neither.
    const cross = issues.find((i) => i.code === 'duplicate-part-id')!;
    expect(cross.partEntryId).toBeUndefined();
    expect(cross.partName).toBeUndefined();
  });

  it('leaves a bare single-part pass unstamped', () => {
    expect(
      issuesOf(cleanPart()).every((i) => i.partName === undefined && i.partEntryId === undefined),
    ).toBe(true);
  });
});

describe('countBySeverity', () => {
  it('counts each severity independently', () => {
    const part = createEmptyPart();
    part.partId = '';
    part.customMeshes.push(mesh('flexo_fin', 'Fin'));
    part.placements.push(placed('a', 'dup'), placed('b', 'dup'));
    const counts = countBySeverity(issuesOf(part));
    expect(counts.block).toBe(1); // the duplicate instance id
    expect(counts.info).toBe(1); // the unplaced custom mesh
    expect(counts.warn).toBeGreaterThanOrEqual(1); // empty Part Id (+ the no-collider warn)
  });
});
