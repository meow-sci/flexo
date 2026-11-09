import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { resolveContent } from './contentXml';
import {
  parseGameDataElement,
  placementsFromPartElement,
  connectorsFromPartElement,
  remapRawConnectorRefs,
} from './partXmlParser';
import { serializeGameDataXml, serializePartsXml } from './partXmlSerializer';
import { createEmptyPart, createSubPartGameData } from './types';

const parse = (xml: string) =>
  new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;

describe('current Part XML', () => {
  it('reads flattened keys, wrapped modules, phase references and unknown components', () => {
    const doc =
      parse(`<Assets><KeyframeAnimation Id="anim" Path="Animations/a.glb"/><Part Id="P" DisplayName="Example">
      <SubParts><SubPart Key="body" Ref="Body"/></SubParts>
      <Connectors><Connector Key="top"><Flags>Edge Internal</Flags><Siblings><Sibling KeyRef="bottom"/></Siblings></Connector></Connectors>
      <Gimbals><Gimbal Key="hinge"><SubPart KeyRef="body"/><MaxAngleY Degrees="5"/></Gimbal></Gimbals>
      <EditorTags><EditorTag Ref="Engines"/></EditorTags>
      <RocketCores><Combustor Key="chamber"><FeedsFroms><FeedsFrom><Container KeyRef="Tank" SubPart="body"/></FeedsFrom></FeedsFroms><Reaction Ref="fuel"/></Combustor></RocketCores>
      <RocketEngineControllers><RocketEngineController Key="controller"><Rockets><Rocket KeyRef="engine" SubPart="body"/></Rockets></RocketEngineController></RocketEngineControllers>
      <Components><Tank><SphericalTank><Material Ref="Aluminum.2014" Phase="Solid"/><RoleAffinity>Air Water</RoleAffinity></SphericalTank></Tank><Battery Key="cell" HasStatusLight="true"><MaximumCapacity J="3600"/></Battery>
      <Habitat Key="cabin"><BlockedConnectors><Connector KeyRef="top"/></BlockedConnectors></Habitat>
      <KeyframeAnimationModule Key="deploy"><KeyframeAnimation Ref="anim"/><SolarTracking><Tracked KeyRef="body"/><ExcludeSubParts><ExcludeSubPart KeyRef="body"/></ExcludeSubParts></SolarTracking></KeyframeAnimationModule></Components></Part></Assets>`);
    const row = doc.getElementsByTagName('Part')[0];
    const parsed = parseGameDataElement(row);
    expect(placementsFromPartElement(row)[0]).toMatchObject({
      instanceId: 'body',
      subPartTemplateId: 'Body',
    });
    expect(connectorsFromPartElement(row)[0]).toMatchObject({
      id: 'top',
      flags: ['Edge', 'Internal'],
      siblingIds: ['bottom'],
    });
    expect(parsed.gameData.tanks[0]).toMatchObject({
      id: 'Tank',
      wallMaterialId: 'Aluminum.2014(s)',
      roleAffinity: 'Air Water',
    });
    expect(parsed.gameData.batteries[0]).toMatchObject({
      capacityWh: 1,
      ksaId: 'cell',
      hasStatusLight: true,
    });
    expect(parsed.gameData.combustors[0]).toMatchObject({
      id: 'chamber',
      reactionId: 'fuel',
      feeds: [{ kind: 'container', containerId: 'Tank', subPartInstanceId: 'body' }],
    });
    expect(parsed.gameData.rocketControllers[0].rocketRefs).toEqual([
      { id: 'engine', subPartInstanceId: 'body' },
    ]);
    expect(parsed.gameData.gimbals[0]).toMatchObject({
      subPartInstanceId: 'body',
      maxAngleYDeg: 5,
    });
    expect(parsed.animationModules[0]).toMatchObject({
      glbId: 'anim',
      glbPath: 'Animations/a.glb',
      solarTracking: { subPartOriginalId: 'body', excludeOriginalIds: ['body'] },
    });
    expect(parsed.gameData.unknownComponents.map((n) => n.tag)).toEqual(['Habitat']);
    expect(
      remapRawConnectorRefs(parsed.gameData.unknownComponents, new Map([['top', 'newTop']]))[0]
        .children[0].children[0].attrs.KeyRef,
    ).toBe('newTop');
  });

  it('exports patch rows and resolves them into current flattened rows', () => {
    const part = createEmptyPart();
    part.partId = 'P';
    part.gameData.displayName = 'Example';
    part.gameData.unknownComponents = [{ tag: 'Habitat', attrs: { Key: 'cabin' }, children: [] }];
    part.gameData.batteries.push({ capacityWh: 1, ksaId: 'cell' });
    part.subPartGameData.push(createSubPartGameData('Body'));
    const entry = { part, remap: new Map<string, string>() };
    const geometry = serializePartsXml([entry]);
    const patch = serializeGameDataXml([entry], 'Example');
    expect(patch).toContain('<Part Id="P" Modify="Patch"');
    expect(patch).toContain('<Components Modify="Extend">');
    expect(patch).toContain('<Battery Key="cell">');
    expect(patch).not.toContain('PartGameData');
    const resolved = resolveContent([
      { file: 'geometry', doc: parse(geometry) },
      { file: 'game', doc: parse(patch) },
    ]);
    const parsed = parseGameDataElement(resolved.doc.getElementsByTagName('Part')[0]);
    expect(parsed.gameData.batteries).toEqual([{ capacityWh: 1, ksaId: 'cell' }]);
    expect(parsed.gameData.unknownComponents.map((n) => n.tag)).toEqual(['Habitat']);
  });
  it('round-trips wrapped engine, collider, gimbal and phase data through resolved output', () => {
    const doc = parse(`<Assets><Part Id="P"><SubParts><SubPart Key="body" Ref="Body"/></SubParts>
      <Gimbals><Gimbal Key="steer"><SubPart KeyRef="body"/><Transform><Position X="2"/></Transform><MaxAngleY Degrees="5"/></Gimbal></Gimbals>
      <RocketCores><Combustor Key="core"><FeedsFroms><FeedsFrom><Connector KeyRef="top"/></FeedsFrom></FeedsFroms><Reaction Ref="fuel"/></Combustor></RocketCores>
      <Rockets><Rocket Key="engine"><Core KeyRef="core"/><Nozzles><Nozzle KeyRef="nozzle"/></Nozzles></Rocket></Rockets>
      <RocketNozzles><DeLavalNozzle Key="nozzle"><ExitDiameter M="1"/><AreaRatio Value="2"/><ReactionPlumes><ReactionPlume><Reaction Ref="fuel"/><VolumetricExhaust Ref="flame"/></ReactionPlume></ReactionPlumes><SoundEvent Ref="engineSound" Action="On"/></DeLavalNozzle></RocketNozzles>
      <Components><Tank Key="fuel"><SphericalTank><Material Ref="Aluminum.2014" Phase="Solid"/><OuterRadius M="1"/><WallThickness Mm="3"/><RoleAffinity>Air Water</RoleAffinity></SphericalTank></Tank><Collider Key="bounds"><Colliders><Box Key="box"><LengthX M="1"/><LengthY M="2"/><LengthZ M="3"/></Box></Colliders></Collider></Components></Part></Assets>`);
    const row = doc.getElementsByTagName('Part')[0];
    const source = parseGameDataElement(row);
    const part = createEmptyPart();
    part.partId = 'P';
    part.gameData = source.gameData;
    part.placements = placementsFromPartElement(row);
    part.colliders = source.colliders;
    const entry = { part, remap: new Map<string, string>() };
    const patch = serializeGameDataXml([entry], 'Example');
    expect(patch).toContain('<Gimbal Key="steer">');
    expect(patch).toContain('<Reaction Ref="fuel"');
    expect(patch).toContain('<Material Ref="Aluminum.2014" Phase="Solid"');
    expect(patch).toContain('<Colliders>');
    const resolved = resolveContent([
      { file: 'geometry', doc: parse(serializePartsXml([entry])) },
      { file: 'game', doc: parse(patch) },
    ]);
    const result = parseGameDataElement(resolved.doc.getElementsByTagName('Part')[0]);
    expect(result.gameData.gimbals).toEqual(source.gameData.gimbals);
    expect(result.gameData.combustors).toEqual(source.gameData.combustors);
    expect(result.gameData.rockets).toEqual(source.gameData.rockets);
    expect(result.gameData.nozzles).toEqual(source.gameData.nozzles);
    expect(result.gameData.tanks).toEqual(source.gameData.tanks);
    expect(result.colliders).toEqual(source.colliders);
  });
});
