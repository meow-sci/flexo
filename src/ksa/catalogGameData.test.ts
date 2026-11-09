import { expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { resolveContent } from './contentXml';
import { catalogPartsFromContent } from './partCatalog';

it('parses a final patched Part rather than adding an overlay twice', () => {
  const xml = `<Assets><Part Id="base"><SubParts><SubPart Key="body" Ref="body"/></SubParts></Part>
  <Part Id="base" Modify="Patch"><EditorTags Modify="Extend"><EditorTag Ref="Fuel Tanks"/></EditorTags><Components Modify="Extend"><Battery><MaximumCapacity J="3600"/></Battery></Components></Part>
  <Part Id="alt" Parent="base"><SubParts><SubPart Key="skin" Ref="skin"/></SubParts></Part></Assets>`;
  const doc = new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;
  const alt = catalogPartsFromContent(resolveContent([{ file: 'a', doc }])).find(
    (p) => p.id === 'alt',
  )!;
  expect(alt.editorTags).toEqual(['Fuel Tanks']);
  expect(alt.batteries).toHaveLength(1);
  expect(alt.placements.map((p) => p.subPartTemplateId)).toEqual(['skin']);
});
