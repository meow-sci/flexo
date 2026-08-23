import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  KITTEN_LAYER_ID,
  createEmptyPart,
  identityTransform,
  type EditingPart,
} from '../../ksa/types';
import type { CatalogSubPart } from '../../ksa/catalog';
import { DEFAULT_LAYER_STATE, type LayerViewState } from '../../state/layerStore';
import { buildOutlinerTree, type OutlinerLayerSection } from './outlinerTree';

const EMPTY_CATALOG: ReadonlyMap<string, CatalogSubPart> = new Map();

/**
 * A document with one user layer and one entity of every kind on a sensible layer. Only IVA
 * seats and kittens are pinned to a built-in layer; the light sits on the ordinary "Wings"
 * layer alongside a SubPart, which is where a user's own drag would leave it.
 */
function fixture(): EditingPart {
  const part = createEmptyPart();
  part.layers.push({ id: 'layer1', name: 'Wings' });
  part.placements.push(
    {
      instanceId: 'tank_2',
      subPartTemplateId: 'Core_Subpart_FuelTankA',
      layerId: DEFAULT_LAYER_ID,
      ...identityTransform(),
    },
    {
      instanceId: 'wing_1',
      subPartTemplateId: 'Core_Subpart_WingA',
      layerId: 'layer1',
      ...identityTransform(),
    },
  );
  part.connectors.push({
    id: 'connector_1',
    layerId: DEFAULT_LAYER_ID,
    flags: ['ToSurface'],
    capabilities: [],
    siblingIds: [],
    ...identityTransform(),
  });
  part.colliders.push({
    id: '_collider1',
    shape: 'Box',
    ownerTemplateId: null,
    layerId: DEFAULT_LAYER_ID,
    ...identityTransform(),
  });
  part.ivaSeats.push({
    id: '_seat1',
    ksaId: null,
    layerId: IVA_SEAT_LAYER_ID,
    ...identityTransform(),
  });
  part.lights.push({
    id: '_light1',
    type: 'Spot',
    ownerTemplateId: null,
    rangeM: 10,
    intensity: 1,
    color: { r: 1, g: 1, b: 1 },
    innerAngleRad: 0.1,
    outerAngleRad: 0.5,
    rayTracing: false,
    ksaId: null,
    disableInIva: false,
    layerId: 'layer1',
    ...identityTransform(),
  });
  part.kittens.push({
    id: 'kitten_1',
    kind: 'hunter',
    layerId: KITTEN_LAYER_ID,
    ...identityTransform(),
  });
  return part;
}

const build = (
  part: EditingPart,
  query = '',
  view: Record<string, LayerViewState> = {},
  catalog: ReadonlyMap<string, CatalogSubPart> = EMPTY_CATALOG,
) => buildOutlinerTree(part, view, query, catalog);

const section = (tree: OutlinerLayerSection[], id: string) => tree.find((s) => s.layer.id === id)!;

const rowNames = (tree: OutlinerLayerSection[]) =>
  tree.flatMap((s) => s.groups.flatMap((g) => g.rows.map((r) => r.name)));

describe('buildOutlinerTree — layer partition', () => {
  it('puts ordinary layers first and the pinned entity-only built-ins after', () => {
    const tree = build(fixture());
    expect(tree.map((s) => s.layer.id)).toEqual([
      DEFAULT_LAYER_ID,
      'layer1',
      IVA_SEAT_LAYER_ID,
      KITTEN_LAYER_ID,
    ]);
    expect(tree.map((s) => s.pinned)).toEqual([false, false, true, true]);
  });

  it('leaves part.layers untouched (the partition is display-only)', () => {
    const part = fixture();
    const before = part.layers.map((l) => l.id);
    build(part);
    expect(part.layers.map((l) => l.id)).toEqual(before);
  });

  it('returns empty layers too, so the header can still be rendered', () => {
    const tree = build(createEmptyPart());
    expect(tree).toHaveLength(3);
    expect(tree.every((s) => s.total === 0 && s.groups.length === 0)).toBe(true);
  });
});

describe('buildOutlinerTree — kind grouping', () => {
  it('groups rows under kind subheaders in display order and omits empty groups', () => {
    const tree = build(fixture());
    expect(section(tree, DEFAULT_LAYER_ID).groups.map((g) => g.label)).toEqual([
      'SUBPARTS',
      'CONNECTORS',
      'COLLIDERS',
    ]);
    // A light is an ordinary layer citizen, so it groups under the SAME section as the
    // SubPart it illuminates, in KIND_DISPLAY_ORDER.
    expect(section(tree, 'layer1').groups.map((g) => g.label)).toEqual(['SUBPARTS', 'LIGHTS']);
    expect(section(tree, IVA_SEAT_LAYER_ID).groups.map((g) => g.label)).toEqual(['IVA SEATS']);
  });

  it('re-homes a light onto any ordinary layer, which is what a header drop does', () => {
    const part = fixture();
    // Exactly what dragging the light row onto the Default header leaves behind.
    part.lights[0].layerId = DEFAULT_LAYER_ID;
    const tree = build(part);
    expect(section(tree, 'layer1').groups.map((g) => g.label)).toEqual(['SUBPARTS']);
    expect(section(tree, DEFAULT_LAYER_ID).groups.map((g) => g.label)).toEqual([
      'SUBPARTS',
      'CONNECTORS',
      'COLLIDERS',
      'LIGHTS',
    ]);
    expect(section(tree, DEFAULT_LAYER_ID).total).toBe(4);
    // `pinned` is the flag the layer header consults before accepting an entity drop, so
    // every layer a light can now live on is also a layer it can be dragged onto.
    expect(section(tree, DEFAULT_LAYER_ID).pinned).toBe(false);
    expect(section(tree, 'layer1').pinned).toBe(false);
  });

  it('keys every row as its `kind:id` selection ref', () => {
    const tree = build(fixture());
    expect(section(tree, DEFAULT_LAYER_ID).groups[0].rows[0].key).toBe('subpart:tank_2');
    expect(section(tree, 'layer1').groups[1].rows[0].key).toBe('light:_light1');
  });

  it('counts total across every kind on the layer', () => {
    const tree = build(fixture());
    expect(section(tree, DEFAULT_LAYER_ID).total).toBe(3);
    expect(section(tree, DEFAULT_LAYER_ID).shown).toBe(3);
  });
});

describe('buildOutlinerTree — row names and sub lines', () => {
  it('names a seat by its ordinal and flags the first as the IVA default', () => {
    const part = fixture();
    part.ivaSeats.push({
      id: '_seat2',
      ksaId: null,
      layerId: IVA_SEAT_LAYER_ID,
      ...identityTransform(),
    });
    const rows = section(build(part), IVA_SEAT_LAYER_ID).groups[0].rows;
    expect(rows.map((r) => r.name)).toEqual(['Seat 1', 'Seat 2']);
    expect(rows[0].sub).toContain('· default');
    expect(rows[1].sub).not.toContain('· default');
  });

  it('names a kitten by its capitalized kind and keeps the id on the sub line', () => {
    const row = section(build(fixture()), KITTEN_LAYER_ID).groups[0].rows[0];
    expect(row.name).toBe('Hunter');
    expect(row.sub).toBe('kitten_1');
  });

  it('shows a connector’s flags and capabilities, or "no flags"', () => {
    const part = fixture();
    part.connectors[0].capabilities = ['BulkFluid'];
    part.connectors.push({
      id: 'connector_2',
      layerId: DEFAULT_LAYER_ID,
      flags: [],
      capabilities: [],
      siblingIds: [],
      ...identityTransform(),
    });
    const rows = section(build(part), DEFAULT_LAYER_ID).groups[1].rows;
    expect(rows[0].sub).toBe('ToSurface · BulkFluid');
    expect(rows[1].sub).toBe('no flags');
  });

  it('shows a collider’s shape and owner, and badges the shape', () => {
    const part = fixture();
    part.colliders[0].ownerTemplateId = 'Core_Subpart_FuelTankA';
    const row = section(build(part), DEFAULT_LAYER_ID).groups[2].rows[0];
    expect(row.sub).toBe('Box · FuelTankA');
    expect(row.badges.colliderShape).toBe('Box');
  });

  it('badges a light with its type and names its owner template', () => {
    const part = fixture();
    part.lights[0].ownerTemplateId = 'Core_Subpart_ElectricalA';
    const row = section(build(part), 'layer1').groups[1].rows[0];
    expect(row.badges.lightType).toBe('Spot');
    expect(row.sub).toBe('Spot · via ElectricalA');
  });

  it('resolves the interior badge from a document override', () => {
    const part = fixture();
    part.internalFlags['Core_Subpart_FuelTankA'] = true;
    const row = section(build(part), DEFAULT_LAYER_ID).groups[0].rows[0];
    expect(row.badges.interior).toBe(true);
    expect(row.sub).toBe('Core_Subpart_FuelTankA · interior');
  });

  it('resolves the interior badge from the catalog when the document says nothing', () => {
    const catalog = new Map<string, CatalogSubPart>([
      ['Core_Subpart_WingA', { id: 'Core_Subpart_WingA', internal: true } as CatalogSubPart],
    ]);
    const row = section(build(fixture(), '', {}, catalog), 'layer1').groups[0].rows[0];
    expect(row.badges.interior).toBe(true);
  });
});

describe('buildOutlinerTree — search', () => {
  it('an empty query keeps every row and highlights nothing', () => {
    const tree = build(fixture());
    expect(rowNames(tree)).toHaveLength(7);
    expect(
      tree.every((s) => s.groups.every((g) => g.rows.every((r) => r.matchRanges.length === 0))),
    ).toBe(true);
  });

  it('fuzzy-filters rows by name and records the highlight spans', () => {
    const tree = build(fixture(), 'tnk');
    expect(rowNames(tree)).toEqual(['tank_2']);
    const row = section(tree, DEFAULT_LAYER_ID).groups[0].rows[0];
    expect(row.matchRanges).toEqual([
      [0, 1],
      [2, 4],
    ]);
    expect(section(tree, DEFAULT_LAYER_ID).shown).toBe(1);
    expect(section(tree, DEFAULT_LAYER_ID).total).toBe(3);
  });

  it('matches the template id, the kind word and the interior flag without highlighting', () => {
    expect(rowNames(build(fixture(), 'WingA'))).toEqual(['wing_1']);
    expect(rowNames(build(fixture(), 'connector'))).toEqual(['connector_1']);
    const interior = fixture();
    interior.internalFlags['Core_Subpart_FuelTankA'] = true;
    const rows = section(build(interior, 'interior'), DEFAULT_LAYER_ID).groups[0].rows;
    expect(rows.map((r) => r.name)).toEqual(['tank_2']);
    expect(rows[0].matchRanges).toEqual([]);
  });

  it('matches "locked" on the rows of a locked layer', () => {
    const view = { [DEFAULT_LAYER_ID]: { ...DEFAULT_LAYER_STATE, locked: true } };
    const tree = build(fixture(), 'locked', view);
    expect(section(tree, DEFAULT_LAYER_ID).shown).toBe(3);
    expect(section(tree, 'layer1').shown).toBe(0);
  });

  it('drops a layer’s groups entirely when nothing on it matches', () => {
    const tree = build(fixture(), 'zzzz');
    expect(tree.every((s) => s.groups.length === 0 && s.shown === 0)).toBe(true);
    expect(tree).toHaveLength(4); // headers stay — the panel decides what to draw
  });
});

describe('buildOutlinerTree — layer view state', () => {
  it('marks rows hidden when the layer is not visible', () => {
    const view = { [DEFAULT_LAYER_ID]: { ...DEFAULT_LAYER_STATE, visible: false } };
    const tree = build(fixture(), '', view);
    expect(section(tree, DEFAULT_LAYER_ID).groups[0].rows[0].hidden).toBe(true);
    expect(section(tree, 'layer1').groups[0].rows[0].hidden).toBe(false);
  });

  it('still returns an unlisted layer (the panel ghosts its header instead of dropping it)', () => {
    const view = { layer1: { ...DEFAULT_LAYER_STATE, listed: false } };
    const tree = build(fixture(), '', view);
    const wings = section(tree, 'layer1');
    expect(wings.view.listed).toBe(false);
    expect(wings.total).toBe(2);
  });

  it('fills view-state defaults for a layer with no stored entry', () => {
    const tree = build(fixture());
    expect(section(tree, 'layer1').view).toEqual(DEFAULT_LAYER_STATE);
  });
});
