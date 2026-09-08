import { readFileSync, existsSync } from 'node:fs';
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCoreCatalog, indexCatalog, type CatalogSubPart } from '../ksa/catalog';
import {
  loadCorePartCatalog,
  mergeGameData,
  parseGameDataFile,
  parsePartsFile,
  type CatalogPart,
} from '../ksa/partCatalog';
import { hasKsaAssets, ksaAsset } from '../ksa/ksaTestAssets';
import {
  indexReactionCatalog,
  loadReactionCatalog,
  type ReactionData,
} from '../ksa/reactionCatalog';
import { buildMultiModContent } from '../ksa/modExport';
import { validateEngines } from '../ksa/engineValidation';
import { createEmptyPart } from '../ksa/types';
import { $part } from './editorStore';
import { importBuiltInPart } from './partImport';
import {
  computePerformance,
  performanceSelection,
  rocketsInScope,
} from '../ui/engine/performanceAggregation';
import {
  $activeEngineEntry,
  activateEngine,
  FIRST_PAIR_ROCKET,
  initEngineMode,
  type EngineEntry,
} from './engineStore';
import { setMode } from './modeStore';
import {
  loadGrainGeometryCatalog,
  loadSolidPropellantDensities,
  type GrainGeometryTable,
} from '../ksa/grainGeometryCatalog';
import { selectSolidCurveTarget, resolveSolidCurve } from '../ui/engine/solidCurveResolution';

// Exercise the production loaders and import action against the current private Core tree.
// Portable, vendored engine-schema regressions live alongside the parser/catalog tests.
describe.skipIf(!hasKsaAssets)('current Core engine import → performance → mod export', () => {
  let parts: CatalogPart[];
  let catalog: Map<string, CatalogSubPart>;
  let reactions: Map<string, ReactionData>;
  let grains: GrainGeometryTable[];
  let grainIndex: Map<string, GrainGeometryTable>;
  let densities: Map<string, number>;

  beforeAll(async () => {
    // happy-dom rejects valid single-quoted XML declarations shipped by Core.
    vi.stubGlobal('DOMParser', XmlDOMParser);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const pathname = new URL(input, 'http://localhost').pathname;
        const path = ksaAsset(decodeURIComponent(pathname.split('/ksa/')[1] ?? pathname));
        if (!existsSync(path)) return new Response('', { status: 404 });
        return new Response(readFileSync(path));
      }),
    );
    const loaded = await Promise.all([
      loadCorePartCatalog(),
      loadCoreCatalog(),
      loadReactionCatalog(),
      loadGrainGeometryCatalog(),
      loadSolidPropellantDensities(),
    ]);
    parts = loaded[0].filter(
      (p) => p.rockets.length > 0 || p.subPartGameData.some((s) => s.rockets.length > 0),
    );
    catalog = indexCatalog(loaded[1]);
    reactions = indexReactionCatalog(loaded[2]);
    grains = loaded[3];
    grainIndex = new Map(grains.map((g) => [g.id, g]));
    densities = loaded[4];
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    $part.set(createEmptyPart());
    activateEngine(null);
  });

  it('opens EngineA3’s imported chamber and performance after a previously active turbine nozzle', async () => {
    $part.set(createEmptyPart());
    initEngineMode();
    setMode('build');
    activateEngine({
      kind: 'subpart',
      templateId: 'CorePropulsionA_Subpart_EngineATurbopumpNozzle',
    });
    await importBuiltInPart(parts.find((p) => p.id === 'CorePropulsionA_Prefab_EngineA3')!);
    setMode('engine');
    const entry = $activeEngineEntry.get();
    expect(entry).toEqual({
      kind: 'subpart',
      templateId: 'CorePropulsionA_Subpart_EngineALargeVacAssembly',
    });
    const selection = performanceSelection(rocketsInScope($part.get(), entry), FIRST_PAIR_ROCKET);
    const result = computePerformance($part.get(), entry, selection, reactions);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.thrustVacN).toBeGreaterThan(0);
      expect(result.ispVac).toBeGreaterThan(0);
    }
    setMode('build');
  });

  it('keeps every stock rocket resolvable and its performance stable after export and reimport', async () => {
    // Current 5402 Core census: a missing pack must not silently shrink coverage.
    expect(parts).toHaveLength(38);
    let liquidRockets = 0;
    let solidRockets = 0;
    let solidCurves = 0;
    for (const source of parts) {
      $part.set(createEmptyPart());
      await importBuiltInPart(source);
      const imported = structuredClone($part.get());
      imported.partId = source.id;
      expect(
        validateEngines(imported, reactions).filter((i) => i.severity === 'block'),
        source.id,
      ).toEqual([]);
      expect(
        validateEngines(imported, reactions).filter((i) => i.code === 'core-not-referenced'),
        `${source.id} controller wiring`,
      ).toEqual([]);

      const content = buildMultiModContent(
        [{ entryId: 'engine', name: source.id, ns: 'engine', part: imported }],
        'EngineAudit',
        catalog,
      );
      const parser = new DOMParser();
      const exported: CatalogPart[] = [];
      parsePartsFile(
        parser.parseFromString(content.partXml, 'application/xml'),
        content.partFile,
        exported,
      );
      const data = {
        parts: new Map(),
        subParts: new Map(),
        subPartColliders: new Map(),
        subPartLights: new Map(),
      };
      parseGameDataFile(parser.parseFromString(content.gameDataXml, 'application/xml'), data);
      mergeGameData(exported, data);
      expect(exported, source.id).toHaveLength(1);
      $part.set(createEmptyPart());
      await importBuiltInPart(exported[0]);
      const roundTripped = $part.get();
      expect(
        validateEngines(roundTripped, reactions).filter((i) => i.severity === 'block'),
        `${source.id} exported`,
      ).toEqual([]);
      expect(
        validateEngines(roundTripped, reactions).filter((i) => i.code === 'core-not-referenced'),
        `${source.id} exported controller wiring`,
      ).toEqual([]);

      const scopes: EngineEntry[] = [
        { kind: 'part' },
        ...imported.subPartGameData.map(
          (s): EngineEntry => ({ kind: 'subpart', templateId: s.subPartTemplateId }),
        ),
      ];
      for (const entry of scopes) {
        const remappedEntry: EngineEntry =
          entry.kind === 'part'
            ? entry
            : {
                kind: 'subpart',
                templateId: content.perPart[0].remap.get(entry.templateId) ?? entry.templateId,
              };
        const rockets = rocketsInScope(imported, entry);
        if (rockets.length)
          expect(performanceSelection(rockets, FIRST_PAIR_ROCKET)).toBe(rockets[0].id);
        for (const rocket of rockets) {
          const label = `${source.id}: ${entry.kind === 'part' ? 'Part' : entry.templateId}/${rocket.id}`;
          const before = computePerformance(imported, entry, rocket.id, reactions);
          const after = computePerformance(roundTripped, remappedEntry, rocket.id, reactions);
          if (before.kind === 'solid') {
            solidRockets++;
            expect(after.kind, label).toBe('solid');
            const instances =
              entry.kind === 'part'
                ? [null]
                : imported.placements
                    .filter((p) => p.subPartTemplateId === entry.templateId)
                    .map((p) => p.instanceId);
            for (const instance of instances) {
              const target = selectSolidCurveTarget(imported, entry, rocket.id, instance)!;
              const exportedInstance =
                instance === null
                  ? null
                  : roundTripped.placements[
                      imported.placements.findIndex((p) => p.instanceId === instance)
                    ].instanceId;
              const exportedTarget = selectSolidCurveTarget(
                roundTripped,
                remappedEntry,
                rocket.id,
                exportedInstance,
              )!;
              expect(target, label).toBeTruthy();
              expect(exportedTarget, label).toBeTruthy();
              const curve = resolveSolidCurve(
                imported,
                target,
                reactions,
                grains,
                grainIndex,
                densities,
              );
              const exportedCurve = resolveSolidCurve(
                roundTripped,
                exportedTarget,
                reactions,
                grains,
                grainIndex,
                densities,
              );
              if (curve.curve) {
                solidCurves++;
                expect(curve.curve.peakThrustN, label).toBeGreaterThan(0);
                expect(exportedCurve.curve, label).toBeTruthy();
                expect(
                  exportedCurve.curve!.peakThrustN / curve.curve.peakThrustN,
                  label,
                ).toBeCloseTo(1, 3);
                expect(
                  exportedCurve.curve!.burnSeconds / curve.curve.burnSeconds,
                  label,
                ).toBeCloseTo(1, 3);
              } else {
                expect(curve.reason, label).toContain('assembled vehicle');
                expect(exportedCurve.reason, label).toContain('assembled vehicle');
              }
            }
            continue;
          }
          expect(before.kind, label).toBe('ok');
          expect(after.kind, `${label} exported`).toBe('ok');
          if (before.kind !== 'ok' || after.kind !== 'ok') continue;
          liquidRockets++;
          expect(before.thrustVacN, label).toBeGreaterThan(0);
          expect(before.ispVac, label).toBeGreaterThan(0);
          // KSA XML uses G6: serialized scalar inputs retain six significant digits.
          expect(after.thrustVacN / before.thrustVacN, label).toBeCloseTo(1, 4);
          expect(after.ispVac / before.ispVac, label).toBeCloseTo(1, 4);
          expect(after.massFlowRate / before.massFlowRate, label).toBeCloseTo(1, 4);
        }
      }
    }
    expect(liquidRockets).toBe(35);
    expect(solidRockets).toBe(16);
    expect(solidCurves).toBeGreaterThan(0);
    console.info(
      `Engine round trip: ${parts.length} Core parts, ${liquidRockets} liquid rockets, ${solidRockets} solid rockets, ${solidCurves} local solid burn curves`,
    );
  });
});
