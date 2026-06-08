import { useStore } from '@nanostores/react'
import { Euler, Quaternion, MathUtils } from 'three'
import { Button, ToggleButton, ToggleButtonGroup, SectionTitle, Switch } from './kit'
import { FloatingEditorPanel } from './FloatingEditorPanel'
import { PreciseNumberInput } from './PreciseNumberInput'
import { SliderRow } from './SliderRow'
import { Vec3Field } from './Vec3Field'
import { ColorAlphaField } from './ColorAlphaField'
import {
  $activeContainerId,
  $containerGizmoMode,
  $containers,
  normalizeSize,
  removeContainer,
  setActiveContainer,
  setContainerGizmoMode,
  setContainerLocked,
  updateContainer,
  type ContainerGizmoMode,
  type ReferenceContainer,
} from '../state/containerStore'
import { pushUndo } from '../state/editorStore'
import type { Vec3 } from '../ksa/types'

const SHAPE_LABEL: Record<ReferenceContainer['shape'], string> = {
  rect: 'Box container',
  cylinder: 'Cylinder container',
  sphere: 'Sphere container',
}

const MODES: { id: ContainerGizmoMode; label: string }[] = [
  { id: 'translate', label: 'Move' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'scale', label: 'Scale' },
]

function quatToEulerDeg(q: [number, number, number, number]): Vec3 {
  const e = new Euler().setFromQuaternion(new Quaternion(q[0], q[1], q[2], q[3]), 'XYZ')
  return { x: MathUtils.radToDeg(e.x), y: MathUtils.radToDeg(e.y), z: MathUtils.radToDeg(e.z) }
}

function eulerDegToQuat(deg: Vec3): [number, number, number, number] {
  const e = new Euler(
    MathUtils.degToRad(deg.x),
    MathUtils.degToRad(deg.y),
    MathUtils.degToRad(deg.z),
    'XYZ',
  )
  const q = new Quaternion().setFromEuler(e)
  return [q.x, q.y, q.z, q.w]
}

/**
 * Floating editor for the active reference container. Unlocked: gizmo-mode toggle,
 * center / dimension / rotation inputs, line + warning styling. Locked: the same
 * data read-only. Closing leaves the container placed (re-open from the list).
 */
export function ContainerEditor() {
  const activeId = useStore($activeContainerId)
  const containers = useStore($containers)
  const mode = useStore($containerGizmoMode)

  const c = activeId ? containers.find((x) => x.id === activeId) : undefined
  if (!c) return null

  const setSize = (next: Vec3) => updateContainer(c.id, { size: normalizeSize(c.shape, next) })
  const euler = quatToEulerDeg(c.rotation)
  const setEuler = (axis: keyof Vec3, val: number) =>
    updateContainer(c.id, { rotation: eulerDegToQuat({ ...euler, [axis]: val }) })

  const pushCenter = () => pushUndo('container center')
  const pushSize = () => pushUndo('container size')
  const pushRotation = () => pushUndo('container rotation')
  const pushStyle = () => pushUndo('container style')

  return (
    <FloatingEditorPanel
      title={SHAPE_LABEL[c.shape]}
      width="w-64"
      locked={c.locked}
      onToggleLock={() => setContainerLocked(c.id, !c.locked)}
      onClose={() => setActiveContainer(null)}
    >
      {c.locked ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
          <dt className="text-fg-muted">Center</dt>
          <dd className="text-right">{fmt(c.center)}</dd>
          <dt className="text-fg-muted">Size</dt>
          <dd className="text-right">{fmt(c.size)}</dd>
        </dl>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <SectionTitle>Gizmo</SectionTitle>
            <ToggleButtonGroup
              className="w-auto"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[mode]}
              onSelectionChange={(keys) => {
                const next = [...keys][0] as ContainerGizmoMode | undefined
                if (next) setContainerGizmoMode(next)
              }}
            >
              {MODES.map((m) => (
                <ToggleButton key={m.id} id={m.id} size="sm" className="flex-1">
                  {m.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>

          <Vec3Field
            label="Center"
            value={c.center}
            onInteractionStart={pushCenter}
            onCommit={(axis, val) =>
              updateContainer(c.id, { center: { ...c.center, [axis]: val } })
            }
          />

          <Dimensions container={c} onSize={setSize} onInteractionStart={pushSize} />

          {c.shape !== 'rect' && (
            <SliderRow
              label="Lines"
              ariaLabel="Surface lines"
              value={c.segments ?? 16}
              min={2}
              max={48}
              onChange={(v) => updateContainer(c.id, { segments: v })}
              onInteractionStart={pushStyle}
            />
          )}

          <div className="flex flex-col gap-1">
            <SectionTitle>Rotation°</SectionTitle>
            <Vec3Field
              value={euler}
              onInteractionStart={pushRotation}
              onCommit={(axis, val) => setEuler(axis, val)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle>Outline</SectionTitle>
            <ColorAlphaField
              label="Color"
              color={c.color}
              opacity={c.lineOpacity}
              onInteractionStart={pushStyle}
              onChange={({ color, opacity }) =>
                updateContainer(c.id, { color, lineOpacity: opacity })
              }
            />
            <SliderRow
              label="Width"
              ariaLabel="Line width"
              value={c.lineWidth}
              min={1}
              max={10}
              onChange={(v) => updateContainer(c.id, { lineWidth: v })}
              onInteractionStart={pushStyle}
              format={(v) => `${v}px`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle>Containment warning</SectionTitle>
            <Switch
              isSelected={c.warnEnabled}
              onChange={(warnEnabled) => {
                pushUndo('container warning')
                updateContainer(c.id, { warnEnabled })
              }}
            >
              Detect out of bounds
            </Switch>
            {c.warnEnabled && (
              <ColorAlphaField
                label="Warn"
                color={c.warnColor}
                opacity={c.warnOpacity}
                onInteractionStart={pushStyle}
                onChange={({ color, opacity }) =>
                  updateContainer(c.id, { warnColor: color, warnOpacity: opacity })
                }
              />
            )}
          </div>

          <Button size="sm" variant="danger" className="mt-1" onPress={() => removeContainer(c.id)}>
            Delete
          </Button>
        </div>
      )}
    </FloatingEditorPanel>
  )
}

/** Per-shape dimension inputs, written back through size (with shape constraints). */
function Dimensions({
  container: c,
  onSize,
  onInteractionStart,
}: {
  container: ReferenceContainer
  onSize: (size: Vec3) => void
  onInteractionStart?: () => void
}) {
  if (c.shape === 'rect') {
    return (
      <div className="flex flex-col gap-1">
        <SectionTitle>Size (m)</SectionTitle>
        <Vec3Field
          value={c.size}
          onInteractionStart={onInteractionStart}
          onCommit={(axis, val) => onSize({ ...c.size, [axis]: Math.max(0, val) })}
        />
      </div>
    )
  }
  const radius = c.size.x / 2
  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>Size (m)</SectionTitle>
      <div className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-xs text-fg-muted">Radius</span>
        <PreciseNumberInput
          aria-label="Radius"
          className="min-w-0 flex-1"
          min={0}
          value={radius}
          onInteractionStart={onInteractionStart}
          onCommit={(r) =>
            onSize({ x: r * 2, y: c.shape === 'sphere' ? r * 2 : c.size.y, z: r * 2 })
          }
        />
      </div>
      {c.shape === 'cylinder' && (
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-xs text-fg-muted">Height</span>
          <PreciseNumberInput
            aria-label="Height"
            className="min-w-0 flex-1"
            min={0}
            value={c.size.y}
            onInteractionStart={onInteractionStart}
            onCommit={(h) => onSize({ ...c.size, y: Math.max(0, h) })}
          />
        </div>
      )}
    </div>
  )
}

function fmt(v: Vec3): string {
  const n = (x: number) => x.toFixed(2)
  return `${n(v.x)}, ${n(v.y)}, ${n(v.z)}`
}
