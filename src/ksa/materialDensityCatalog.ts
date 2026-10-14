import { fetchXmlFile } from './catalog';
import { directChildren, readDensityKgM3 } from './partXmlParser';

/** Phase ids match SubstancePhaseName: solid `(s)` and liquid `(l)` only. */
export function parseMaterialDensities(doc: Document, out: Map<string, number>): void {
  for (const substance of Array.from(doc.getElementsByTagName('Substance'))) {
    const id = substance.getAttribute('Id');
    if (!id) continue;
    for (const [tag, suffix] of [
      ['Solid', '(s)'],
      ['Liquid', '(l)'],
    ] as const) {
      const phase = directChildren(substance, tag)[0];
      const density = phase && readDensityKgM3(directChildren(phase, 'StorageDensity')[0]);
      if (density != null && Number.isFinite(density) && density > 0) out.set(id + suffix, density);
    }
  }
}

/** Licensed libraries can be absent; unresolved material masses remain visibly incomplete. */
export async function loadMassMaterialDensities(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const results = await Promise.all(
    ['Materials.xml', 'Volatiles.xml', 'SolidPropellants.xml'].map(fetchXmlFile),
  );
  for (const result of results) if (result.kind === 'ok') parseMaterialDensities(result.doc, out);
  return out;
}
