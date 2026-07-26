/**
 * Pre-flight validation for a Part's IVA seats and the interior they look at.
 *
 * Same two severities as {@link import('./colliderValidation').validateColliders}, and the
 * same meaning:
 *  - **block** — the exported seat would poison KSA's camera, or is an obvious duplicate the
 *    author never meant to ship. flexo must not ship it.
 *  - **warn**  — KSA loads it fine, but the part behaves in a way the author almost certainly
 *    didn't intend (a seat staring into space, an interior nobody can ever see).
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

import { seatAxesFromRotation } from './ivaSeatAxes'
import { resolveInternal } from './modExport'
import type { CatalogSubPart } from './catalog'
import type { EditingPart, Vec3 } from './types'

/** `block` ⇒ flexo refuses to export; `warn` ⇒ it exports but the part misbehaves. */
export type IvaSeatIssueSeverity = 'block' | 'warn'

export interface IvaSeatIssue {
  severity: IvaSeatIssueSeverity
  /** Stable kebab-case code — the UI and tests match on this, not on the prose. */
  code: string
  message: string
}

/** Positions/axes closer than this count as "the same" for the duplicate-seat check. */
const SAME_EPS = 1e-9

function sameVec(a: Vec3, b: Vec3): boolean {
  return (
    Math.abs(a.x - b.x) <= SAME_EPS &&
    Math.abs(a.y - b.y) <= SAME_EPS &&
    Math.abs(a.z - b.z) <= SAME_EPS
  )
}

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
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
  const mesh = part.customMeshes.find((m) => m.subPartId === templateId)
  if (!mesh) return false
  if (mesh.imported?.transparent) return true
  if (!mesh.kitten?.transparent) return false
  const surface = mesh.surface ?? 'glass'
  return surface === 'glass' || surface === 'glassGlow'
}

export function validateIvaSeats(
  part: EditingPart,
  catalog: ReadonlyMap<string, CatalogSubPart>,
): IvaSeatIssue[] {
  const issues: IvaSeatIssue[] = []
  const block = (code: string, message: string) => issues.push({ severity: 'block', code, message })
  const warn = (code: string, message: string) => issues.push({ severity: 'warn', code, message })

  // Seat ids are editor-only and NEVER emitted, so messages name a seat by its 1-based
  // position — which is also the load-bearing thing about it (cycle order, §1.4).
  const derived = part.ivaSeats.map((s) => seatAxesFromRotation(s.rotation))

  for (const [i, seat] of part.ivaSeats.entries()) {
    const { forward, up } = derived[i]
    if (!finiteVec(forward) || !finiteVec(up) || !finiteVec(seat.position)) {
      block(
        'iva-seat-non-finite',
        `Seat ${i + 1} has a non-finite position or orientation, so its <ForwardAxis>/<UpAxis> ` +
          `come out NaN — KSA would build a NaN camera rotation from them ` +
          `(Camera.LookAtRotation) and the IVA view would be unusable.`,
      )
      continue
    }

    // Exact-duplicate seats: legal XML, but `C` cycles onto a seat that looks identical, so
    // the key appears to do nothing. Almost always a duplicate the author forgot to move.
    for (let j = 0; j < i; j++) {
      const other = part.ivaSeats[j]
      const otherAxes = derived[j]
      if (
        sameVec(seat.position, other.position) &&
        sameVec(forward, otherAxes.forward) &&
        sameVec(up, otherAxes.up)
      ) {
        block(
          'iva-seat-duplicate',
          `Seats ${j + 1} and ${i + 1} share the identical position and orientation. That is ` +
            `not fatal in-game, but pressing C to cycle to it appears to do nothing — it is ` +
            `almost certainly a duplicate you forgot to move.`,
        )
        break
      }
    }
  }

  // Interior geometry = a placed template whose <PartModel> exports <Internal>true</Internal>
  // (PartModel.cs:387 renders it in IVA and nowhere else).
  const placedTemplates = [...new Set(part.placements.map((p) => p.subPartTemplateId))]
  const interiorTemplates = placedTemplates.filter((id) =>
    resolveInternal(part, id, catalog.get(id)),
  )

  if (part.ivaSeats.length > 0 && interiorTemplates.length === 0) {
    warn(
      'iva-seat-no-interior',
      `This Part has ${part.ivaSeats.length} IVA seat${part.ivaSeats.length === 1 ? '' : 's'} ` +
        `but no interior geometry. KSA culls back faces unconditionally, so from the seat the ` +
        `hull is simply not there and you look straight out at space. Place interior meshes ` +
        `and mark them “Interior (IVA only)”.`,
    )
  }

  if (interiorTemplates.length > 0 && part.ivaSeats.length === 0) {
    warn(
      'iva-interior-no-seat',
      `This Part has interior geometry (${interiorTemplates.length} template` +
        `${interiorTemplates.length === 1 ? '' : 's'} marked “Interior (IVA only)”) but no IVA ` +
        `seat. <Internal> hides it outside IVA, and with no seat the IVA camera mode is never ` +
        `offered — so it is invisible in EVERY camera mode, unless another part in the vehicle ` +
        `supplies a seat.`,
    )
  }

  for (const id of interiorTemplates) {
    if (!isGlassTemplate(part, id)) continue
    warn(
      'iva-interior-on-glass',
      `“${id}” is marked “Interior (IVA only)” but exports through <PartModelGlass>, which has ` +
        `no <Internal> field — KSA silently ignores the flag and the mesh renders in every ` +
        `camera mode.`,
    )
  }

  return issues
}

/** True when any issue would stop the export. */
export function hasBlockingIvaSeatIssue(issues: readonly IvaSeatIssue[]): boolean {
  return issues.some((i) => i.severity === 'block')
}
