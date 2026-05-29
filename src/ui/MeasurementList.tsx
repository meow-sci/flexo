import { useStore } from '@nanostores/react'
import { GridList, GridListItem, type Selection } from 'react-aria-components'
import { Lock, Unlock, Trash2 } from 'lucide-react'
import { Button } from './kit'
import {
  $activeMeasurementId,
  $measurements,
  $measurementSettings,
  removeMeasurement,
  setActiveMeasurement,
  setMeasurementLocked,
} from '../state/measurementStore'
import { distance } from '../measure/bounds'
import { formatLength } from '../measure/format'

/**
 * List of placed line measurements (reference + point-to-point). Selecting a row
 * makes it the active measurement (opening the editor); per-row lock and delete.
 * Mirrors {@link PlacementList}'s react-aria GridList pattern.
 */
export function MeasurementList() {
  const measurements = useStore($measurements)
  const activeId = useStore($activeMeasurementId)
  const { unit } = useStore($measurementSettings)

  if (measurements.length === 0) {
    return <p className="px-1 py-2 text-xs text-fg-subtle">No measurements placed.</p>
  }

  const onSelectionChange = (keys: Selection) => {
    if (keys === 'all') return
    setActiveMeasurement(([...keys][0] as string) ?? null)
  }

  return (
    <GridList
      aria-label="Measurements"
      selectionMode="single"
      selectedKeys={activeId ? [activeId] : []}
      onSelectionChange={onSelectionChange}
      items={measurements}
      className="flex flex-col gap-0.5"
    >
      {(m) => (
        <GridListItem
          id={m.id}
          textValue={`${m.source} ${formatLength(distance(m.a, m.b), unit)}`}
          className="group flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none selected:bg-cladd-primary/15 hover:bg-white/[0.06]"
        >
          <span
            className="size-3 shrink-0 rounded-full border border-black/30"
            style={{ background: m.color }}
          />
          <span className="flex-1 truncate font-mono text-xs">
            {formatLength(distance(m.a, m.b), unit)}
          </span>
          <span className="text-[10px] uppercase text-fg-subtle">
            {m.source === 'point' ? 'pt' : 'ref'}
          </span>
          <Button
            size="sm"
            aria-label={m.locked ? 'Unlock' : 'Lock'}
            onPress={() => setMeasurementLocked(m.id, !m.locked)}
          >
            {m.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </Button>
          <Button size="sm" variant="danger" aria-label="Delete" onPress={() => removeMeasurement(m.id)}>
            <Trash2 size={13} />
          </Button>
        </GridListItem>
      )}
    </GridList>
  )
}
