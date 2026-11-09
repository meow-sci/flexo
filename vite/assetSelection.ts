import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { CORE_CONTENT_FILES } from '../src/ksa/coreFiles';

export const STATIC_CONTENT_FILES = [
  'CoreLaunchPadAAssets.xml',
  'CoreLaunchPadBAssets.xml',
  'CoreLaunchPadCAssets.xml',
  'CoreLaunchPadAGameData.xml',
];

/** Browser resources, excluding the mirror's unused planetary/cloud payloads. */
export function selectBrowserAssets(assetsDir: string): Set<string> {
  const selected = new Set<string>();
  // All metadata remains available to lazy ICRP/reaction/material consumers.
  for (const entry of readdirSync(assetsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.xml')) selected.add(entry.name);
  }
  for (const file of [...CORE_CONTENT_FILES, ...STATIC_CONTENT_FILES]) {
    const path = join(assetsDir, file);
    if (!existsSync(path)) continue;
    const doc = new DOMParser().parseFromString(
      readFileSync(path, 'utf8').replace(/^\uFEFF/, ''),
      'application/xml',
    );
    for (const element of Array.from(doc.getElementsByTagName('*'))) {
      const resource = element.getAttribute('Path');
      if (resource) selected.add(resource.replaceAll('\\', '/'));
    }
  }
  // Character glTF sidecars and editor aides are outside the Part catalog. ICRP
  // consumes the tiny decal images, but references planetary textures in Core.
  function addDirectory(relative: string) {
    const absolute = join(assetsDir, relative);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) addDirectory(path);
      else if (entry.isFile()) selected.add(path);
    }
  }
  for (const directory of [
    'Characters',
    'Textures/Characters',
    'Animations',
    'Textures/Planets/_Decals',
  ])
    addDirectory(directory);
  return selected;
}
