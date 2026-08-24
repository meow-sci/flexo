/**
 * Mod export planner (plans/ICRP_PLAN.md P8.01/P8.03): turns the project into
 * the mod's file set —
 *
 *   <modId>/
 *     mod.toml                  name + assets (+ systems once sites exist, P7)
 *     <ModId>Assets.xml         vessel-derived <StaticSubObject>s + <StaticObject>s
 *     <ModId>GameData.xml       <StaticObjectGameData> metres
 *
 * Core static pieces are referenced by id and never re-declared (first-wins
 * registry); vessel-derived pieces become new `<StaticSubObject>`s that
 * reference the Core mesh/material by id with the SubPart's own colliders
 * (fact F12) — no binaries ship. Pure module: no stores, no three.
 */
import { sanitizeBaseName } from '../../../../src/ksa/modExport';
import { colliderWorld } from '../../../../src/three/coords';
import type { CatalogStaticPiece } from './staticCatalog';
import type { IcrpProjectDoc } from '../state/docStore';
import {
  serializeStaticAssetsXml,
  serializeStaticGameDataXml,
  type StaticGameDataPlan,
  type StaticObjectPlan,
  type StaticPiecePlan,
} from './staticXmlSerializer';

export interface ModFile {
  /** Path inside the mod folder (forward slashes). */
  path: string;
  data: string;
}

export interface PreflightIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface ModPlanResult {
  /** Mod id == folder name == zip root (KSA convention). */
  modId: string;
  files: ModFile[];
  issues: PreflightIssue[];
  /** Vessel-derived `<StaticSubObject>`s declared (for the export summary). */
  vesselPieceIds: string[];
}

/** The prebuilt `<System>` scenario (from `systemXml.ts`) when sites exist. */
export interface SystemFilePlan {
  /** File name under `systems/` (e.g. `mycomplex_system.xml`). */
  fileName: string;
  xml: string;
}

/** How the mod places its objects in the world (plan D2/P8.02). */
export type ExportMode =
  /** New `<StaticObject>`s + a self-contained `<System>` with the project's sites. */
  | 'system-mod'
  /**
   * No system: every object's placements/colliders APPEND onto the stock
   * `CoreLaunchPadA_Prefab_LaunchPadA` via `<StaticObjectGameData>` (fact L3)
   * — the additions appear at ALL FIVE stock Earth sites at once.
   */
  | 'extend-stock-pad';

export const STOCK_PAD_ID = 'CoreLaunchPadA_Prefab_LaunchPadA';

/**
 * Builds the full mod plan. `pieceIndex` resolves each placement's pieceId to
 * its catalog entry (origin decides reference-vs-declare); `system` carries the
 * async-built `<System>` scenario when the project has sites (the caller owns
 * the corpus fetch — this module stays pure/sync).
 */
export function buildModPlan(
  project: IcrpProjectDoc,
  pieceIndex: ReadonlyMap<string, CatalogStaticPiece>,
  system?: SystemFilePlan | null,
  mode: ExportMode = 'system-mod',
): ModPlanResult {
  const issues: PreflightIssue[] = [];
  const modId = sanitizeBaseName(project.modName);
  if (modId !== project.modName) {
    issues.push({
      severity: 'warning',
      message: `Mod name sanitized to '${modId}' (mod id = folder name; alphanumerics only).`,
    });
  }

  // --- Gather used pieces across all objects ------------------------------------
  const usedPieceIds = new Set<string>();
  for (const obj of project.objects) {
    for (const pl of obj.placements) usedPieceIds.add(pl.pieceId);
  }

  const vesselPieces: StaticPiecePlan[] = [];
  /** placement pieceId → exported InstanceOf. */
  const instanceOf = new Map<string, string>();
  for (const pieceId of [...usedPieceIds].sort()) {
    const piece = pieceIndex.get(pieceId);
    if (!piece) {
      issues.push({ severity: 'error', message: `Unknown piece '${pieceId}' (catalog missing?).` });
      continue;
    }
    if (piece.origin === 'core-static') {
      instanceOf.set(pieceId, pieceId); // Core owns the declaration
      continue;
    }
    // Vessel-derived: declare a namespaced StaticSubObject referencing Core ids.
    const exportId = `icrp_${modId}_${pieceId}`;
    instanceOf.set(pieceId, exportId);
    if (!piece.materialId) {
      issues.push({
        severity: 'error',
        message: `Vessel piece '${pieceId}' has no material id — cannot export.`,
      });
      continue;
    }
    vesselPieces.push({
      id: exportId,
      meshId: piece.meshNodeName,
      materialId: piece.materialId,
      colliders: piece.colliders,
    });
  }

  // --- Objects ------------------------------------------------------------------
  const objectPlans: StaticObjectPlan[] = [];
  const gameDataPlans: StaticGameDataPlan[] = [];
  const seenObjectIds = new Set<string>();
  for (const obj of project.objects) {
    if (seenObjectIds.has(obj.id)) {
      issues.push({ severity: 'error', message: `Duplicate object id '${obj.id}'.` });
      continue;
    }
    seenObjectIds.add(obj.id);
    if (obj.placements.length === 0) {
      issues.push({ severity: 'warning', message: `Object '${obj.name}' has no placements.` });
    }

    // I4: an object with zero colliders anywhere = vessels fall through.
    const pieceColliders = obj.placements.some(
      (pl) =>
        (pieceIndex.get(pl.pieceId)?.colliders.length ?? 0) > 0 || (pl.colliders?.length ?? 0) > 0,
    );
    if (!pieceColliders && obj.objectColliders.length === 0 && obj.placements.length > 0) {
      issues.push({
        severity: 'warning',
        message: `Object '${obj.name}' has no colliders — vessels will fall through it in-game.`,
      });
    }

    // I3: colliders never scale with the placement.
    for (const pl of obj.placements) {
      const s = pl.transform.scale;
      const scaled =
        Math.abs(s.x - 1) > 1e-9 || Math.abs(s.y - 1) > 1e-9 || Math.abs(s.z - 1) > 1e-9;
      if (scaled && (pieceIndex.get(pl.pieceId)?.colliders.length ?? 0) > 0) {
        issues.push({
          severity: 'warning',
          message:
            `'${pl.instanceId}' is scaled but its piece has colliders — KSA never scales ` +
            `colliders (visuals and collision will disagree).`,
        });
      }
    }

    if (obj.footprintRadiusM === null && obj.placements.length > 0) {
      issues.push({
        severity: 'warning',
        message:
          `Object '${obj.name}' has no FootprintRadius — no spawn-height bump and no ` +
          `clutter clearing at its sites.`,
      });
    }

    // Placement-owned colliders (part-level shapes from stock-part imports)
    // compose into the object-level <Collider> with the placement's CURRENT
    // transform — they follow the piece wherever it was moved. Scale is never
    // composed (KSA, fact F4/I3): the collider's own scale IS its size.
    const placementColliders = obj.placements.flatMap((pl) =>
      (pl.colliders ?? []).map((c, i) => {
        const world = colliderWorld(
          { position: c.position, rotation: c.rotation, scale: c.scale },
          pl.transform,
        );
        return {
          ...c,
          id: `${pl.instanceId}_${c.id}${i}`,
          position: world.position,
          rotation: world.rotation,
        };
      }),
    );

    objectPlans.push({
      id: obj.id,
      placements: obj.placements.map((pl) => ({
        instanceId: pl.instanceId,
        instanceOf: instanceOf.get(pl.pieceId) ?? pl.pieceId,
        transform: pl.transform,
      })),
      colliders: [...obj.objectColliders, ...placementColliders],
    });
    gameDataPlans.push({
      id: obj.id,
      groundOffsetM: obj.groundOffsetM,
      surfaceHeightM: obj.surfaceHeightM,
      footprintRadiusM: obj.footprintRadiusM,
    });
  }

  // --- Extend-stock-pad mode (plan P8.02) ----------------------------------------
  if (mode === 'extend-stock-pad') {
    if (project.sites.length > 0) {
      issues.push({
        severity: 'warning',
        message:
          'Extend-stock-pad mode ignores sites — the additions appear at the five stock ' +
          'Earth pads; switch to system-mod to place new sites.',
      });
    }
    const merged = objectPlansToStockGameData(project, instanceOf, issues);
    const assetsNameX = `${modId}Assets.xml`;
    const gameDataNameX = `${modId}GameData.xml`;
    const filesX: ModFile[] = [
      {
        path: 'mod.toml',
        data: serializeIcrpModToml(project.modName, [assetsNameX, gameDataNameX]),
      },
      {
        path: assetsNameX,
        data: serializeStaticAssetsXml({ materials: [], pieces: vesselPieces, objects: [] }),
      },
      { path: gameDataNameX, data: serializeStaticGameDataXml([merged]) },
    ];
    return { modId, files: filesX, issues, vesselPieceIds: vesselPieces.map((p) => p.id) };
  }

  // --- Sites (plan P7.02 preflight) ----------------------------------------------
  const knownObjectIds = new Set(project.objects.map((o) => o.id));
  const sitesPerBody = new Map<string, number>();
  const landmarkIdsPerBody = new Map<string, Set<string>>();
  for (const site of project.sites) {
    sitesPerBody.set(site.bodyId, (sitesPerBody.get(site.bodyId) ?? 0) + 1);
    const names = landmarkIdsPerBody.get(site.bodyId) ?? new Set<string>();
    if (names.has(site.landmarkId)) {
      issues.push({
        severity: 'error',
        message: `Duplicate landmark id '${site.landmarkId}' on ${site.bodyId}.`,
      });
    }
    names.add(site.landmarkId);
    landmarkIdsPerBody.set(site.bodyId, names);
    if (!knownObjectIds.has(site.staticObjectId) && !site.staticObjectId.startsWith('Core')) {
      issues.push({
        severity: 'error',
        message: `Site '${site.landmarkId}' points at unknown object '${site.staticObjectId}'.`,
      });
    }
    if (!site.landmarkId.trim()) {
      issues.push({ severity: 'error', message: 'A site has an empty landmark id.' });
    }
  }
  for (const [bodyId, count] of sitesPerBody) {
    if (count > 4) {
      issues.push({
        severity: 'warning',
        message:
          `${bodyId} has ${count} launch-pad sites — KSA clears ground clutter for at ` +
          `most 4 per body (fact F8); the rest keep clutter inside their footprint.`,
      });
    }
  }
  if (project.sites.length > 0 && !system) {
    issues.push({
      severity: 'error',
      message:
        'Sites exist but no <System> scenario was built (Core Astronomicals/SolSystem ' +
        'unavailable?) — the exported mod would have no way to place them.',
    });
  }

  // --- Files --------------------------------------------------------------------
  const assetsName = `${modId}Assets.xml`;
  const gameDataName = `${modId}GameData.xml`;
  const systemPath = system ? `systems/${system.fileName}` : null;
  const files: ModFile[] = [
    {
      path: 'mod.toml',
      data: serializeIcrpModToml(
        project.modName,
        [assetsName, gameDataName],
        systemPath ? [systemPath] : [],
      ),
    },
    {
      path: assetsName,
      data: serializeStaticAssetsXml({
        materials: [],
        pieces: vesselPieces,
        objects: objectPlans,
      }),
    },
    { path: gameDataName, data: serializeStaticGameDataXml(gameDataPlans) },
  ];
  if (system && systemPath) files.push({ path: systemPath, data: system.xml });

  return { modId, files, issues, vesselPieceIds: vesselPieces.map((p) => p.id) };
}

/**
 * Merges every object's placements/colliders into ONE GameData append targeting
 * the stock pad. Metres are emitted only when the user set them (override
 * semantics, F10) — from the FIRST object that sets each.
 */
function objectPlansToStockGameData(
  project: IcrpProjectDoc,
  instanceOf: ReadonlyMap<string, string>,
  issues: PreflightIssue[],
): StaticGameDataPlan {
  const placements: StaticObjectPlan['placements'][number][] = [];
  const colliders: IcrpProjectDoc['objects'][number]['objectColliders'] = [];
  let groundOffsetM: number | null = null;
  let surfaceHeightM: number | null = null;
  let footprintRadiusM: number | null = null;
  const seenInstanceIds = new Set<string>();
  for (const obj of project.objects) {
    for (const pl of obj.placements) {
      let instanceId = pl.instanceId;
      if (seenInstanceIds.has(instanceId)) instanceId = `${obj.id}_${instanceId}`;
      seenInstanceIds.add(instanceId);
      placements.push({
        instanceId,
        instanceOf: instanceOf.get(pl.pieceId) ?? pl.pieceId,
        transform: pl.transform,
      });
      for (const [i, c] of (pl.colliders ?? []).entries()) {
        const world = colliderWorld(
          { position: c.position, rotation: c.rotation, scale: c.scale },
          pl.transform,
        );
        colliders.push({
          ...c,
          id: `${instanceId}_${c.id}${i}`,
          position: world.position,
          rotation: world.rotation,
        });
      }
    }
    colliders.push(...obj.objectColliders);
    groundOffsetM ??= obj.groundOffsetM;
    surfaceHeightM ??= obj.surfaceHeightM;
    footprintRadiusM ??= obj.footprintRadiusM;
  }
  if (groundOffsetM !== null || surfaceHeightM !== null || footprintRadiusM !== null) {
    issues.push({
      severity: 'warning',
      message:
        "Set metres OVERRIDE the stock pad's (0.2 / 1.5537 / 108.3) at all five sites — " +
        'leave them unset to keep the stock values.',
    });
  }
  return {
    id: STOCK_PAD_ID,
    groundOffsetM,
    surfaceHeightM,
    footprintRadiusM,
    placements,
    colliders,
  };
}

/**
 * mod.toml — only the keys KSA reads (`Mod.cs`): name + the explicit file lists
 * (no directory scan). `systems` joins in P7.
 */
export function serializeIcrpModToml(
  name: string,
  assets: string[],
  systems: string[] = [],
): string {
  const list = (xs: string[]) =>
    xs.length === 0 ? '[]' : `[ ${xs.map((a) => `"${a}"`).join(', ')} ]`;
  let out = `name = "${name}"\nassets = ${list(assets)}\n`;
  if (systems.length > 0) out += `systems = ${list(systems)}\n`;
  return out;
}
