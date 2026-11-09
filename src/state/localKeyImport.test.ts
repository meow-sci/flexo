import { beforeEach, describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { $part, addPart, newPart, undo } from './editorStore';
import { buildProjectExport, mergeProjectImport } from './projectTransfer';
import { resolveContent } from '../ksa/contentXml';
import { parseGameDataElement, placementsFromPartElement } from '../ksa/partXmlParser';
import { serializeGameDataXml, serializePartsXml } from '../ksa/partXmlSerializer';
import {
  createCombustor,
  createEmptyPart,
  createNozzle,
  createPartLight,
  createRocket,
  createRocketController,
  createTank,
  DEFAULT_LAYER_ID,
  IVA_SEAT_LAYER_ID,
  identityTransform,
} from '../ksa/types';

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
function source() {
  const p = createEmptyPart();
  p.partId = 'Imported';
  p.placements = [
    {
      instanceId: 'body',
      subPartTemplateId: 'Body',
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    },
  ];
  p.connectors = [
    {
      id: 'top',
      ...identityTransform(),
      flags: [],
      capabilities: [],
      siblingIds: [],
      layerId: DEFAULT_LAYER_ID,
    },
  ];
  p.gameData.tanks = [{ ...createTank(), id: 'Tank' }];
  p.gameData.batteries = [{ capacityWh: 2 }];
  p.gameData.evaDoor = { seatId: 'pilot' };
  p.gameData.powerConsumer = { consumedWatts: 3, lightSwitch: false, lightIsActive: false };
  p.gameData.combustors = [
    {
      ...createCombustor('core'),
      feeds: [
        { kind: 'container', containerId: 'tank', subPartInstanceId: null },
        { kind: 'container', containerId: 'templateTank', subPartInstanceId: 'BODY' },
      ],
    },
  ];
  p.gameData.nozzles = [createNozzle('nozzle')];
  p.gameData.rockets = [createRocket('engine', 'core', ['nozzle'])];
  p.gameData.rocketControllers = [
    {
      ...createRocketController('control', 'engine'),
      rocketRefs: [{ id: 'engine', subPartInstanceId: null }],
    },
  ];
  p.gameData.gimbals = [
    {
      subPartInstanceId: 'body',
      key: 'hinge',
      transform: identityTransform(),
      maxAngleYDeg: 3,
      maxAngleZDeg: 0,
      constrainToCircle: true,
    },
  ];
  p.gameData.unknownChildren = [
    {
      tag: 'AlignedGroups',
      attrs: {},
      children: [
        {
          tag: 'Aligned',
          attrs: {},
          children: [
            {
              tag: 'Connectors',
              attrs: {},
              children: [{ tag: 'Connector', attrs: { KeyRef: 'TOP' }, children: [] }],
            },
          ],
        },
      ],
    },
  ];
  p.gameData.unknownComponents = [
    {
      tag: 'Habitat',
      attrs: { Key: 'cabin' },
      children: [
        {
          tag: 'BlockedConnectors',
          attrs: {},
          children: [{ tag: 'Connector', attrs: { KeyRef: 'top' }, children: [] }],
        },
      ],
    },
  ];
  p.colliders = [
    {
      id: 'box',
      shape: 'Box',
      ownerTemplateId: null,
      ...identityTransform(),
      layerId: DEFAULT_LAYER_ID,
    },
  ];
  p.ivaSeats = [{ id: 'seat', ksaId: 'pilot', ...identityTransform(), layerId: IVA_SEAT_LAYER_ID }];
  p.lights = [{ ...createPartLight(null, 'lamp'), ksaId: 'Lamp' }];
  return p;
}
function imported(p: ReturnType<typeof source>) {
  return {
    ...p.gameData,
    subPartGameData: p.subPartGameData,
    colliders: p.colliders,
    ivaSeats: p.ivaSeats,
    lights: p.lights,
  };
}
function assertImported(p: ReturnType<typeof source>) {
  expect(p.gameData.tanks.map((t) => t.id)).toEqual(['Tank', 'Tank_2']);
  expect(p.gameData.batteries.map((b) => b.ksaId)).toEqual(['Battery', 'Battery_2']);
  expect(p.gameData.combustors.map((c) => [c.id, c.feeds[0]])).toEqual([
    ['core', { kind: 'container', containerId: 'Tank', subPartInstanceId: null }],
    ['core_2', { kind: 'container', containerId: 'Tank_2', subPartInstanceId: null }],
  ]);
  expect(p.gameData.combustors[1].feeds[1]).toEqual({
    kind: 'container',
    containerId: 'templateTank',
    subPartInstanceId: 'body_2',
  });
  expect(p.gameData.unknownChildren[0].children).toHaveLength(2);
  expect(p.gameData.unknownChildren[0].children[1].children[0].children[0].attrs.KeyRef).toBe(
    '_connector2',
  );
  expect(p.gameData.rockets[1]).toMatchObject({
    id: 'engine_2',
    core: { id: 'core_2' },
    nozzles: [{ id: 'nozzle_2' }],
  });
  expect(p.gameData.rocketControllers[1].rocketRefs[0].id).toBe('engine_2');
  expect(p.gameData.gimbals.map((g) => g.key)).toEqual(['hinge', 'hinge_2']);
  expect(p.ivaSeats.map((s) => s.ksaId)).toEqual(['pilot', 'pilot_2']);
  expect(p.lights.map((s) => s.ksaId)).toEqual(['Lamp', 'Lamp_2']);
  expect(p.gameData.unknownComponents.map((n) => n.attrs.Key)).toEqual([
    'cabin',
    'cabin_2',
    'PowerConsumer_2',
    'EVADoor_2',
  ]);
  expect(p.gameData.unknownComponents[3].attrs.SeatId).toBe('pilot_2');
  expect(p.gameData.unknownComponents[1].children[0].children[0].attrs.KeyRef).toBe('_connector2');
  const entry = { part: p, remap: new Map<string, string>() };
  const geometry = serializePartsXml([entry]);
  const gameplay = serializeGameDataXml([entry], 'Example');
  const resolved = resolveContent([
    { file: 'geometry', doc: parse(geometry) },
    { file: 'gameplay', doc: parse(gameplay) },
  ]);
  const shapeKeys = Array.from(resolved.doc.getElementsByTagName('Box')).map((e) =>
    e.getAttribute('Key'),
  );
  expect(new Set(shapeKeys).size).toBe(2);
  const roundTrip = parseGameDataElement(resolved.doc.getElementsByTagName('Part')[0]);
  expect(
    [
      roundTrip.gameData.evaDoor?.ksaId,
      ...roundTrip.gameData.unknownComponents
        .filter((n) => n.tag === 'EVADoor')
        .map((n) => n.attrs.Key),
    ].sort(),
  ).toEqual(['EVADoor', 'EVADoor_2']);
  expect(
    [
      roundTrip.gameData.powerConsumer?.ksaId,
      ...roundTrip.gameData.unknownComponents
        .filter((n) => n.tag === 'PowerConsumer')
        .map((n) => n.attrs.Key),
    ].sort(),
  ).toEqual(['PowerConsumer', 'PowerConsumer_2']);
}

describe('repeated current Part imports', () => {
  beforeEach(() => newPart());
  it('renames local keys and references, preserves raw components and undoes in one step', () => {
    const p = source();
    addPart(p.placements, p.connectors, [], undefined, undefined, imported(p));
    const first = structuredClone($part.get());
    addPart(p.placements, p.connectors, [], undefined, undefined, imported(p));
    assertImported($part.get());
    undo();
    expect($part.get()).toEqual(first);
  });
  it('does the same for project transfer', () => {
    const p = source();
    const entry = buildProjectExport(
      [
        {
          name: 'P',
          part: p,
          visible: true,
          opacity: 1,
          offset: { x: 0, y: 0, z: 0 },
          includeInExport: true,
        },
      ],
      'X',
    ).parts[0];
    const first = mergeProjectImport(createEmptyPart(), entry).part;
    assertImported(mergeProjectImport(first, entry).part);
  });
  it('uses zero for missing axes of present Scale', () => {
    const part = parse(
      '<Assets><Part Id="P"><SubParts><SubPart Key="p" Ref="T"><Transform><Scale X="2"/></Transform></SubPart><SubPart Key="q" Ref="T"/></SubParts></Part></Assets>',
    ).getElementsByTagName('Part')[0];
    expect(placementsFromPartElement(part).map((p) => p.scale)).toEqual([
      { x: 2, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ]);
  });
});
