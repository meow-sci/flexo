import { ArrowRight } from 'lucide-react';
import { useStore } from '@nanostores/react';
import {
  Button,
  Field,
  ItemCard,
  ListBoxItem,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Select,
  Switch,
  TextField,
  cn,
} from '../../kit';
import { PreciseNumberInput } from '../../PreciseNumberInput';
import { Vec3Field } from '../../Vec3Field';
import { DEG2RAD, RAD2DEG } from '../../format';
import { DataSection } from '../DataSection';
import { useFlashedCard } from '../flashedCard';
import type { SectionMeta } from '../sectionMeta';
import { pushUndo, setCustomMass } from '../../../state/editorStore';
import {
  massDefinitionsFor,
  setMassDefinitionShape,
  updateMassDefinition,
  type MassOwner,
} from '../../../state/massStore';
import { runCommand } from '../../../state/commandStore';
import { $catalogIndex } from '../../../state/catalogStore';
import { $massMaterialDensities } from '../../../state/materialDensityStore';
import { massRemoveCommandId } from '../../commands/dataCommands';
import {
  MASS_SHAPES,
  MASS_SHAPE_DEFS,
  combinedMassSummary,
  resolveMassDefinitionKg,
  sumMassDefinitions,
} from '../../../ksa/massDefinitions';
import type { EditingPart, MassDefinition, MassShape } from '../../../ksa/types';

type MassSource = 'mass' | 'density' | 'material';

/** Mass definitions add together; geometric dimensions determine their rotational inertia. */
export function MassSection({
  part,
  owner,
  meta,
}: {
  part: EditingPart;
  owner: MassOwner;
  meta: SectionMeta;
}) {
  const densities = useStore($massMaterialDensities);
  const catalog = useStore($catalogIndex);
  const definitions = massDefinitionsFor(part, owner, catalog);
  const catalogDefinitions = new Map(
    [...catalog].map(([id, entry]) => [id, entry.data?.gameData?.massDefinitions ?? []]),
  );
  const combined = combinedMassSummary(part, densities, catalogDefinitions);
  const template = owner == null ? null : sumMassDefinitions(definitions, densities);

  return (
    <DataSection
      sectionId="mass"
      count={meta.count}
      issue={meta.issue}
      defaultExpanded={owner == null || meta.count > 0}
      onAdd={() => runCommand('data.massAdd:SolidCuboidMass', { owner })}
    >
      <div className="flex flex-col gap-1 rounded-md border border-border bg-panel-sunken p-2">
        <span className="text-xs font-medium text-fg-muted">
          Combined defined mass:{' '}
          {combined.massKg.toLocaleString(undefined, { maximumFractionDigits: 4 })} kg
          {combined.unresolvedCount > 0 && ' (partial)'}
        </span>
        {combined.unresolvedCount > 0 && (
          <span className="text-xs text-warning">
            {combined.unresolvedCount} mass contribution{combined.unresolvedCount === 1 ? '' : 's'}{' '}
            could not be resolved. Check mass sources and material availability; preserved mass XML
            is not included in this sum.
          </span>
        )}
        {template && (
          <span className="text-xs text-fg-subtle">
            This SubPart definition:{' '}
            {template.massKg.toLocaleString(undefined, { maximumFractionDigits: 4 })} kg
            {template.unresolvedCount > 0 && ' (partial)'}. Each placement contributes separately
            with its scale.
          </span>
        )}
        <span className="text-xs text-fg-subtle">
          Includes Part and placed SubPart mass definitions. Tank walls, solid-motor grains and
          stored propellant are excluded.
        </span>
      </div>
      <span className="text-xs text-fg-subtle">
        Mass definitions add together. Their shape, dimensions and placement determine balance and
        rotational inertia.
      </span>
      {owner == null && part.gameData.customMass != null && <CustomMassFields part={part} />}
      {definitions.map((definition, index) => (
        <MassDefinitionCard
          key={definition.id}
          owner={owner}
          definition={definition}
          index={index}
        />
      ))}
      <MenuTrigger>
        <Button size="sm" className="self-start">
          + Mass definition
        </Button>
        <Popover className="w-64">
          <Menu aria-label="Add mass definition">
            {MASS_SHAPES.map((shape) => (
              <MenuItem
                key={shape}
                id={shape}
                density="dense"
                onAction={() => runCommand(`data.massAdd:${shape}`, { owner })}
              >
                {MASS_SHAPE_DEFS[shape].label}
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      </MenuTrigger>
    </DataSection>
  );
}

/** Existing custom-mass data remains editable without converting its preserved inertia XML. */
function CustomMassFields({ part }: { part: EditingPart }) {
  const g = part.gameData;
  const extras = g.customMassExtras.length;

  return (
    <div className="flex flex-col gap-2">
      <ItemCard
        title="Preserved custom mass"
        onRemove={() => runCommand('data.massRemovePreservedCustom')}
      >
        <Field label="Custom mass (kg)">
          <PreciseNumberInput
            aria-label="Custom mass in kilograms"
            value={g.customMass ?? 0}
            min={0}
            onInteractionStart={() => pushUndo('edit mass', '')}
            onCommit={setCustomMass}
          />
        </Field>
        {extras > 0 && (
          <Button
            size="xs"
            variant="ghost"
            className="self-start"
            onPress={() => runCommand('data.jumpSection:passthrough')}
          >
            <span>Preserved custom inertia / placement ({extras})</span>
            <ArrowRight size={11} />
            <span>Passthrough</span>
          </Button>
        )}
      </ItemCard>
    </div>
  );
}

function sourceOf(definition: MassDefinition): MassSource {
  if (definition.shape === 'CustomMass') return 'mass';
  if (definition.materialId != null) return 'material';
  return definition.densityKgM3 != null ? 'density' : 'mass';
}

function MassDefinitionCard({
  owner,
  definition,
  index,
}: {
  owner: MassOwner;
  definition: MassDefinition;
  index: number;
}) {
  const flashed = useFlashedCard() === definition.id;
  const densities = useStore($massMaterialDensities);
  const shape = MASS_SHAPE_DEFS[definition.shape];
  const resolvedMass = resolveMassDefinitionKg(definition, densities);
  const source = sourceOf(definition);
  const push = () => pushUndo('edit mass definition', shape.label);
  const patch = (values: Partial<Omit<MassDefinition, 'id' | 'shape'>>) =>
    updateMassDefinition(owner, index, values);
  const suppressedSource =
    (source === 'material' && (definition.densityKgM3 != null || definition.massKg != null)) ||
    (source === 'density' && definition.massKg != null);

  return (
    <div className={cn(flashed && 'row-flash rounded-md')}>
      <ItemCard
        title={`${shape.label} ${index + 1}`}
        onRemove={() => runCommand(massRemoveCommandId(owner, definition.id))}
      >
        <Field label="Shape">
          <Select
            size="sm"
            aria-label={`Mass definition ${index + 1} shape`}
            value={definition.shape}
            onChange={(value) => setMassDefinitionShape(owner, index, value as MassShape)}
          >
            {MASS_SHAPES.map((massShape) => (
              <ListBoxItem key={massShape} id={massShape}>
                {MASS_SHAPE_DEFS[massShape].label}
              </ListBoxItem>
            ))}
          </Select>
        </Field>
        {definition.shape !== 'CustomMass' && (
          <Field label="Mass source">
            <Select
              size="sm"
              aria-label={`Mass definition ${index + 1} source`}
              value={source}
              onChange={(value) => {
                pushUndo('mass definition source', String(value));
                patch({
                  massKg: value === 'mass' ? (definition.massKg ?? 1) : null,
                  densityKgM3: value === 'density' ? (definition.densityKgM3 ?? 1000) : null,
                  materialId: value === 'material' ? (definition.materialId ?? '') : null,
                });
              }}
            >
              <ListBoxItem id="mass">Mass</ListBoxItem>
              <ListBoxItem id="density">Density × shape volume</ListBoxItem>
              <ListBoxItem id="material">Material density × shape volume</ListBoxItem>
            </Select>
          </Field>
        )}
        {source === 'mass' && (
          <Field label="Mass (kg)">
            <PreciseNumberInput
              aria-label={`Mass definition ${index + 1} in kilograms`}
              value={definition.massKg ?? 0}
              min={0}
              onInteractionStart={push}
              onCommit={(massKg) => patch({ massKg })}
            />
          </Field>
        )}
        {source === 'density' && (
          <Field label="Density (kg/m³)">
            <PreciseNumberInput
              aria-label={`Mass definition ${index + 1} density in kilograms per cubic meter`}
              value={definition.densityKgM3 ?? 0}
              min={0}
              onInteractionStart={push}
              onCommit={(densityKgM3) => patch({ densityKgM3 })}
            />
          </Field>
        )}
        {source === 'material' && (
          <Field label="Material Id (solid or liquid substance)">
            <TextField
              size="sm"
              aria-label={`Mass definition ${index + 1} material id`}
              inputClassName="font-mono"
              value={definition.materialId ?? ''}
              onFocus={push}
              onChange={(materialId) => patch({ materialId })}
            />
          </Field>
        )}
        {suppressedSource && (
          <span className="text-xs text-fg-subtle">
            Other imported mass sources remain preserved until you change the source. KSA prefers
            material, then positive density, then positive mass.
          </span>
        )}
        {shape.dimensions.map((dimension) => (
          <Field key={dimension.key} label={`${dimension.label} (m)`}>
            <PreciseNumberInput
              aria-label={`Mass definition ${index + 1} ${dimension.label.toLowerCase()} in meters`}
              value={definition.dimensions[dimension.key] ?? 0}
              min={0}
              onInteractionStart={push}
              onCommit={(value) =>
                patch({ dimensions: { ...definition.dimensions, [dimension.key]: value } })
              }
            />
          </Field>
        ))}
        {source !== 'mass' && (
          <span className="text-xs text-fg-muted">
            Definition mass:{' '}
            {resolvedMass == null
              ? 'unresolved'
              : `${resolvedMass.toLocaleString(undefined, { maximumFractionDigits: 4 })} kg`}
          </span>
        )}
        {shape.revolved && (
          <div className="flex flex-col gap-2">
            <Switch
              isSelected={definition.sweepRad != null}
              onChange={(enabled) => {
                pushUndo('mass sweep');
                patch({ sweepRad: enabled ? Math.PI * 2 : null });
              }}
            >
              Custom revolution sweep
            </Switch>
            {definition.sweepRad != null && (
              <Field label="Sweep (°)">
                <PreciseNumberInput
                  aria-label={`Mass definition ${index + 1} sweep in degrees`}
                  value={definition.sweepRad * RAD2DEG}
                  min={0}
                  max={360}
                  onInteractionStart={push}
                  onCommit={(degrees) => patch({ sweepRad: degrees * DEG2RAD })}
                />
              </Field>
            )}
          </div>
        )}
        {definition.shape === 'CustomMass' && (
          <div className="flex flex-col gap-2">
            <Switch
              isSelected={definition.massSpecificInertia != null}
              onChange={(enabled) => {
                pushUndo('custom mass inertia');
                patch({ massSpecificInertia: enabled ? { ixx: 1, iyy: 1, izz: 1 } : null });
              }}
            >
              Custom mass-specific inertia
            </Switch>
            {definition.massSpecificInertia != null && (
              <>
                <span className="text-xs text-fg-subtle">
                  Principal inertia divided by mass (m²)
                </span>
                {(['ixx', 'iyy', 'izz'] as const).map((axis) => (
                  <Field key={axis} label={axis.toUpperCase()}>
                    <PreciseNumberInput
                      aria-label={`Mass definition ${index + 1} ${axis} mass-specific inertia`}
                      value={definition.massSpecificInertia?.[axis] ?? 0}
                      min={0}
                      onInteractionStart={push}
                      onCommit={(value) =>
                        patch({
                          massSpecificInertia: {
                            ...definition.massSpecificInertia!,
                            [axis]: value,
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </>
            )}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-fg-subtle">Location (assembly frame, m)</span>
          <Vec3Field
            label="Position"
            labelWidth="w-14"
            value={definition.locationAsmb}
            onInteractionStart={push}
            onCommit={(axis, value) =>
              patch({ locationAsmb: { ...definition.locationAsmb, [axis]: value } })
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-fg-subtle">Orientation (°)</span>
          <Vec3Field
            label="Rotation"
            labelWidth="w-14"
            value={{
              x: definition.paf2Asmb.x * RAD2DEG,
              y: definition.paf2Asmb.y * RAD2DEG,
              z: definition.paf2Asmb.z * RAD2DEG,
            }}
            onInteractionStart={push}
            onCommit={(axis, degrees) =>
              patch({ paf2Asmb: { ...definition.paf2Asmb, [axis]: degrees * DEG2RAD } })
            }
          />
        </div>
        {(definition.unknownChildren.length > 0 ||
          Object.keys(definition.unknownAttrs).length > 0) && (
          <span className="text-xs text-fg-subtle">
            Additional imported XML on this definition is preserved on export.
          </span>
        )}
      </ItemCard>
    </div>
  );
}
