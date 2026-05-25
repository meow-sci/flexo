import { useStore } from '@nanostores/react'
import { Button, List, ListButton, ListItem, Surface } from '@cladd-ui/react'
import {
  $part,
  $selectedConnectorIndex,
  $selectedIndex,
  duplicateSelected,
  removeSelected,
  selectConnector,
  selectPlacement,
} from '../state/editorStore'

/**
 * Lists the placed SubPart instances and connectors. Clicking a row selects it
 * (kept in sync with 3D selection via the shared store). Delete / Duplicate act
 * on the current selection, whichever kind it is.
 */
export function PlacementList() {
  const part = useStore($part)
  const selectedSub = useStore($selectedIndex)
  const selectedCon = useStore($selectedConnectorIndex)
  const hasSelection = selectedSub >= 0 || selectedCon >= 0

  return (
    <Surface outline className="flex h-full min-h-0 flex-col rounded-xl" contentClassName="flex min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs uppercase tracking-wide text-cladd-fg-softer">
          Placed ({part.placements.length})
        </span>
        <div className="flex gap-1">
          <Button size="xs" disabled={!hasSelection} onClick={() => duplicateSelected()}>
            Duplicate
          </Button>
          <Button size="xs" color="red" disabled={!hasSelection} onClick={() => removeSelected()}>
            Delete
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <List>
          {part.placements.length === 0 ? (
            <ListItem className="text-cladd-fg-softer">No SubParts placed</ListItem>
          ) : (
            part.placements.map((p, i) => (
              <ListButton
                key={p.instanceId}
                size="sm"
                selected={i === selectedSub}
                color="brand"
                onClick={() => selectPlacement(i)}
                footer={p.subPartTemplateId}
              >
                <span className="truncate">{p.instanceId}</span>
              </ListButton>
            ))
          )}
        </List>

        {part.connectors.length > 0 && (
          <>
            <span className="mt-2 block px-1 text-xs uppercase tracking-wide text-cladd-fg-softer">
              Connectors ({part.connectors.length})
            </span>
            <List>
              {part.connectors.map((c, i) => (
                <ListButton
                  key={c.id}
                  size="sm"
                  selected={i === selectedCon}
                  color="brand"
                  onClick={() => selectConnector(i)}
                  footer={c.flags === 'None' ? 'no flags' : c.flags}
                >
                  <span className="truncate font-mono">{c.id}</span>
                </ListButton>
              ))}
            </List>
          </>
        )}
      </div>
    </Surface>
  )
}
