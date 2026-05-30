import { useStore } from '@nanostores/react'
import { Lock, Unlock, X } from 'lucide-react'
import { Button, ToggleButton, ToggleButtonGroup, SectionTitle, Slider, useIsPhone } from './kit'
import { PreciseNumberInput } from './PreciseNumberInput'
import { ColorAlphaField } from './ColorAlphaField'
import {
  $activeEndpoint,
  $activeMeasurementId,
  $measurements,
  $measurementSettings,
  removeMeasurement,
  setActiveEndpoint,
  setActiveMeasurement,
  setMeasurementLocked,
  snappedToAxis,
  updateMeasurement,
  type AxisLock,
  type LineMeasurement,
} from '../state/measurementStore'
import { distance } from '../measure/bounds'
import { formatLength } from '../measure/format'
import type { Vec3 } from '../ksa/types'

const AXES: { id: AxisLock; label: string }[] = [
  { id: 'none', label: 'Free' },
  { id: 'x', label: 'X' },
  { id: 'y', label: 'Y' },
  { id: 'z', label: 'Z' },
]

/** Sets endpoint b so the segment keeps its direction but has the given length. */
function withLength(m: LineMeasurement, length: number): Vec3 {
  const dir =
    m.axisLock === 'none'
      ? unit({ x: m.b.x - m.a.x, y: m.b.y - m.a.y, z: m.b.z - m.a.z })
      : axisDir(m)
  return { x: m.a.x + dir.x * length, y: m.a.y + dir.y * length, z: m.a.z + dir.z * length }
}

function unit(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z)
  return len < 1e-9 ? { x: 1, y: 0, z: 0 } : { x: v.x / len, y: v.y / len, z: v.z / len }
}

/** Unit vector along the locked axis, preserving the current sign of b−a. */
function axisDir(m: LineMeasurement): Vec3 {
  const sign = (d: number) => (d < 0 ? -1 : 1)
  if (m.axisLock === 'x') return { x: sign(m.b.x - m.a.x), y: 0, z: 0 }
  if (m.axisLock === 'y') return { x: 0, y: sign(m.b.y - m.a.y), z: 0 }
  return { x: 0, y: 0, z: sign(m.b.z - m.a.z) }
}

/**
 * Floating editor for the active line measurement. Unlocked: numeric endpoints,
 * length, axis-lock, color, and an A/B toggle that drives the 3D gizmo. Locked:
 * the same data shown read-only (no inputs, no gizmo — driven by the layer).
 */
export function MeasurementEditor() {
  const activeId = useStore($activeMeasurementId)
  const measurements = useStore($measurements)
  const endpoint = useStore($activeEndpoint)
  const { unit: displayUnit } = useStore($measurementSettings)
  const isPhone = useIsPhone()

  const m = activeId ? measurements.find((x) => x.id === activeId) : undefined
  if (!m) return null

  // Desktop: floating card on the left. Phone: full-width sheet pinned to the
  // bottom (above the mobile inspector FAB).
  const containerClass = isPhone
    ? 'absolute inset-x-2 bottom-20 z-10 rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md'
    : 'absolute left-3 top-1/2 z-10 w-60 -translate-y-1/2 rounded-xl border border-border bg-panel/95 p-3 text-fg shadow-popover backdrop-blur-md'

  const length = distance(m.a, m.b)
  const setEndpoint = (key: 'a' | 'b', axis: keyof Vec3, value: number) => {
    const next: Vec3 = { ...m[key], [axis]: value }
    if (key === 'a') {
      updateMeasurement(m.id, { a: m.axisLock === 'none' ? next : snappedToAxis(m.b, next, m.axisLock) })
    } else {
      updateMeasurement(m.id, { b: m.axisLock === 'none' ? next : snappedToAxis(m.a, next, m.axisLock) })
    }
  }

  return (
    <div className={containerClass}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle">
          {m.source === 'point' ? 'Point measurement' : 'Reference line'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            aria-label={m.locked ? 'Unlock' : 'Lock'}
            onPress={() => setMeasurementLocked(m.id, !m.locked)}
          >
            {m.locked ? <Lock size={14} /> : <Unlock size={14} />}
          </Button>
          <Button size="sm" aria-label="Close" onPress={() => setActiveMeasurement(null)}>
            <X size={14} />
          </Button>
        </div>
      </div>

      {m.locked ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
          <dt className="text-fg-muted">Length</dt>
          <dd className="text-right">{formatLength(length, displayUnit)}</dd>
          <dt className="text-fg-muted">Axis</dt>
          <dd className="text-right uppercase">{m.axisLock}</dd>
        </dl>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <SectionTitle>Edit endpoint</SectionTitle>
            <ToggleButtonGroup
              className="w-auto"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[endpoint]}
              onSelectionChange={(keys) => {
                const next = [...keys][0]
                if (next) setActiveEndpoint(next as 'a' | 'b')
              }}
            >
              <ToggleButton id="a" size="sm" className="flex-1">A</ToggleButton>
              <ToggleButton id="b" size="sm" className="flex-1">B</ToggleButton>
            </ToggleButtonGroup>
          </div>

          <VecRow label="A" v={m.a} onCommit={(axis, val) => setEndpoint('a', axis, val)} />
          <VecRow
            label="B"
            v={m.b}
            disabled={
              m.axisLock === 'none'
                ? undefined
                : { x: m.axisLock !== 'x', y: m.axisLock !== 'y', z: m.axisLock !== 'z' }
            }
            onCommit={(axis, val) => setEndpoint('b', axis, val)}
          />

          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-fg-muted">Length</span>
            <PreciseNumberInput
              aria-label="Length (m)"
              className="flex-1"
              min={0}
              value={length}
              onCommit={(len) => updateMeasurement(m.id, { b: withLength(m, len) })}
            />
            <span className="text-xs text-fg-subtle">m</span>
          </div>

          <div className="flex flex-col gap-1">
            <SectionTitle>Axis lock</SectionTitle>
            <ToggleButtonGroup
              className="w-auto"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[m.axisLock]}
              onSelectionChange={(keys) => {
                const next = [...keys][0] as AxisLock | undefined
                if (!next) return
                const b = next === 'none' ? m.b : snappedToAxis(m.a, m.b, next)
                updateMeasurement(m.id, { axisLock: next, b })
              }}
            >
              {AXES.map((a) => (
                <ToggleButton key={a.id} id={a.id} size="sm" className="flex-1">
                  {a.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle>Line</SectionTitle>
            <ColorAlphaField
              label="Color"
              color={m.color}
              opacity={m.lineOpacity ?? 0.5}
              onChange={({ color, opacity }) => updateMeasurement(m.id, { color, lineOpacity: opacity })}
            />
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-fg-muted">Width</span>
              <Slider
                aria-label="Line width"
                className="flex-1"
                minValue={1}
                maxValue={10}
                step={1}
                value={m.lineWidth ?? 2}
                onChange={(v) => updateMeasurement(m.id, { lineWidth: v as number })}
              />
              <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-subtle">
                {m.lineWidth ?? 2}px
              </span>
            </div>
          </div>

          <Button
            size="sm"
            variant="danger"
            className="mt-1"
            onPress={() => removeMeasurement(m.id)}
          >
            Delete
          </Button>
        </div>
      )}
    </div>
  )
}

function VecRow({
  label,
  v,
  disabled,
  onCommit,
}: {
  label: string
  v: Vec3
  disabled?: { x: boolean; y: boolean; z: boolean }
  onCommit: (axis: keyof Vec3, value: number) => void
}) {
  const axes: (keyof Vec3)[] = ['x', 'y', 'z']
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 shrink-0 text-xs font-medium text-fg-muted">{label}</span>
      {axes.map((axis) => (
        <PreciseNumberInput
          key={axis}
          aria-label={`${label} ${axis.toUpperCase()}`}
          className="min-w-0 flex-1"
          value={v[axis]}
          isDisabled={disabled?.[axis]}
          onCommit={(val) => onCommit(axis, val)}
        />
      ))}
    </div>
  )
}
