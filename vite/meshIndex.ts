import { existsSync, openSync, closeSync, readSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { CORE_CONTENT_FILES } from '../src/ksa/coreFiles';
import { STATIC_CONTENT_FILES } from './assetSelection';

/** Index names KSA registers from non-HostOnly GLB mesh atlases. */
export function buildMeshIndex(assetsDir: string): Record<string, string> {
  const index: Record<string, string> = {};
  const paths = new Set<string>();
  const referenced = new Set<string>();
  for (const file of [...CORE_CONTENT_FILES, ...STATIC_CONTENT_FILES]) {
    const abs = join(assetsDir, file);
    if (!existsSync(abs)) continue;
    const doc = new DOMParser().parseFromString(
      readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''),
      'application/xml',
    );
    for (const kind of ['PartModel', 'PartModelDynamic', 'PartModelGlass']) {
      for (const model of Array.from(doc.getElementsByTagName(kind))) {
        const mesh = model.getElementsByTagName('Mesh')[0]?.getAttribute('Ref');
        if (mesh) referenced.add(mesh.toLowerCase());
      }
    }
    for (const atlas of Array.from(doc.getElementsByTagName('MeshAtlas'))) {
      if (atlas.getAttribute('HostOnly')?.toLowerCase() === 'true') continue;
      const path = atlas.getAttribute('Path');
      if (path && path.toLowerCase().endsWith('.glb')) paths.add(path);
    }
  }
  for (const path of paths) {
    const abs = join(assetsDir, path);
    if (!existsSync(abs)) continue;
    const fd = openSync(abs, 'r');
    try {
      const header = Buffer.alloc(20);
      if (
        readSync(fd, header, 0, 20, 0) !== 20 ||
        header.toString('ascii', 0, 4) !== 'glTF' ||
        header.toString('ascii', 16, 20) !== 'JSON'
      )
        throw new Error(`Invalid GLB ${path}`);
      const json = Buffer.alloc(header.readUInt32LE(12));
      readSync(fd, json, 0, json.length, 20);
      const data = JSON.parse(json.toString('utf8')) as { meshes?: { name?: string }[] };
      for (const mesh of data.meshes ?? []) {
        if (!mesh.name) continue;
        const name = mesh.name.toLowerCase();
        if (!referenced.has(name)) continue;
        if (index[name] && index[name] !== path)
          throw new Error(`Mesh ${mesh.name} occurs in ${index[name]} and ${path}`);
        index[name] = path;
      }
    } finally {
      closeSync(fd);
    }
  }
  return index;
}
