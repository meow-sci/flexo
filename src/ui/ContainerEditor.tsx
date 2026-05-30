import { useStore } from '@nanostores/react'
import { Euler, Quaternion, MathUtils } from 'three'
import { Lock, Unlock, X } from 'lucide-react'
import {
  Button,
  ToggleButton,
  ToggleButtonGroup,
  SectionTitle,
  Switch,
  Slider,
  useIsPhone,
} from './kit'
import { PreciseNumberInput } from './PreciseNumberInput'
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
  const isPhone = useIsPhone()

  const c = activeId ? containers.find((x) => x.id === activeId) : undefined
  if (!c) return null

  const containerClass = isPhone
    ? 'absolute inset-x-2 bottom-20 z-10 rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md'
    : 'absolute left-3 top-1/2 z-10 w-64 -translate-y-1/2 rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md'

  const setSize = (next: Vec3) => updateContainer(c.id, { size: normalizeSize(c.shape, next) })
  const euler = quatToEulerDeg(c.rotation)
  const setEuler = (axis: keyof Vec3, val: number) =>
    updateContainer(c.id, { rotation: eulerDegToQuat({ ...euler, [axis]: val }) })

  return (
    <div className={containerClass}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
          {SHAPE_LABEL[c.shape]}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            aria-label={c.locked ? 'Unlock' : 'Lock'}
            onPress={() => setContainerLocked(c.id, !c.locked)}
          >
            {c.locked ? <Lock size={14} /> : <Unlock size={14} />}
          </Button>
          <Button size="sm" aria-label="Close" onPress={() => setActiveContainer(null)}>
            <X size={14} />
          </Button>
        </div>
      </div>

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

          <VecRow
            label="Center"
            v={c.center}
            onCommit={(axis, val) => updateContainer(c.id, { center: { ...c.center, [axis]: val } })}
          />

          <Dimensions container={c} onSize={setSize} />

          {c.shape !== 'rect' && (
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-fg-muted">Lines</span>
              <Slider
                aria-label="Surface lines"
                className="flex-1"
                minValue={2}
                maxValue={48}
                step={1}
                value={c.segments ?? 16}
                onChange={(v) => updateContainer(c.id, { segments: v as number })}
              />
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
                {c.segments ?? 16}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <SectionTitle>Rotation°</SectionTitle>
            <VecRow label="" v={euler} onCommit={(axis, val) => setEuler(axis, val)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle>Outline</SectionTitle>
            <ColorAlphaField
              label="Color"
              color={c.color}
              opacity={c.lineOpacity}
              onChange={({ color, opacity }) => updateContainer(c.id, { color, lineOpacity: opacity })}
            />
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-fg-muted">Width</span>
              <Slider
                aria-label="Line width"
                className="flex-1"
                minValue={1}
                maxValue={10}
                step={1}
                value={c.lineWidth}
                onChange={(v) => updateContainer(c.id, { lineWidth: v as number })}
              />
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
                {c.lineWidth}px
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle>Containment warning</SectionTitle>
            <Switch
              isSelected={c.warnEnabled}
              onChange={(warnEnabled) => updateContainer(c.id, { warnEnabled })}
            >
              Highlight meshes outside bounds
            </Switch>
            {c.warnEnabled && (
              <ColorAlphaField
                label="Warn"
                color={c.warnColor}
                opacity={c.warnOpacity}
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
    </div>
  )
}

/** Per-shape dimension inputs, written back through size (with shape constraints). */
function Dimensions({
  container: c,
  onSize,
}: {
  container: ReferenceContainer
  onSize: (size: Vec3) => void
}) {
  if (c.shape === 'rect') {
    return (
      <div className="flex flex-col gap-1">
        <SectionTitle>Size (m)</SectionTitle>
        <VecRow
          label=""
          v={c.size}
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
          onCommit={(r) => onSize({ x: r * 2, y: c.shape === 'sphere' ? r * 2 : c.size.y, z: r * 2 })}
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
            onCommit={(h) => onSize({ ...c.size, y: Math.max(0, h) })}
          />
        </div>
      )}
    </div>
  )
}

function VecRow({
  label,
  v,
  onCommit,
}: {
  label: string
  v: Vec3
  onCommit: (axis: keyof Vec3, value: number) => void
}) {
  const axes: (keyof Vec3)[] = ['x', 'y', 'z']
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="w-12 shrink-0 text-xs text-fg-muted">{label}</span>}
      {axes.map((axis) => (
        <PreciseNumberInput
          key={axis}
          aria-label={`${label} ${axis.toUpperCase()}`}
          className="min-w-0 flex-1"
          value={v[axis]}
          onCommit={(val) => onCommit(axis, val)}
        />
      ))}
    </div>
  )
}

function fmt(v: Vec3): string {
  const n = (x: number) => x.toFixed(2)
  return `${n(v.x)}, ${n(v.y)}, ${n(v.z)}`
}
