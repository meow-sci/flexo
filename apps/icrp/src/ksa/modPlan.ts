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

/**
 * Builds the full mod plan. `pieceIndex` resolves each placement's pieceId to
 * its catalog entry (origin decides reference-vs-declare).
 */
export function buildModPlan(
  project: IcrpProjectDoc,
  pieceIndex: ReadonlyMap<string, CatalogStaticPiece>,
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
      (pl) => (pieceIndex.get(pl.pieceId)?.colliders.length ?? 0) > 0,
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

    objectPlans.push({
      id: obj.id,
      placements: obj.placements.map((pl) => ({
        instanceId: pl.instanceId,
        instanceOf: instanceOf.get(pl.pieceId) ?? pl.pieceId,
        transform: pl.transform,
      })),
      colliders: obj.objectColliders,
    });
    gameDataPlans.push({
      id: obj.id,
      groundOffsetM: obj.groundOffsetM,
      surfaceHeightM: obj.surfaceHeightM,
      footprintRadiusM: obj.footprintRadiusM,
    });
  }

  // --- Files --------------------------------------------------------------------
  const assetsName = `${modId}Assets.xml`;
  const gameDataName = `${modId}GameData.xml`;
  const files: ModFile[] = [
    { path: 'mod.toml', data: serializeIcrpModToml(project.modName, [assetsName, gameDataName]) },
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

  return { modId, files, issues, vesselPieceIds: vesselPieces.map((p) => p.id) };
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
