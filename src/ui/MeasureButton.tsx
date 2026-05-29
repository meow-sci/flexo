import { useStore } from '@nanostores/react'
import {
  DialogTrigger,
  Popover,
  PopoverDialog,
  ToolbarButton,
  Button,
  Checkbox,
  Select,
  ListBoxItem,
  ToggleButton,
  ToggleButtonGroup,
  SectionTitle,
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
import { MeasurementList } from './MeasurementList'

const UNITS: { id: MeasurementUnit; label: string }[] = [
  { id: 'm', label: 'Meters (m)' },
  { id: 'cm', label: 'Centimeters (cm)' },
  { id: 'mm', label: 'Millimeters (mm)' },
]

const BOUNDS_MODES: { id: BoundsMode; label: string }[] = [
  { id: 'world', label: 'World' },
  { id: 'oriented', label: 'Oriented' },
]

/**
 * "Measure" action: a popover controlling the live selection bounding box (show /
 * orientation), the display unit, and per-mesh dimensions. All drive the three.js
 * {@link MeasurementLayer} via {@link measurementStore}.
 */
export function MeasureButton() {
  const settings = useStore($measurementSettings)
  const tool = useStore($measureTool)

  return (
    <DialogTrigger>
      <ToolbarButton>Measure</ToolbarButton>
      <Popover placement="bottom" className="w-[min(22rem,calc(100vw-1.5rem))]">
        <PopoverDialog className="flex max-h-[80vh] flex-col gap-4 overflow-auto p-3">
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
        </PopoverDialog>
      </Popover>
    </DialogTrigger>
  )
}
