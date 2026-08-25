/**
 * Celestial corpus store (plan P7.01): lazily fetches Core's Astronomicals.xml
 * + SolSystem.xml from the /ksa/ mirror and indexes them for the site UI
 * (body picker) and the system-mod export (body cloning).
 */
import { atom } from 'nanostores';
import { fetchXmlFile } from '../../../../src/ksa/catalog';
import { parseCelestialCorpus, type CelestialCorpus } from '../ksa/systemXml';

/** Body ids available for sites (corpus keys, document order). */
export const $bodyIds = atom<string[]>([]);

export interface StockLandmark {
  id: string;
  latDeg: number;
  lonDeg: number;
  isLaunchPad: boolean;
}

/** Stock landmarks per body (for the "replace a stock site" helper). */
export const $stockLandmarks = atom<Map<string, StockLandmark[]>>(new Map());

let loading: Promise<CelestialCorpus | null> | null = null;

/** Fetches + parses the corpus once; null (with a console error) when unavailable. */
export function ensureCorpusLoaded(): Promise<CelestialCorpus | null> {
  loading ??= (async () => {
    const [astro, sol] = await Promise.all([
      fetchXmlFile('Astronomicals.xml'),
      fetchXmlFile('SolSystem.xml'),
    ]);
    if (astro.kind !== 'ok' || sol.kind !== 'ok') {
      console.error(
        'icrp corpus: Astronomicals.xml / SolSystem.xml not served under /ksa/ — ' +
          'site export unavailable (re-sync flexo-private-assets).',
      );
      return null;
    }
    try {
      const corpus = parseCelestialCorpus([
        { doc: astro.doc, file: 'Astronomicals.xml' },
        { doc: sol.doc, file: 'SolSystem.xml' },
      ]);
      $bodyIds.set([...corpus.bodies.keys()]);
      const stock = new Map<string, StockLandmark[]>();
      for (const [bodyId, el] of corpus.bodies) {
        const rows: StockLandmark[] = [];
        for (const lm of Array.from(el.childNodes)) {
          if (lm.nodeType !== 1 || (lm as Element).tagName !== 'Landmark') continue;
          const landmark = lm as Element;
          const id = landmark.getAttribute('Id');
          if (!id) continue;
          const deg = (tag: string) => {
            for (const child of Array.from(landmark.childNodes)) {
              if (child.nodeType === 1 && (child as Element).tagName === tag) {
                return Number((child as Element).getAttribute('Degrees') ?? 'NaN');
              }
            }
            return NaN;
          };
          rows.push({
            id,
            latDeg: deg('Latitude'),
            lonDeg: deg('Longitude'),
            isLaunchPad: landmark.getAttribute('IsLaunchPad') === 'true',
          });
        }
        if (rows.length > 0) stock.set(bodyId, rows);
      }
      $stockLandmarks.set(stock);
      return corpus;
    } catch (err) {
      console.error('icrp corpus: parse failed', err);
      return null;
    }
  })();
  return loading;
}
