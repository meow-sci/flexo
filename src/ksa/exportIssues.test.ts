import { describe, it, expect } from 'vitest';
import { collectExportIssues, countBySeverity, type ExportIssue } from './exportIssues';
import {
  DEFAULT_LAYER_ID,
  createCombustor,
  createEmptyPart,
  createPartLight,
  identityTransform,
  type CustomMesh,
  type EditingPart,
} from './types';
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
