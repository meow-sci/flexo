import { useStore } from '@nanostores/react'
import { GridList, GridListItem, type Selection } from 'react-aria-components'
import { Lock, Unlock, Trash2, Square, Cylinder, Circle } from 'lucide-react'
import { Button } from './kit'
import {
  $activeContainerId,
  $containers,
  removeContainer,
  setActiveContainer,
  setContainerLocked,
  type ReferenceShape,
} from '../state/containerStore'

const SHAPE_ICON: Record<ReferenceShape, typeof Square> = {
  rect: Square,
  cylinder: Cylinder,
  sphere: Circle,
}

const SHAPE_LABEL: Record<ReferenceShape, string> = {
  rect: 'Box',
  cylinder: 'Cylinder',
  sphere: 'Sphere',
}

/**
 * List of placed reference containers. Selecting a row makes it active (opening
 * the editor); per-row lock and delete. Mirrors {@link MeasurementList}.
 */
export function ContainerList() {
  const containers = useStore($containers)
  const activeId = useStore($activeContainerId)

  if (containers.length === 0) {
    return <p className="px-1 py-2 text-xs text-fg-subtle">No containers placed.</p>
  }

  const onSelectionChange = (keys: Selection) => {
    if (keys === 'all') return
    setActiveContainer(([...keys][0] as string) ?? null)
  }

  return (
    <GridList
      aria-label="Containers"
      selectionMode="single"
      selectedKeys={activeId ? [activeId] : []}
      onSelectionChange={onSelectionChange}
      items={containers}
      className="flex flex-col gap-0.5"
    >
      {(c) => {
        const Icon = SHAPE_ICON[c.shape]
        return (
          <GridListItem
            id={c.id}
            textValue={SHAPE_LABEL[c.shape]}
            className="group flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none selected:bg-cladd-primary/15 hover:bg-white/[0.06]"
          >
            <span
              className="size-3 shrink-0 rounded-full border border-black/30"
              style={{ background: c.color }}
            />
            <Icon size={14} className="shrink-0 text-fg-subtle" />
            <span className="flex-1 truncate text-xs">{SHAPE_LABEL[c.shape]}</span>
            {c.warnEnabled && (
              <span className="text-[10px] uppercase text-fg-subtle">warn</span>
            )}
            <Button
              size="sm"
              aria-label={c.locked ? 'Unlock' : 'Lock'}
              onPress={() => setContainerLocked(c.id, !c.locked)}
            >
              {c.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </Button>
            <Button
              size="sm"
              variant="danger"
              aria-label="Delete"
              onPress={() => removeContainer(c.id)}
            >
              <Trash2 size={13} />
            </Button>
          </GridListItem>
        )
      }}
    </GridList>
  )
}
