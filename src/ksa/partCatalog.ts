/**
 * Loads the KSA "Core" Part catalog at runtime by fetching and parsing the same
 * Core *Assets.xml files as the SubPart catalog, but extracting whole <Part>
 * definitions (their SubPart instances + transforms + editor tags) instead of
 * individual SubPart templates. Used by the "+ Part" importer to drop a complete
 * pre-assembled Part into the current project.
 *
 * Uses the browser DOMParser — no third-party XML lib, no build step.
 */

import { loadCoreContent } from './coreContent';
import { contentSource, type ResolvedContent } from './contentXml';
import {
  connectorsFromPartElement,
  crashToleranceFromPartElement,
  parseGameDataElement,
  placementsFromPartElement,
  subPartGameDataFromDoc,
  subPartCollidersFromRoot,
  subPartLightsFromRoot,
} from './partXmlParser';
import { createSubPartGameData } from './types';
import type {
  Battery,
  CatalogAnimationModule,
  Combustor,
  ThermalCore,
  AntimatterRamCore,
  MagneticNozzle,
  MagneticScoop,
  MassDefinition,
  Connector,
  ConsumerFeedWiring,
  Decoupler,
  DeLavalNozzle,
  DockingPort,
  EvaDoor,
  Generator,
  Gimbal,
  IvaSeat,
  PartCollider,
  PartLight,
  PowerConsumer,
  RawXmlNode,
  Rocket,
  RocketController,
  SolarPanel,
  SolidGrainSegment,
  SolidMotor,
  SolidMotorNozzle,
  SubPartGameData,
  SubPartPlacement,
  Tank,
} from './types';

export interface CatalogPart {
  /** Part id as declared in the Assets XML, e.g. "CoreFuelTankA_Prefab_LF1W1HA". */
  id: string;
  variantIds: string[];
  variantHeadId: string | null;
  variantIndex: number;
  /** Editor tags from <EditorTag Value="..."/> (e.g. "Fuel Tanks"), in order. */
  editorTags: string[];
  /** The SubPart instances composing this Part, with their relative transforms. */
  placements: SubPartPlacement[];
  /** The connector attachment points of this Part, with their relative transforms. */
  connectors: Connector[];
  /**
   * The Part's collision volume, gathered from ALL of its authoring sites: the geometry
   * `<Part><Collider>` (which flexo used to drop — gap E), the `<PartGameData><Collider>`,
   * and every `<SubPartGameData><Collider>` for a template this Part places. Part-level
   * shapes carry `ownerTemplateId: null`; SubPart-owned ones name their template.
   */
  colliders: PartCollider[];
  /**
   * The Part's IVA camera vantage points, gathered from BOTH Part-level authoring sites —
   * the geometry `<Part><IVASeat>` first, then the `<PartGameData><IVASeat>`s (KSA merges
   * `Components` additively, no dedupe) — with `_seatN` re-numbered over the merged list.
   * SubPart-level seats are deliberately not gathered (plans/IVA_PLAN.md §6).
   */
  ivaSeats: IvaSeat[];
  /**
   * The Part's cast lights, gathered from both GameData authoring sites: the
   * `<PartGameData><Light>`s (`ownerTemplateId: null`) and every
   * `<SubPartGameData><Light>` for a template this Part places (owner = that template
   * id), with `_lightN` re-numbered over the merged list.
   */
  lights: PartLight[];
  /** KeyframeAnimationModules (from GameData), decoded + imported alongside the Part. */
  animationModules: CatalogAnimationModule[];
  /** Connector-bound coupling game-data (from GameData); connectorIds are in the Part's original id space. */
  decoupler: Decoupler | null;
  dockingPort: DockingPort | null;
  evaDoor: EvaDoor | null;
  /** Part diameter in meters (<Diameter M/>, VAB size-class filter), or null. */
  diameterM: number | null;
  /** Extra `<Diameter M/>` size classes beyond {@link diameterM} (adapter prefabs), preserved for round-trip. */
  extraDiametersM: number[];
  /** Geometry `<Part CrashTolerance>` (Pa), or null when the game derives it (KSA 2026.9.7.5402). */
  crashTolerancePa: number | null;
  /** Command-capability marker (<Control/>): the part can pilot a vehicle. */
  controllable: boolean;
  controlKey?: string;
  /** Preserved scalar custom mass; fresh stock XML imports use massDefinitions. */
  customMass: number | null;
  /** Unmodeled children of that `<CustomMass>` (inertia, offsets), preserved verbatim. */
  customMassExtras: RawXmlNode[];
  massDefinitions: MassDefinition[];
  /** Unmodeled `<PartGameData>` attrs + child elements, preserved verbatim for round-trip. */
  unknownAttrs: Record<string, string>;
  unknownChildren: RawXmlNode[];
  unknownComponents: RawXmlNode[];
  /** Part-level power modules (from GameData), carried into the editor on import. */
  batteries: Battery[];
  generators: Generator[];
  solarPanels: SolarPanel[];
  /** The part's single power consumer / light switch, or null (KSA has one switch slot). */
  powerConsumer: PowerConsumer | null;
  /** Per-SubPart-template data (tanks / solar panels / engine modules) for the SubParts this Part places. */
  subPartGameData: SubPartGameData[];
  /** Part-level engine modules (controllers/rockets/combustors/nozzles/gimbals); instance refs in original id space. */
  rocketControllers: RocketController[];
  rockets: Rocket[];
  combustors: Combustor[];
  thermalCores: ThermalCore[];
  antimatterRamCores: AntimatterRamCore[];
  magneticNozzles: MagneticNozzle[];
  magneticScoops: MagneticScoop[];

  nozzles: DeLavalNozzle[];
  gimbals: Gimbal[];
  /** Part-level `<Tank>`s (where Core authors its prefab tank data since KSA 2026.7.6). */
  tanks: Tank[];
  /** Part-level solid-motor hardware (SRB cases / nozzles / grain segments). */
  solidMotors: SolidMotor[];
  solidNozzles: SolidMotorNozzle[];
  solidGrainSegments: SolidGrainSegment[];
  /** `<ConsumerFeedWiring>`; SubPart + connector refs in the Part's ORIGINAL id space. */
  consumerFeedWiring: ConsumerFeedWiring[];
  /** Originating XML file (for debugging / grouping). */
  sourceFile: string;
}

const directElements = (e: Element): Element[] =>
  Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1);
const direct = (e: Element, tag: string) => directElements(e).find((c) => c.tagName === tag);
function sameElement(a: Element, b: Element): boolean {
  if (a.tagName !== b.tagName) return false;
  const attrs = (e: Element) =>
    Array.from(e.attributes)
      .map((x) => [x.name, x.value])
      .sort(([x], [y]) => x.localeCompare(y));
  if (JSON.stringify(attrs(a)) !== JSON.stringify(attrs(b))) return false;
  const ac = directElements(a),
    bc = directElements(b);
  if (ac.length !== bc.length) return false;
  if (!ac.length && (a.textContent ?? '').trim() !== (b.textContent ?? '').trim()) return false;
  return ac.every((child, i) => sameElement(child, bc[i]));
}
/** Match the game's VariantFamilyCheck before deriving selection metadata. */
function invalidVariantIds(rows: Element[]): Set<string> {
  const parts = new Map(
    rows.filter((r) => r.tagName === 'Part').map((r) => [r.getAttribute('Id')!.toLowerCase(), r]),
  );
  const subparts = new Map(
    rows
      .filter((r) => r.tagName === 'SubPart')
      .map((r) => [r.getAttribute('Id')!.toLowerCase(), r]),
  );
  const invalid = new Set<string>();
  for (const head of parts.values()) {
    const refs = directElements(direct(head, 'Variants') ?? head).filter(
      (r) => r.tagName === 'Part',
    );
    if (
      !refs.length ||
      refs[0].getAttribute('Ref')?.toLowerCase() !== head.getAttribute('Id')!.toLowerCase()
    )
      continue;
    for (const ref of refs.slice(1)) {
      const id = ref.getAttribute('Ref')?.toLowerCase();
      const member = id && parts.get(id);
      if (!member || member === head) continue;
      const attrs = (e: Element) =>
        Array.from(e.attributes)
          .filter((a) => a.name !== 'Id')
          .map((a) => [a.name, a.value])
          .sort(([a], [b]) => a.localeCompare(b));
      const hc = directElements(head).filter((e) => e.tagName !== 'SubParts');
      const mc = directElements(member).filter((e) => e.tagName !== 'SubParts');
      let drift =
        JSON.stringify(attrs(head)) !== JSON.stringify(attrs(member)) ||
        hc.length !== mc.length ||
        hc.some((e, i) => !sameElement(e, mc[i]));
      const subRefs = (e: Element) =>
        directElements(direct(e, 'SubParts') ?? e)
          .filter((n) => n.tagName === 'SubPart')
          .map((n) => (n.getAttribute('Ref') ?? '').toLowerCase());
      const headRefs = new Set(subRefs(head));
      for (const subRef of subRefs(member)) {
        if (headRefs.has(subRef)) continue;
        const sub = subparts.get(subRef);
        const components = sub && direct(sub, 'Components');
        if (
          components &&
          directElements(components).some(
            (c) =>
              !['PartModel', 'PartModelDynamic', 'PartModelGlass', 'MeshView'].includes(c.tagName),
          )
        )
          drift = true;
      }
      if (drift && id) invalid.add(id);
    }
  }
  return invalid;
}

/** Parse concrete Parts from one resolved document. */
export function catalogPartsFromContent(content: ResolvedContent): CatalogPart[] {
  const root = content.doc.documentElement;
  const rows = Array.from(root.childNodes).filter((n): n is Element => n.nodeType === 1);
  const subData = new Map(
    subPartGameDataFromDoc(content.doc).map((s) => [s.subPartTemplateId.toLowerCase(), s]),
  );
  const subColliders = subPartCollidersFromRoot(root);
  const subLights = subPartLightsFromRoot(root);
  for (const item of [...subColliders, ...subLights]) {
    const id = item.ownerTemplateId;
    if (id && !subData.has(id.toLowerCase()))
      subData.set(id.toLowerCase(), createSubPartGameData(id));
  }
  const invalidVariants = invalidVariantIds(rows);
  const partRows = rows.filter((e) => e.tagName === 'Part' && e.getAttribute('Test') !== 'true');
  const validIds = new Map(
    partRows.map((p) => [p.getAttribute('Id')!.toLowerCase(), p.getAttribute('Id')!]),
  );
  const out: CatalogPart[] = [];
  for (const part of partRows) {
    const id = part.getAttribute('Id')!;
    const placements = placementsFromPartElement(part);
    const parsed = parseGameDataElement(part);
    const gd = parsed.gameData;
    const templateIds = new Set(placements.map((p) => p.subPartTemplateId.toLowerCase()));
    const variantsNode = Array.from(part.childNodes).find(
      (n) => n.nodeType === 1 && (n as Element).tagName === 'Variants',
    ) as Element | undefined;
    let variantIds = variantsNode
      ? Array.from(variantsNode.childNodes)
          .filter((n): n is Element => n.nodeType === 1 && (n as Element).tagName === 'Part')
          .flatMap((n) => {
            const resolved = validIds.get((n.getAttribute('Ref') ?? '').toLowerCase());
            return resolved ? [resolved] : [];
          })
      : [];
    if (invalidVariants.has(id.toLowerCase())) variantIds = [];
    else variantIds = variantIds.filter((v) => !invalidVariants.has(v.toLowerCase()));
    if (variantIds.length < 2 || !variantIds.some((v) => v.toLowerCase() === id.toLowerCase()))
      variantIds = [];
    out.push({
      id,
      variantIds,
      variantHeadId: variantIds[0] ?? null,
      variantIndex: Math.max(
        0,
        variantIds.findIndex((v) => v.toLowerCase() === id.toLowerCase()),
      ),
      placements,
      connectors: connectorsFromPartElement(part),
      editorTags: parsed.editorTags,
      colliders: [
        ...parsed.colliders,
        ...subColliders.filter(
          (c) => c.ownerTemplateId && templateIds.has(c.ownerTemplateId.toLowerCase()),
        ),
      ],
      ivaSeats: parsed.ivaSeats,
      lights: [
        ...parsed.lights,
        ...subLights.filter(
          (l) => l.ownerTemplateId && templateIds.has(l.ownerTemplateId.toLowerCase()),
        ),
      ],
      animationModules: parsed.animationModules,
      crashTolerancePa: crashToleranceFromPartElement(part),
      decoupler: gd.decoupler,
      dockingPort: gd.dockingPort,
      evaDoor: gd.evaDoor,
      diameterM: gd.diameterM,
      extraDiametersM: gd.extraDiametersM,
      controllable: gd.controllable,
      controlKey: gd.controlKey,
      customMass: gd.customMass,
      customMassExtras: gd.customMassExtras,
      massDefinitions: gd.massDefinitions,
      unknownAttrs: gd.unknownAttrs,
      unknownChildren: gd.unknownChildren,
      unknownComponents: gd.unknownComponents,
      batteries: gd.batteries,
      generators: gd.generators,
      solarPanels: gd.solarPanels,
      powerConsumer: gd.powerConsumer,
      subPartGameData: [...templateIds].flatMap((key) =>
        subData.has(key) ? [structuredClone(subData.get(key)!)] : [],
      ),
      rocketControllers: gd.rocketControllers,
      rockets: gd.rockets,
      combustors: gd.combustors,
      thermalCores: gd.thermalCores,
      antimatterRamCores: gd.antimatterRamCores,
      magneticNozzles: gd.magneticNozzles,
      magneticScoops: gd.magneticScoops,
      nozzles: gd.nozzles,
      gimbals: gd.gimbals,
      tanks: gd.tanks,
      solidMotors: gd.solidMotors,
      solidNozzles: gd.solidNozzles,
      solidGrainSegments: gd.solidGrainSegments,
      consumerFeedWiring: gd.consumerFeedWiring,
      sourceFile: contentSource(content, 'Part', id),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadCorePartCatalog(): Promise<CatalogPart[]> {
  return catalogPartsFromContent(await loadCoreContent());
}

export function indexPartCatalog(entries: CatalogPart[]): Map<string, CatalogPart> {
  return new Map(entries.map((e) => [e.id, e]));
}
