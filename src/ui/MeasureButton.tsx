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
  ToggleButton,
  ToggleButtonGroup,
  SectionTitle,
  MenuTrigger,
  Menu,
  MenuItem,
} from './kit'
import {
  $measureTool,
  $measurementSettings,
  addReferenceLine,
  setMeasureTool,
  setMeasurementSettings,
  type BoundsMode,
  type MeasurementUnit,
} from '../state/measurementStore'
import {
  $containerSettings,
  addContainer,
  setContainerSettings,
  type ReferenceShape,
  type WarnPrecision,
} from '../state/containerStore'
import { MeasurementList } from './MeasurementList'
import { ContainerList } from './ContainerList'

const SHAPES: { id: ReferenceShape; label: string }[] = [
  { id: 'rect', label: 'Box' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'sphere', label: 'Sphere' },
]

const WARN_PRECISION: { id: WarnPrecision; label: string }[] = [
  { id: 'bbox', label: 'Fast' },
  { id: 'vertex', label: 'Accurate' },
]

const UNITS: { id: MeasurementUnit; label: string }[] = [
  { id: 'm', label: 'Meters (m)' },
  { id: 'cm', label: 'Centimeters (cm)' },
  { id: 'mm', label: 'Millimeters (mm)' },
]

const BOUNDS_MODES: { id: BoundsMode; label: string }[] = [
  { id: 'world', label: 'World' },
  { id: 'oriented', label: 'Oriented' },
]

function MeasureContent() {
  const settings = useStore($measurementSettings)
  const tool = useStore($measureTool)
  const containerSettings = useStore($containerSettings)

  return (
    <>
      <section className="flex flex-col gap-2">
        <SectionTitle>Selection bounds</SectionTitle>
        <Checkbox
          isSelected={settings.showSelectionBounds}
          onChange={(showSelectionBounds) => setMeasurementSettings({ showSelectionBounds })}
        >
          Show bounding box
        </Checkbox>
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-fg-muted">Orientation</span>
          <ToggleButtonGroup
            className="w-auto"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[settings.boundsMode]}
            onSelectionChange={(keys) => {
              const next = [...keys][0]
              if (next) setMeasurementSettings({ boundsMode: next as BoundsMode })
            }}
          >
            {BOUNDS_MODES.map((m) => (
              <ToggleButton key={m.id} id={m.id} size="sm">
                {m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
        <Checkbox
          isSelected={settings.showPerMesh}
          onChange={(showPerMesh) => setMeasurementSettings({ showPerMesh })}
        >
          Per-mesh dimensions
        </Checkbox>
        <Checkbox
          isSelected={settings.showMeshDistance}
          onChange={(showMeshDistance) => setMeasurementSettings({ showMeshDistance })}
        >
          Distance between two meshes
        </Checkbox>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Tools</SectionTitle>
        <Button size="sm" onPress={() => addReferenceLine()}>
          Add reference line
        </Button>
        <Button
          size="sm"
          variant={tool === 'point' ? 'primary' : undefined}
          onPress={() => setMeasureTool(tool === 'point' ? 'none' : 'point')}
        >
          {tool === 'point' ? 'Point-to-point: click 2 points…' : 'Point-to-point'}
        </Button>
      </section>

      <section className="flex flex-col gap-1">
        <SectionTitle>Measurements</SectionTitle>
        <MeasurementList />
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Reference containers</SectionTitle>
        <MenuTrigger>
          <Button size="sm">Add container…</Button>
          <Popover placement="bottom start" className="w-40">
            <Menu onAction={(key) => addContainer(key as ReferenceShape)}>
              {SHAPES.map((s) => (
                <MenuItem key={s.id} id={s.id}>
                  {s.label}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
        <ContainerList />
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-sm text-fg-muted">Warn check</span>
          <ToggleButtonGroup
            className="w-auto"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[containerSettings.warnPrecision]}
            onSelectionChange={(keys) => {
              const next = [...keys][0]
              if (next) setContainerSettings({ warnPrecision: next as WarnPrecision })
            }}
          >
            {WARN_PRECISION.map((p) => (
              <ToggleButton key={p.id} id={p.id} size="sm">
                {p.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Units</SectionTitle>
        <Select
          size="sm"
          aria-label="Display unit"
          selectedKey={settings.unit}
          items={UNITS}
          onSelectionChange={(k) => setMeasurementSettings({ unit: k as MeasurementUnit })}
        >
          {(u) => (
            <ListBoxItem id={u.id} textValue={u.label}>
              {u.label}
            </ListBoxItem>
          )}
        </Select>
      </section>
    </>
  )
}

interface MeasureButtonProps {
  isOpen?: boolean
  onOpenChange?: (v: boolean) => void
}

/**
 * "Measure" action: selection bounds, tools, and unit controls.
 * Desktop: opens as a positioned popover. Mobile menu: opens as a bottom sheet.
 */
export function MeasureButton({ isOpen: externalOpen, onOpenChange }: MeasureButtonProps = {}) {
  const isControlled = externalOpen !== undefined

  if (isControlled) {
    return (
      <Modal isOpen={externalOpen!} onOpenChange={onOpenChange} isDismissable variant="sheet">
        <Dialog>
          <DialogHeader title="Measure" onClose={() => onOpenChange?.(false)} />
          <div className="flex flex-col gap-4 overflow-auto p-3">
            <MeasureContent />
          </div>
        </Dialog>
      </Modal>
    )
  }

  return (
    <DialogTrigger>
      <ToolbarButton>Measure</ToolbarButton>
      <Popover placement="bottom" className="w-[min(22rem,calc(100vw-1.5rem))]">
        <PopoverDialog className="flex max-h-[80vh] flex-col gap-4 overflow-auto p-3">
          <MeasureContent />
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  )
}
