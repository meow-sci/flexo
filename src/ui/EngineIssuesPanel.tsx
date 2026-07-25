import { useStore } from '@nanostores/react'
import { SectionTitle } from './kit'
import { $allReactionIndex } from '../state/reactionStore'
import { validateEngines } from '../ksa/engineValidation'
import type { EditingPart } from '../ksa/types'

/**
 * Surfaces {@link validateEngines}'s findings inline in the Engine panel, split by what
 * KSA actually does with the mod: a **blocking** issue makes KSA throw at load (the whole
 * mod fails), a **warning** loads but leaves the part misbehaving — nearly always an
 * engine that silently reaches no propellant.
 *
 * Renders nothing when the part is clean, so it stays out of the way while authoring.
 */
export function EngineIssuesPanel({ part }: { part: EditingPart }) {
  const reactions = useStore($allReactionIndex)
  const issues = validateEngines(part, reactions)
  if (issues.length === 0) return null
  const blocking = issues.filter((i) => i.severity === 'block')
  const warnings = issues.filter((i) => i.severity === 'warn')
  return (
    <div className="flex flex-col gap-2">
      {blocking.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionTitle>KSA would refuse to load ({blocking.length})</SectionTitle>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {blocking.map((issue, i) => (
              <li key={i} className="text-[11px] leading-snug text-danger">
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionTitle>Loads, but misbehaves ({warnings.length})</SectionTitle>
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {warnings.map((issue, i) => (
              <li key={i} className="text-[11px] leading-snug text-warning">
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
