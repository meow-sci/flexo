import { useStore } from '@nanostores/react'
import {
  DialogTrigger,
  Popover,
  PopoverDialog,
  Modal,
  Dialog,
  DialogHeader,
  ToolbarButton,
  Button,
  Checkbox,
  Select,
  ListBoxItem,
  Slider,
  SectionTitle,
} from './kit'
import { $grids, setGrid, snapCamera, type Axis, type CameraDir } from '../state/viewStore'
import {
  $lighting,
  setLighting,
  ENVIRONMENT_PRESETS,
  TONE_MAPPING_MODES,
  type EnvironmentPreset,
  type ToneMappingMode,
} from '../state/lightingStore'
import { PreciseNumberInput } from './PreciseNumberInput'

const SNAP_ROWS: [CameraDir, CameraDir][] = [
  ['left', 'right'],
  ['front', 'back'],
  ['top', 'bottom'],
]

const GRID_AXES: { axis: Axis; label: string }[] = [
  { axis: 'x', label: 'X' },
  { axis: 'y', label: 'Y' },
  { axis: 'z', label: 'Z' },
]

function ViewContent() {
  const grids = useStore($grids)
  const lighting = useStore($lighting)
  const envHasSky = ENVIRONMENT_PRESETS.find((p) => p.id === lighting.environment)?.file != null

  return (
    <>
      <section className="flex flex-col gap-2">
        <SectionTitle>Camera Snap</SectionTitle>
        {SNAP_ROWS.map(([a, b]) => (
          <div key={a} className="flex gap-1.5">
            <Button size="sm" className="flex-1 capitalize" onPress={() => snapCamera(a)}>
              {a}
            </Button>
            <Button size="sm" className="flex-1 capitalize" onPress={() => snapCamera(b)}>
              {b}
            </Button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Grids</SectionTitle>
        {GRID_AXES.map(({ axis, label }) => {
          const cfg = grids[axis]
          return (
            <div key={axis} className="flex items-center gap-2">
              <Checkbox
                aria-label={`Show ${label} grid`}
                isSelected={cfg.enabled}
                onChange={(enabled) => setGrid(axis, { enabled })}
              />
              <span className="w-4 text-sm text-fg-muted">{label}</span>
              <PreciseNumberInput
                aria-label={`${label} grid spacing (m)`}
                className="flex-1"
                min={0.05}
                value={cfg.spacing}
                onCommit={(spacing) => setGrid(axis, { spacing })}
              />
              <span className="text-xs text-fg-subtle">m</span>
            </div>
          )
        })}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle>Lighting</SectionTitle>
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-fg-muted">Environment</span>
          <Select
            size="sm"
            className="flex-1"
            aria-label="Environment"
            selectedKey={lighting.environment}
            items={ENVIRONMENT_PRESETS}
            onSelectionChange={(k) => setLighting({ environment: k as EnvironmentPreset })}
          >
            {(p) => (
              <ListBoxItem id={p.id} textValue={p.label}>
                {p.label}
              </ListBoxItem>
            )}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-fg-muted">Tone map</span>
          <Select
            size="sm"
            className="flex-1"
            aria-label="Tone mapping"
            selectedKey={lighting.toneMapping}
            items={TONE_MAPPING_MODES}
            onSelectionChange={(k) => setLighting({ toneMapping: k as ToneMappingMode })}
          >
            {(m) => (
              <ListBoxItem id={m.id} textValue={m.label}>
                {m.label}
              </ListBoxItem>
            )}
          </Select>
        </div>

        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-sm text-fg-muted">
            <span>Exposure</span>
            <span className="text-fg-subtle">{lighting.exposure.toFixed(2)}</span>
          </span>
          <Slider
            aria-label="Exposure"
            minValue={0.1}
            maxValue={3}
            step={0.05}
            value={lighting.exposure}
            onChange={(exposure) => setLighting({ exposure: exposure as number })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-sm text-fg-muted">
            <span>Reflections</span>
            <span className="text-fg-subtle">{lighting.environmentIntensity.toFixed(2)}</span>
          </span>
          <Slider
            aria-label="Reflections"
            minValue={0}
            maxValue={3}
            step={0.05}
            value={lighting.environmentIntensity}
            onChange={(v) => setLighting({ environmentIntensity: v as number })}
          />
        </label>

        <Checkbox
          isDisabled={!envHasSky}
          isSelected={envHasSky && lighting.showEnvironmentBackground}
          onChange={(showEnvironmentBackground) => setLighting({ showEnvironmentBackground })}
        >
          Show sky background
        </Checkbox>

        {envHasSky && lighting.showEnvironmentBackground && (
          <label className="flex flex-col gap-1">
            <span className="flex justify-between text-sm text-fg-muted">
              <span>Sky blur</span>
              <span className="text-fg-subtle">{lighting.backgroundBlur.toFixed(2)}</span>
            </span>
            <Slider
              aria-label="Sky blur"
              minValue={0}
              maxValue={1}
              step={0.01}
              value={lighting.backgroundBlur}
              onChange={(v) => setLighting({ backgroundBlur: v as number })}
            />
          </label>
        )}
      </section>
    </>
  )
}

interface ViewButtonProps {
  isOpen?: boolean
  onOpenChange?: (v: boolean) => void
}

/**
 * "View" action: camera snap, reference grids, and lighting controls.
 * Desktop: opens as a positioned popover. Mobile menu: opens as a bottom sheet.
 */
export function ViewButton({ isOpen: externalOpen, onOpenChange }: ViewButtonProps = {}) {
  const isControlled = externalOpen !== undefined

  if (isControlled) {
    return (
      <Modal isOpen={externalOpen!} onOpenChange={onOpenChange} isDismissable variant="sheet">
        <Dialog>
          <DialogHeader title="View" onClose={() => onOpenChange?.(false)} />
          <div className="flex flex-col gap-4 overflow-auto p-3">
            <ViewContent />
          </div>
        </Dialog>
      </Modal>
    )
  }

  return (
    <DialogTrigger>
      <ToolbarButton>View</ToolbarButton>
      <Popover placement="bottom" className="w-[min(24rem,calc(100vw-1.5rem))]">
        <PopoverDialog className="flex max-h-[80vh] flex-col gap-4 overflow-auto p-3">
          <ViewContent />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  )
}
