/**
 * Pre-flight validation for a Part's IVA seats and the interior they look at.
 *
 * Same two severities as {@link import('./colliderValidation').validateColliders}, and the
 * same meaning — and, like that module's, they are ADVISORY: the UI surfaces them, nothing
 * gates the export on them.
 *  - **block** — the exported seat would poison KSA's camera, so the mod is broken in game.
 *    Surfaced as a load-failure-grade problem the author needs to fix before shipping.
 *  - **warn**  — KSA loads it fine, but the part behaves in a way the author almost certainly
 *    didn't intend (a seat staring into space, an interior nobody can ever see).
 *
 * The rules implemented here (plans/IVA_PLAN.md §3.8, in full):
 *  - `iva-seat-non-finite` (block) — a seat's position or derived axes are NaN/∞.
 *  - `iva-seat-duplicate` (warn) — two seats at the identical position AND orientation.
 *  - `iva-seat-no-interior` (warn) — seats, but no interior geometry to look at.
 *  - `iva-interior-no-seat` (warn) — interior geometry, but no seat it can be seen from.
 *  - `iva-interior-on-glass` (warn) — `<Internal>` on a template that exports as glass.
 *  - `iva-seat-outside-colliders` (warn) — the eye point is outside the collision volume.
 *  - `iva-seat-count` (warn) — more seats than anyone wants to press `C` through.
 *  - `iva-seat-at-origin` (warn) — a seat still sitting at the default `(0,0,0)`.
 *
 * ⚠️ **The non-unit-axis and parallel-axis gotchas (plans/IVA_PLAN.md §1.6.1-3) cannot reach
 * this module, so there is deliberately NO rule for them.** `rotation` is the document's
 * source of truth for a seat's orientation: `partXmlParser` DROPS a seat whose authored
 * `<ForwardAxis>`/`<UpAxis>` pair is degenerate (`seatRotationFromAxes` returns `null` for a
 * zero or parallel pair), and the editor can only ever produce a rotation, from which
 * `seatAxesFromRotation` derives a unit, orthogonal pair by construction. Do not add a dead
 * rule here — the only way a bad pair survives to export is a non-finite `rotation`, which
 * IS checked below.
 *
 * Every check names the game-side member it mirrors so a future KSA update can be re-verified
 * against the decomp rather than against this file's prose. Pure: no stores, no React, no three.
 */

import { pointInCollider, type PlacedCollider } from '../measure/colliderCoverage';
import { ksaQuatFromEulerXyz, seatAxesFromRotation } from './ivaSeatAxes';
import { resolveInternal } from './modExport';
import type { CatalogSubPart } from './catalog';
import type { EditingPart, Vec3 } from './types';

/** `block` ⇒ the exported Part is broken in game; `warn` ⇒ it loads but misbehaves. */
export type IvaSeatIssueSeverity = 'block' | 'warn';

export interface IvaSeatIssue {
  severity: IvaSeatIssueSeverity;
  /** Stable kebab-case code — the UI and tests match on this, not on the prose. */
  code: string;
  message: string;
}

/** Positions/axes closer than this count as "the same" for the duplicate-seat check. */
const SAME_EPS = 1e-9;

function sameVec(a: Vec3, b: Vec3): boolean {
  return (
    Math.abs(a.x - b.x) <= SAME_EPS &&
    Math.abs(a.y - b.y) <= SAME_EPS &&
    Math.abs(a.z - b.z) <= SAME_EPS
  );
}

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/**
 * More seats than this and `C` becomes a chore — every extra seat is one more press to
 * cycle past (`IVASeats` is walked in document order, §1.4). Named the way
 * `colliderValidation.MANY_COLLIDERS` is: a smell threshold, not a game limit.
 */
const MANY_SEATS = 8;

/**
 * The colliders a seat position can honestly be tested against.
 *
 * PART-LEVEL ONLY, on purpose. A seat's `<Position>` is in the Part's assembly frame, and so
 * is a part-level collider's transform — but a SubPart-owned collider (`ownerTemplateId !==
 * null`) is expressed in its TEMPLATE's local frame and exists once per PLACEMENT of that
 * template (see `PartCollider.ownerTemplateId`). Testing the seat against those coordinates
 * raw would compare two different spaces and fire on perfectly good seats; resolving them
 * properly means composing every placement's transform, which is the caller's job everywhere
 * else in the codebase (`colliderCoverage`'s contract, and `EditorScene.handleCoverageCheck`
 * is where that composition lives — with three.js, which this pure module must not import).
 * So they are skipped, and a part whose hull is entirely SubPart-owned simply gets no check:
 * a false negative is silent, a false positive nags about a correct part.
 */
function partLevelColliders(part: EditingPart): PlacedCollider[] {
  return part.colliders
    .filter((c) => c.ownerTemplateId === null)
    .map((collider) => ({
      collider,
      position: collider.position,
      // Same Euler convention as `matrixFromTransform` — `ivaSeatAxes.test.ts` locks the two
      // together, so this stays consistent with what the viewport draws.
      quaternion: ksaQuatFromEulerXyz(collider.rotation),
    }));
}

/**
 * True when a placed template is a custom mesh that exports through KSA's translucent
 * `<PartModelGlass>`, which has NO `<Internal>` field (grep-verified: the single
 * `[XmlElement("Internal")]` in the decomp is `PartModelModule.cs:35`).
 *
 * DUPLICATED from `editorStore.isGlassTemplate` on purpose: `src/ksa/` must not import
 * `src/state/`'s DOCUMENT store — a validator reaching back into `$part`/undo would invert the
 * layering (the one thing `src/ksa/` does import from `src/state/` is asset/settings storage,
 * via `modExport`). Keep the two copies in sync. The predicate is the DOCUMENT half of the
 * `glass` bit modExport computes when it plans a custom SubPart, and shares that module's
 * honest limit: it can only prove glass-ness for CUSTOM meshes, never for a built-in template
 * (whose glass-ness lives in the catalog's asset XML, which flexo does not model).
 */
function isGlassTemplate(part: EditingPart, templateId: string): boolean {
  const mesh = part.customMeshes.find((m) => m.subPartId === templateId);
  if (!mesh) return false;
  if (mesh.imported?.transparent) return true;
  if (!mesh.kitten?.transparent) return false;
  const surface = mesh.surface ?? 'glass';
  return surface === 'glass' || surface === 'glassGlow';
}

export function validateIvaSeats(
  part: EditingPart,
  catalog: ReadonlyMap<string, CatalogSubPart>,
): IvaSeatIssue[] {
  const issues: IvaSeatIssue[] = [];
  const block = (code: string, message: string) =>
    issues.push({ severity: 'block', code, message });
  const warn = (code: string, message: string) => issues.push({ severity: 'warn', code, message });

  // Seat ids are editor-only and NEVER emitted, so messages name a seat by its 1-based
  // position — which is also the load-bearing thing about it (cycle order, §1.4).
  const derived = part.ivaSeats.map((s) => seatAxesFromRotation(s.rotation));
  const hull = partLevelColliders(part);

  for (const [i, seat] of part.ivaSeats.entries()) {
    const { forward, up } = derived[i];
    if (!finiteVec(forward) || !finiteVec(up) || !finiteVec(seat.position)) {
      block(
        'iva-seat-non-finite',
        `Seat ${i + 1} has a non-finite position or orientation, so its <ForwardAxis>/<UpAxis> ` +
          `come out NaN — KSA would build a NaN camera rotation from them ` +
          `(Camera.LookAtRotation) and the IVA view would be unusable.`,
      );
      continue;
    }

    // Exact-duplicate seats: legal XML, but `C` cycles onto a seat that looks identical, so
    // the key appears to do nothing. Almost always a duplicate the author forgot to move.
    for (let j = 0; j < i; j++) {
      const other = part.ivaSeats[j];
      const otherAxes = derived[j];
      if (
        sameVec(seat.position, other.position) &&
        sameVec(forward, otherAxes.forward) &&
        sameVec(up, otherAxes.up)
      ) {
        warn(
          'iva-seat-duplicate',
          `Seats ${j + 1} and ${i + 1} share the identical position and orientation. KSA loads ` +
            `both, but cycling to seat ${i + 1} with C will appear to do nothing — probably a ` +
            `duplicate you forgot to move.`,
        );
        break;
      }
    }

    // The default position, still untouched: exact zero only — a seat deliberately placed at
    // the Part's origin is a millimetre off in practice, and an epsilon here would nag about
    // it. (`<Position>` is the EYE point, so the origin is almost never where it belongs.)
    if (seat.position.x === 0 && seat.position.y === 0 && seat.position.z === 0) {
      warn(
        'iva-seat-at-origin',
        `Seat ${i + 1} is at the Part's origin (0, 0, 0) — the default. <Position> is the eye ` +
          `point, so unless the origin really is head height inside the cabin, move the seat.`,
      );
    }

    // Outside the collision volume ⇒ the eye is almost certainly outside the hull. Only
    // meaningful when there is a hull to be outside of.
    if (hull.length > 0 && !hull.some((c) => pointInCollider(seat.position, c))) {
      warn(
        'iva-seat-outside-colliders',
        `Seat ${i + 1} sits outside every collider on this Part. The eye point is outside the ` +
          `collision volume, which usually means the seat is outside the hull.`,
      );
    }
  }

  if (part.ivaSeats.length > MANY_SEATS) {
    warn(
      'iva-seat-count',
      `${part.ivaSeats.length} IVA seats — every extra seat is one more press of C to cycle ` +
        `past in game, so keep the count to the crew that actually sits here.`,
    );
  }

  // Interior geometry = a placed template whose <PartModel> exports <Internal>true</Internal>
  // (PartModel.cs:387 renders it in IVA and nowhere else).
  const placedTemplates = [...new Set(part.placements.map((p) => p.subPartTemplateId))];
  const interiorTemplates = placedTemplates.filter((id) =>
    resolveInternal(part, id, catalog.get(id)),
  );

  if (part.ivaSeats.length > 0 && interiorTemplates.length === 0) {
    warn(
      'iva-seat-no-interior',
      `This Part has ${part.ivaSeats.length} IVA seat${part.ivaSeats.length === 1 ? '' : 's'} ` +
        `but no interior geometry of its own. KSA culls back faces unconditionally, so unless a ` +
        `neighbouring part supplies the interior you look at, from the seat the hull is simply ` +
        `not there and you look straight out at space. Place interior meshes and mark them ` +
        `“Interior (IVA only)”.`,
    );
  }

  if (interiorTemplates.length > 0 && part.ivaSeats.length === 0) {
    warn(
      'iva-interior-no-seat',
      `This Part has interior geometry (${interiorTemplates.length} template` +
        `${interiorTemplates.length === 1 ? '' : 's'} marked “Interior (IVA only)”) but no IVA ` +
        `seat. <Internal> hides it outside IVA, and with no seat the IVA camera mode is never ` +
        `offered — so it is invisible in EVERY camera mode, unless another part in the vehicle ` +
        `supplies a seat.`,
    );
  }

  for (const id of interiorTemplates) {
    if (!isGlassTemplate(part, id)) continue;
    warn(
      'iva-interior-on-glass',
      `“${id}” is marked “Interior (IVA only)” but exports through <PartModelGlass>, which has ` +
        `no <Internal> field — KSA silently ignores the flag and the mesh renders in every ` +
        `camera mode.`,
    );
  }

  return issues;
}

/**
 * True when any issue is `block`-severity — i.e. the Part would export, but the seat is broken
 * in game. Advisory only: nothing gates the export on it (`ExportButton` merely DISPLAYS
 * blocking issues, same as `colliderValidation`'s), so this is a convenience predicate for
 * callers that want to headline the worst severity present.
 */
export function hasBlockingIvaSeatIssue(issues: readonly IvaSeatIssue[]): boolean {
  return issues.some((i) => i.severity === 'block');
}
