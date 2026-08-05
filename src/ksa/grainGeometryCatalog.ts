/**
 * Loads the two Core data files behind the **solid-motor thrust-curve preview**
 * (`solidMotorPhysics.ts`):
 *
 *  - `GrainGeometries.xml` — one `<GrainGeometry Id>` per burn profile, each a list of
 *    `<DepthCondition>` triplets (`<Depth>` / `<Perimeter>` / `<PortArea>`) that IS the
 *    booster's thrust shape over its burn. All three columns are **normalized by the casing
 *    inner radius**, which is why one profile serves a motor of any size.
 *  - `SolidPropellants.xml` — the `<Substance>` library the solid reactions burn. The only
 *    field the curve needs is `<Solid><StorageDensity KgPerM3>`, which converts a burnt grain
 *    VOLUME into the mass flow that sets chamber pressure.
 *
 * Mirrors `GrainGeometryTemplate.Create()` (decomp:
 * `ksa-game-assemblies/current/decomp/KSA/GrainGeometryTemplate.cs`), with one deliberate
 * difference: KSA THROWS on a malformed profile (non-finite, negative perimeter, not strictly
 * increasing, not starting at depth 0) because a broken mod must fail loudly at load. flexo
 * is a read-only consumer of shipped data, so it SKIPS a malformed profile and keeps the rest
 * — a bad row must never cost the user the other four curves.
 *
 * Both files are licensed Core content served under `/ksa/` and **may be absent** in the
 * open-source build. That is not an error: the preview degrades to its "unavailable" hint and
 * authoring/export are unaffected — the same tolerance contract `Reactions.xml` has
 * ({@link import('./reactionCatalog').loadReactionCatalog}).
 */

import { fetchXmlFile } from './catalog';
import { directChildren } from './partXmlParser';

/** The file names served under `/ksa/` (siblings of `Reactions.xml`). */
export const GRAIN_GEOMETRIES_FILE = 'GrainGeometries.xml';
export const SOLID_PROPELLANTS_FILE = 'SolidPropellants.xml';

/**
 * One parsed `<GrainGeometry>` — KSA's `GrainGeometryTable` plus its identity. The three
 * arrays are parallel and ascending in {@link depth}; every value is dimensionless
 * (normalized by the casing inner radius).
 */
export interface GrainGeometryTable {
  id: string;
  /** `<Name Value>`, falling back to {@link id} (KSA does the same at load). */
  name: string;
  /** `<Shape Value>` — a human tag like "Tubular"/"Star". Empty when unset. */
  shape: string;
  /** `<Description Value>`. */
  description: string;
  depth: number[];
  perimeter: number[];
  portArea: number[];
}

/** `GrainGeometryTable.MaxDepth` — the normalized depth at which the grain is spent. */
export function grainMaxDepth(table: GrainGeometryTable): number {
  return table.depth[table.depth.length - 1];
}

/** `GrainGeometryTable.InitialPortArea` — the normalized bore area before any burn. */
export function grainInitialPortArea(table: GrainGeometryTable): number {
  return table.portArea[0];
}

/**
 * `GrainGeometryTable.InitialGrainArea` = `π − PortArea[0]`: the propellant cross-section as
 * a fraction of the casing bore (a full circle is π in these normalized units).
 */
export function grainInitialArea(table: GrainGeometryTable): number {
  return Math.PI - table.portArea[0];
}

function readValue(el: Element | null | undefined): number {
  const raw = el?.getAttribute('Value');
  if (raw == null) return Number.NaN;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function readString(parent: Element, tag: string): string {
  return directChildren(parent, tag)[0]?.getAttribute('Value')?.trim() ?? '';
}

/**
 * Parses `<GrainGeometry>` elements out of a `GrainGeometries.xml` document, appending to
 * `out`. Applies `GrainGeometryTemplate.Create`'s validation as a FILTER (see the module
 * doc): ≥2 conditions, sorted by depth, all finite, no negative perimeter, strictly
 * increasing depth AND port area, and depth starting at exactly 0.
 */
export function parseGrainGeometriesFile(doc: Document, out: GrainGeometryTable[]): void {
  for (const el of Array.from(doc.getElementsByTagName('GrainGeometry'))) {
    const id = el.getAttribute('Id')?.trim();
    if (!id) continue;
    const rows = directChildren(el, 'DepthCondition')
      .map((row) => ({
        depth: readValue(directChildren(row, 'Depth')[0]),
        perimeter: readValue(directChildren(row, 'Perimeter')[0]),
        portArea: readValue(directChildren(row, 'PortArea')[0]),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.depth) && Number.isFinite(r.perimeter) && Number.isFinite(r.portArea),
      )
      .sort((a, b) => a.depth - b.depth);
    if (rows.length < 2 || rows[0].depth !== 0) continue;
    const monotonic = rows.every(
      (r, i) =>
        r.perimeter >= 0 &&
        (i === 0 || (r.depth > rows[i - 1].depth && r.portArea > rows[i - 1].portArea)),
    );
    if (!monotonic) continue;
    out.push({
      id,
      name: readString(el, 'Name') || id,
      shape: readString(el, 'Shape'),
      description: readString(el, 'Description'),
      depth: rows.map((r) => r.depth),
      perimeter: rows.map((r) => r.perimeter),
      portArea: rows.map((r) => r.portArea),
    });
  }
}

/**
 * Parses `SolidPropellants.xml` into `substance id → <StorageDensity KgPerM3>`, appending to
 * `out`. A `<Substance>` with no `<Solid>` block (or no density) is skipped: it is not a
 * grain material, and inventing a density would silently produce a wrong thrust curve.
 */
export function parseSolidPropellantsFile(doc: Document, out: Map<string, number>): void {
  for (const el of Array.from(doc.getElementsByTagName('Substance'))) {
    const id = el.getAttribute('Id')?.trim();
    if (!id) continue;
    const solid = directChildren(el, 'Solid')[0];
    if (!solid) continue;
    const raw = directChildren(solid, 'StorageDensity')[0]?.getAttribute('KgPerM3');
    const density = raw == null ? Number.NaN : Number.parseFloat(raw);
    if (Number.isFinite(density) && density > 0) out.set(id, density);
  }
}

/**
 * A reaction's reactant phase id (`APCP(s)`) → the `<Substance Id>` it names (`APCP`). KSA
 * builds a phase id as `base.Id + "(g)"/"(l)"/"(s)"` (`SubstancePhaseName.cs`), so stripping
 * the suffix is the inverse.
 */
export function substanceIdOfPhase(phaseId: string): string {
  const paren = phaseId.indexOf('(');
  return paren > 0 ? phaseId.slice(0, paren) : phaseId;
}

/** Fetches + parses the grain-profile library. Empty (not an error) when the file is absent. */
export async function loadGrainGeometryCatalog(): Promise<GrainGeometryTable[]> {
  const r = await fetchXmlFile(GRAIN_GEOMETRIES_FILE);
  if (r.kind !== 'ok') {
    if (r.kind === 'missing') {
      console.info(
        `flexo grain catalog: ${GRAIN_GEOMETRIES_FILE} not served — solid thrust-curve preview disabled`,
      );
    }
    return [];
  }
  const out: GrainGeometryTable[] = [];
  parseGrainGeometriesFile(r.doc, out);
  out.sort((a, b) => a.name.localeCompare(b.name));
  console.info(`flexo grain catalog: ${out.length} grain geometries loaded`);
  return out;
}

/** Fetches + parses the solid storage densities. Empty (not an error) when absent. */
export async function loadSolidPropellantDensities(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const r = await fetchXmlFile(SOLID_PROPELLANTS_FILE);
  if (r.kind === 'ok') parseSolidPropellantsFile(r.doc, out);
  else if (r.kind === 'missing') {
    console.info(`flexo grain catalog: ${SOLID_PROPELLANTS_FILE} not served — no grain densities`);
  }
  return out;
}
