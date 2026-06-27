import { atom, computed } from 'nanostores'
import type { SubPartGameData } from '../ksa/types'
import { $part } from './editorStore'
import { setInspectorMode } from './uiStore'

/**
 * Ephemeral editor state for the Engine Designer — the full-sidebar `$inspectorMode
 * === 'engine'` mode (mirrors animationStore's ephemeral atoms). NONE of this is in
 * `$part`/undo: it is sub-selection, like which engine is open and whether the 3D
 * exhaust gizmo is showing. The engine data itself (combustors/nozzles/rockets/…)
 * lives on `$part` and is mutated through editorStore's discrete/streaming actions.
 *
 * An "engine" here is keyed by the SubPart template that carries its thrust chamber
 * (the reusable Combustor + DeLavalNozzle + Rocket). The panel edits that template's
 * first combustor/nozzle/rocket and the part-level controller/gimbal that wire it.
 */

/** The thrust-chamber SubPart template currently open in the designer, or null. */
export const $activeEngineTemplateId = atom<string | null>(null)

/** Which placement instance the designer's wiring (controller ref) + 3D handle target; null = auto (first). */
export const $activeEngineInstanceId = atom<string | null>(null)

/** Whether the 3D exhaust-location gizmo is active for the open engine's nozzle. */
export const $engineExhaustGizmo = atom<boolean>(false)

/** SubPart templates that carry at least one combustor — i.e. the part's engines. */
export const $engineTemplateIds = computed([$part], (part) =>
  part.subPartGameData.filter((s) => s.combustors.length > 0).map((s) => s.subPartTemplateId),
)

/** The active engine's SubPartGameData entry (its combustors/nozzles/rockets), or null. */
export const $activeEngineData = computed(
  [$part, $activeEngineTemplateId],
  (part, id): SubPartGameData | null =>
    id ? (part.subPartGameData.find((s) => s.subPartTemplateId === id) ?? null) : null,
)

/**
 * The placement instance the designer is wiring/handling: the explicit
 * {@link $activeEngineInstanceId} if it still exists, else the first placement of the
 * active template (the natural anchor for the 3D exhaust handle), else null.
 */
export const $resolvedEngineInstanceId = computed(
  [$part, $activeEngineTemplateId, $activeEngineInstanceId],
  (part, templateId, explicit) => {
    if (!templateId) return null
    if (explicit && part.placements.some((p) => p.instanceId === explicit)) return explicit
    return part.placements.find((p) => p.subPartTemplateId === templateId)?.instanceId ?? null
  },
)

/** Opens the Engine designer, optionally on a specific thrust-chamber template. */
export function enterEngineMode(templateId?: string | null): void {
  if (templateId !== undefined) {
    $activeEngineTemplateId.set(templateId)
    $activeEngineInstanceId.set(null)
    $engineExhaustGizmo.set(false)
  }
  setInspectorMode('engine')
}

/** Closes the Engine designer, returning to the Assets list. */
export function exitEngineMode(): void {
  $engineExhaustGizmo.set(false)
  setInspectorMode('assets')
}

/** Selects which engine (thrust-chamber template) the designer edits. */
export function setActiveEngineTemplate(id: string | null): void {
  $activeEngineTemplateId.set(id)
  $activeEngineInstanceId.set(null)
  $engineExhaustGizmo.set(false)
}

/** Sets the placement instance the designer wires/handles (null = auto-pick the first). */
export function setActiveEngineInstance(instanceId: string | null): void {
  $activeEngineInstanceId.set(instanceId)
}

/** Toggles the 3D exhaust-location gizmo for the open engine's nozzle. */
export function setEngineExhaustGizmo(on: boolean): void {
  $engineExhaustGizmo.set(on)
}
