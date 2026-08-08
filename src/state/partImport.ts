import { addPart } from './editorStore';
import { selectAnimationClip } from './animationStore';
import { randomId } from './ids';
import { notify } from './notificationStore';
import { toUrl } from '../ksa/catalog';
import {
  decodeAnimationGlb,
  remapImportedAnimation,
  type ImportedAnimation,
} from '../ksa/animationImport';
import { fitAnimationEasingDetailed, type AnimationFitReport } from '../ksa/easingFit';
import { EASING_CHANNELS } from '../ksa/easing';
import type { PartAnimation, Transform } from '../ksa/types';
import type { CatalogPart } from '../ksa/partCatalog';

/**
 * Imports a built-in catalog Part INCLUDING its keyframe animations. The three.js
 * GLB decode lives here (not in editorStore, which stays three-free): each
 * `<KeyframeAnimationModule>`'s `_Anim.glb` is fetched + decoded into an
 * {@link ImportedAnimation} (refs in original instance-id space), then handed to
 * {@link addPart}, which regenerates instance ids and lets us remap the animations
 * through its old→new map in the same undo step. Returns the layer the Part landed on.
 */
export async function importBuiltInPart(
  part: CatalogPart,
  targetLayerId?: string,
): Promise<string> {
  const instanceIds = new Set(part.placements.map((p) => p.instanceId));
  const placements = new Map<string, Transform>(part.placements.map((p) => [p.instanceId, p]));
  const decoded: ImportedAnimation[] = [];
  for (const mod of part.animationModules ?? []) {
    try {
      const res = await fetch(toUrl(mod.glbPath));
      if (!res.ok) {
        console.error(`flexo: animation GLB ${mod.glbPath} not found (${res.status})`);
        continue;
      }
      const imp = decodeAnimationGlb(await res.arrayBuffer(), {
        instanceIds,
        module: mod,
        placements,
      });
      if (imp) decoded.push(imp);
    } catch (err) {
      console.error(`flexo: failed to import animation ${mod.glbPath}`, err);
    }
  }

  // KSA positions animated SubParts SOLELY from the GLB and ignores their geometry
  // `<Position>` (it's overwritten on spawn), so override each animated SubPart's
  // placement with the GLB-faithful rest pose the decoder captured. For correctly
  // authored clips this equals the geometry placement (a no-op); when they disagree
  // (a stale/rotated geometry placement) it's what keeps the imported animation
  // matching the game instead of anchoring the joint motion to the wrong spot.
  const restPlacements = new Map<string, Transform>();
  for (const d of decoded) for (const [id, t] of d.memberRestPlacements) restPlacements.set(id, t);
  const importedPlacements = part.placements.map((p) => {
    const t = restPlacements.get(p.instanceId);
    return t
      ? { ...p, position: { ...t.position }, rotation: { ...t.rotation }, scale: { ...t.scale } }
      : p;
  });

  // What the fit did to each clip, collected during the id-remap pass and posted as one
  // rich notification once the Part is in the document (design §11.3 item 3).
  const fitEntries: AnimationImportEntry[] = [];

  const layerId = addPart(
    importedPlacements,
    part.connectors,
    part.editorTags,
    targetLayerId,
    (idMap): PartAnimation[] =>
      decoded.map((d) => {
        const { anim: fitted, report } = fitAnimationEasingDetailed(
          remapImportedAnimation(d, idMap, makeId),
        );
        // KSA deploy clips are modeled fully-deployed (their LAST keyframe), so anchor
        // the preview/export there instead of the stowed t=0 (see restKeyframeId docs).
        const anchored =
          !d.restAtLastKeyframe || fitted.keyframes.length === 0
            ? fitted
            : {
                ...fitted,
                restKeyframeId: fitted.keyframes.reduce((a, b) => (b.timeSec > a.timeSec ? b : a))
                  .id,
              };
        fitEntries.push({ anim: anchored, report });
        return anchored;
      }),
    // Deep-clone so later edits to the imported part's GameData never mutate the
    // cached catalog entry (which can be imported again).
    structuredClone({
      decoupler: part.decoupler,
      dockingPort: part.dockingPort,
      evaDoor: part.evaDoor,
      diameterM: part.diameterM,
      extraDiametersM: part.extraDiametersM,
      controllable: part.controllable,
      customMass: part.customMass,
      customMassExtras: part.customMassExtras,
      unknownAttrs: part.unknownAttrs,
      unknownChildren: part.unknownChildren,
      batteries: part.batteries,
      generators: part.generators,
      solarPanels: part.solarPanels,
      powerConsumer: part.powerConsumer,
      subPartGameData: part.subPartGameData,
      rocketControllers: part.rocketControllers,
      rockets: part.rockets,
      combustors: part.combustors,
      nozzles: part.nozzles,
      gimbals: part.gimbals,
      tanks: part.tanks,
      solidMotors: part.solidMotors,
      solidNozzles: part.solidNozzles,
      solidGrainSegments: part.solidGrainSegments,
      consumerFeedWiring: part.consumerFeedWiring,
      colliders: part.colliders,
      ivaSeats: part.ivaSeats,
      lights: part.lights,
    }),
  );

  // Open the first imported clip. Without this an import that brought animations left
  // `$activeAnimationId` null, so every surface that renders the ACTIVE clip reported the
  // opposite of what just happened — the desktop dock said "No animation clips — create one
  // to start" and the phone transport chip said "No clip". On phone that chip is the only
  // animation surface visible without opening a sheet, so a freshly imported clip looked
  // like it had not imported at all. View state only: no undo step, and no mode switch —
  // an import from Build mode stays in Build mode.
  if (fitEntries.length > 0) selectAnimationClip(fitEntries[0].anim.id);

  // ONE rich entry per import, and only when the Part actually brought clips (design §11.3
  // item 3 / foundation §5.1 routing: `rich` = notification center only, sticky, bell pulses).
  if (fitEntries.length > 0) {
    notify({
      severity: 'rich',
      title: `Imported ${part.id}: ${fitEntries.length} animation clip${
        fitEntries.length === 1 ? '' : 's'
      }`,
      body: buildAnimationImportReport(fitEntries),
    });
  }

  return layerId;
}

/**
 * `randomId` rather than `crypto.randomUUID` — the latter is undefined outside a secure
 * context (see ids.ts), which a phone on a plain-HTTP LAN URL hits. This one runs INSIDE
 * `addPart`'s `buildAnimations` callback, so throwing here aborted the whole import before
 * `$part.set`: the animated Part landed as nothing at all.
 */
function makeId(prefix: string): string {
  return `${prefix}_${randomId().replace(/-/g, '').slice(0, 8)}`;
}

/** One imported clip and what the reverse easing fit made of it. */
export interface AnimationImportEntry {
  anim: PartAnimation;
  report: AnimationFitReport;
}

/**
 * The Animations block of the import report (design §11.3 item 3) — a PURE string builder, so
 * it is unit-testable without a fetch, a GLB or a document.
 *
 * Per clip it answers the four things a user needs after a KSA import: how big the rig is,
 * how much of the baked ~30 fps stream survived as real keyframes (and which joints refused
 * to fit and kept their dense keys losslessly), which channels came back EASED (the v2
 * per-channel fit — LOCKED #8), and the two facts that change how the clip behaves in the
 * editor: the rest anchor sitting at the final keyframe (a deploy clip, modeled deployed) and
 * CubicSpline sampling having been approximated.
 */
export function buildAnimationImportReport(entries: readonly AnimationImportEntry[]): string {
  return entries
    .map(({ anim, report }) => {
      const jointName = (id: string) => anim.joints.find((j) => j.id === id)?.name ?? id;
      const lines = [
        `${anim.name} — ${anim.joints.length} joint${anim.joints.length === 1 ? '' : 's'}, ` +
          `${anim.keyframes.length} keyframe${anim.keyframes.length === 1 ? '' : 's'}` +
          (report.keyframesIn > report.keyframesOut
            ? ` (fitted from ${report.keyframesIn} baked keys)`
            : ''),
      ];

      const dense = report.jointStats
        .filter((s) => s.kind === 'dense')
        .map((s) => jointName(s.jointId));
      if (dense.length > 0) {
        lines.push(`  dense keys kept (no curve fit): ${dense.join(', ')}`);
      }

      const eased = EASING_CHANNELS.map((channel) => ({
        channel,
        count: report.jointStats.filter((s) => s.easedChannels.includes(channel)).length,
      })).filter((entry) => entry.count > 0);
      lines.push(
        eased.length > 0
          ? `  eased channels: ${eased.map((e) => `${e.channel} ×${e.count}`).join(' · ')}`
          : '  eased channels: none (all linear)',
      );

      if (anim.restKeyframeId) lines.push('  anchored at final keyframe (modeled deployed)');
      if (anim.cubicSplineApprox) {
        lines.push('  CubicSpline sampling — imported approximately (tangents dropped)');
      }
      return lines.join('\n');
    })
    .join('\n\n');
}
