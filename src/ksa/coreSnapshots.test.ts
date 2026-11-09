import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { EDITOR_TAG_DEFS, KNOWN_REACTIONS, PLUME_TRAIL_IDS, VOLUMETRIC_EXHAUST_IDS } from './types';
import { hasKsaAssets, ksaAsset } from './ksaTestAssets';
import { readFileSync } from 'node:fs';
import { parseReactionsFile, type ReactionData } from './reactionCatalog';

const rows = (file: string, tag: string) =>
  Array.from(
    new DOMParser()
      .parseFromString(
        readFileSync(`src/ksa/__core_snapshots__/${file}`, 'utf8').replace(/^\uFEFF/, ''),
        'application/xml',
      )
      .getElementsByTagName(tag),
  );
describe('Core autocomplete snapshots', () => {
  it('matches the current editor tag registry', () => {
    expect(EDITOR_TAG_DEFS).toEqual(
      rows('CoreEditorTagsGameData.xml', 'EditorTagDef').map((e) => ({
        id: e.getAttribute('Id'),
        notaCategory: e.getAttribute('NotaCategory') === 'true',
      })),
    );
  });
  it('matches the current plume registries', () => {
    expect([...VOLUMETRIC_EXHAUST_IDS].sort()).toEqual(
      rows('ExhaustAssets.xml', 'VolumetricExhaustTemplate')
        .map((e) => e.getAttribute('Id'))
        .sort(),
    );
    expect([...PLUME_TRAIL_IDS].sort()).toEqual(
      rows('PlumeTrailAssets.xml', 'PlumeTrailTemplate')
        .map((e) => e.getAttribute('Id'))
        .sort(),
    );
  });
  it.runIf(hasKsaAssets)('matches the live reaction IDs', () => {
    const doc = new DOMParser().parseFromString(
      readFileSync(ksaAsset('Reactions.xml'), 'utf8'),
      'application/xml',
    ) as unknown as Document;
    const reactions: ReactionData[] = [];
    parseReactionsFile(doc, reactions);
    expect(KNOWN_REACTIONS.map((r) => r.id).sort()).toEqual(reactions.map((r) => r.id).sort());
  });
});
