import { describe, it, expect } from 'vitest';
import { validateIvaSeats, hasBlockingIvaSeatIssue } from './ivaSeatValidation';
import {
  DEFAULT_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  createEmptyPart,
  identityTransform,
  type CustomMesh,
  type EditingPart,
  type EulerXYZ,
  type IvaSeat,
  type PartCollider,
  type Vec3,
} from './types';
import type { CatalogSubPart } from './catalog';

/**
 * Default position is deliberately NOT the origin — `(0,0,0)` is its own warn
 * (`iva-seat-at-origin`), and every test that doesn't care about position wants a seat the
 * author has clearly moved.
 */
function seat(position: Vec3 = { x: 0, y: 0.5, z: 0 }, rotation?: EulerXYZ): IvaSeat {
  return {
    ...identityTransform(),
    position,
    ...(rotation ? { rotation } : {}),
    id: '_seat1',
    ksaId: null,
    layerId: IVA_SEAT_LAYER_ID,
  };
}

function placed(templateId: string): EditingPart['placements'][number] {
  return {
    instanceId: `inst_${templateId}`,
    subPartTemplateId: templateId,
    ...identityTransform(),
    layerId: DEFAULT_LAYER_ID,
  };
}

function entry(id: string, over: Partial<CatalogSubPart> = {}): CatalogSubPart {
  return {
    id,
    atlasUrl: `/ksa/Meshes/${id}.glb`,
    meshNodeName: id,
    sourceFile: 'test.xml',
    ...over,
  };
}

/** A custom mesh template that exports through `<PartModelGlass>` (an imported BLEND mesh). */
function glassMesh(subPartId: string): CustomMesh {
  return {
    id: `mesh_${subPartId}`,
    name: subPartId,
    subPartId,
    faceTextures: {},
    imported: {
      importId: 'imp_1',
      meshName: subPartId,
      sourceFile: 'x.glb',
      sourceNode: subPartId,
      sourceMaterial: 'Glass',
      triangles: 12,
      vertices: 24,
      transparent: true,
    },
  };
}

/** A 2 m box centred on the Part's origin, part-level unless `ownerTemplateId` says otherwise. */
function collider(over: Partial<PartCollider> = {}): PartCollider {
  return {
    id: '_collider1',
    shape: 'Box',
    ownerTemplateId: null,
    ...identityTransform(),
    scale: { x: 2, y: 2, z: 2 },
    layerId: DEFAULT_LAYER_ID,
    ...over,
  };
}

const EMPTY_CATALOG: ReadonlyMap<string, CatalogSubPart> = new Map();

const codes = (part: EditingPart, catalog = EMPTY_CATALOG) =>
  validateIvaSeats(part, catalog).map((i) => i.code);

/** A part with one seat and one placed interior template — the healthy baseline. */
function healthyPart(): { part: EditingPart; catalog: Map<string, CatalogSubPart> } {
  const part = createEmptyPart();
  part.placements.push(placed('Interior'));
  part.ivaSeats.push(seat({ x: -0.45, y: 0.42, z: -0.35 }));
  const catalog = new Map([['Interior', entry('Interior', { internal: true })]]);
  return { part, catalog };
}

describe('validateIvaSeats', () => {
  it('is silent for a part with a seat and interior geometry', () => {
    const { part, catalog } = healthyPart();
    expect(validateIvaSeats(part, catalog)).toEqual([]);
  });

  it('is silent for a part with neither seats nor interior geometry', () => {
    const part = createEmptyPart();
    part.placements.push(placed('Hull'));
    expect(validateIvaSeats(part, new Map([['Hull', entry('Hull')]]))).toEqual([]);
  });

  it('blocks a seat whose derived axes are non-finite', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats[0].rotation = { x: Number.NaN, y: 0, z: 0 };
    const issues = validateIvaSeats(part, catalog);
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-non-finite']);
    expect(issues[0].message).toMatch(/Camera\.LookAtRotation/);
    expect(hasBlockingIvaSeatIssue(issues)).toBe(true);
  });

  it('blocks a non-finite seat POSITION too (same corrupted-payload path)', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats[0].position = { x: Number.POSITIVE_INFINITY, y: 0, z: 0 };
    expect(codes(part, catalog)).toEqual(['iva-seat-non-finite']);
  });

  // WARN, not block: duplicate seats are legal, loadable XML (plans/IVA_PLAN.md §3.8's
  // "downgrade to warn if that proves annoying"), so they must not appear under the UI's
  // "KSA would refuse to load this mod" heading. `iva-seat-non-finite` above stays `block`.
  it('warns (does NOT block) on two seats sharing the identical position AND orientation', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats.push({ ...seat({ x: -0.45, y: 0.42, z: -0.35 }), id: '_seat2' });
    const issues = validateIvaSeats(part, catalog);
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-duplicate']);
    expect(issues[0].severity).toBe('warn');
    expect(hasBlockingIvaSeatIssue(issues)).toBe(false);
  });

  it('allows two seats at the same position facing different ways', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats.push({
      ...seat({ x: -0.45, y: 0.42, z: -0.35 }, { x: 0, y: 0, z: Math.PI / 2 }),
      id: '_seat2',
    });
    expect(validateIvaSeats(part, catalog)).toEqual([]);
  });

  it('allows two seats with the same orientation at different positions', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats.push({ ...seat({ x: -0.45, y: -0.42, z: -0.35 }), id: '_seat2' });
    expect(validateIvaSeats(part, catalog)).toEqual([]);
  });

  it('reports a duplicate only ONCE per offending seat', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats.push({ ...seat({ x: -0.45, y: 0.42, z: -0.35 }), id: '_seat2' });
    part.ivaSeats.push({ ...seat({ x: -0.45, y: 0.42, z: -0.35 }), id: '_seat3' });
    expect(codes(part, catalog)).toEqual(['iva-seat-duplicate', 'iva-seat-duplicate']);
  });

  it('warns when a part has seats but no interior geometry, naming the menu action', () => {
    const part = createEmptyPart();
    part.placements.push(placed('Hull'));
    part.ivaSeats.push(seat());
    const issues = validateIvaSeats(part, new Map([['Hull', entry('Hull')]]));
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-no-interior']);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toContain('Interior (IVA only)');
  });

  it('counts a user-flagged (internalFlags) template as interior geometry', () => {
    const part = createEmptyPart();
    part.placements.push(placed('Hull'));
    part.internalFlags.Hull = true;
    part.ivaSeats.push(seat());
    expect(validateIvaSeats(part, new Map([['Hull', entry('Hull')]]))).toEqual([]);
  });

  it('respects an internalFlags OVERRIDE that turns a built-in interior back into exterior', () => {
    const { part, catalog } = healthyPart();
    part.internalFlags.Interior = false;
    expect(codes(part, catalog)).toEqual(['iva-seat-no-interior']);
  });

  it('warns when a part has interior geometry but no seats', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats.length = 0;
    const issues = validateIvaSeats(part, catalog);
    expect(issues.map((i) => i.code)).toEqual(['iva-interior-no-seat']);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toMatch(/EVERY camera mode/);
  });

  it('warns when an interior-flagged template exports through <PartModelGlass>', () => {
    const part = createEmptyPart();
    part.customMeshes.push(glassMesh('Window'));
    part.placements.push(placed('Window'));
    part.internalFlags.Window = true;
    part.ivaSeats.push(seat());
    const issues = validateIvaSeats(part, EMPTY_CATALOG);
    expect(issues.map((i) => i.code)).toEqual(['iva-interior-on-glass']);
    expect(issues[0].severity).toBe('warn');
  });

  it('stays quiet about a NON-interior glass mesh', () => {
    const { part, catalog } = healthyPart();
    part.customMeshes.push(glassMesh('Window'));
    part.placements.push(placed('Window'));
    expect(validateIvaSeats(part, catalog)).toEqual([]);
  });

  it('stays quiet about an interior mesh that is NOT glass', () => {
    const part = createEmptyPart();
    const opaque = glassMesh('Panel');
    delete opaque.imported!.transparent;
    part.customMeshes.push(opaque);
    part.placements.push(placed('Panel'));
    part.internalFlags.Panel = true;
    part.ivaSeats.push(seat());
    expect(validateIvaSeats(part, EMPTY_CATALOG)).toEqual([]);
  });

  it('stays quiet about a seat INSIDE the part-level collision volume', () => {
    const { part, catalog } = healthyPart();
    part.colliders.push(collider());
    expect(validateIvaSeats(part, catalog)).toEqual([]);
  });

  it('warns when that same seat is moved outside every collider', () => {
    const { part, catalog } = healthyPart();
    part.colliders.push(collider());
    part.ivaSeats[0].position = { x: 5, y: 0.42, z: -0.35 };
    const issues = validateIvaSeats(part, catalog);
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-outside-colliders']);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toMatch(/Seat 1/);
  });

  it('never warns about containment when the part declares no collider', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats[0].position = { x: 500, y: 500, z: 500 };
    expect(validateIvaSeats(part, catalog)).toEqual([]);
  });

  it('ignores SubPart-owned colliders (they are in the template frame, not the Part frame)', () => {
    const { part, catalog } = healthyPart();
    part.colliders.push(collider({ ownerTemplateId: 'Interior' }));
    part.ivaSeats[0].position = { x: 5, y: 0.42, z: -0.35 };
    expect(validateIvaSeats(part, catalog)).toEqual([]);
  });

  it('accounts for a collider that is rotated and offset', () => {
    const { part, catalog } = healthyPart();
    // A 4 × 0.5 × 0.5 box laid along +X, then yawed 90° so it runs along ±Y about (0, 2, 0).
    part.colliders.push(
      collider({
        position: { x: 0, y: 2, z: 0 },
        rotation: { x: 0, y: 0, z: Math.PI / 2 },
        scale: { x: 4, y: 0.5, z: 0.5 },
      }),
    );
    part.ivaSeats[0].position = { x: 0, y: 3.5, z: 0 }; // inside the rotated box
    expect(validateIvaSeats(part, catalog)).toEqual([]);
    part.ivaSeats[0].position = { x: 1.5, y: 2, z: 0 }; // where the UNROTATED box would be
    expect(codes(part, catalog)).toEqual(['iva-seat-outside-colliders']);
  });

  it('stays quiet at exactly 8 seats and warns at 9', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats.length = 0;
    for (let i = 0; i < 8; i++) {
      part.ivaSeats.push({ ...seat({ x: 0, y: 0.5, z: i * 0.5 }), id: `_seat${i}` });
    }
    expect(validateIvaSeats(part, catalog)).toEqual([]);

    part.ivaSeats.push({ ...seat({ x: 0, y: 0.5, z: 8 * 0.5 }), id: '_seat8' });
    const issues = validateIvaSeats(part, catalog);
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-count']);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toMatch(/9 IVA seats/);
  });

  it('warns about a seat left at the default (0, 0, 0)', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats[0].position = { x: 0, y: 0, z: 0 };
    const issues = validateIvaSeats(part, catalog);
    expect(issues.map((i) => i.code)).toEqual(['iva-seat-at-origin']);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toMatch(/Seat 1/);
  });

  it('takes the origin check as EXACT — a seat 1 nm off is quiet', () => {
    const { part, catalog } = healthyPart();
    part.ivaSeats[0].position = { x: 0, y: 0, z: 1e-9 };
    expect(validateIvaSeats(part, catalog)).toEqual([]);
  });

  it('says nothing at all about an empty part', () => {
    expect(validateIvaSeats(createEmptyPart(), EMPTY_CATALOG)).toEqual([]);
  });
});
